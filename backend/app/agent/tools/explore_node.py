from __future__ import annotations

import re
from typing import Any

from sqlmodel import Session, select

from app.core.config import settings
from app.models import Concept, ConceptAlias, Document, DocumentChunk, GraphEdge, GraphNode
from app.utils.text import excerpt, normalize_key


def _failure(code: str, message: str, *, retryable: bool = False, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "details": details or {},
            "suggested_next_action": "노드 ID를 확인하고 필요한 노드만 다시 탐색하세요.",
        },
    }


def _resolve_node(session: Session, value: str) -> GraphNode | None:
    node = session.exec(select(GraphNode).where(GraphNode.public_id == value)).first()
    if node:
        return node
    # Frontend satellite IDs are UI-only. Accept a trailing canonical public ID when present.
    for part in reversed(re.split(r"[-_:]", value)):
        if len(part) >= 32:
            node = session.exec(select(GraphNode).where(GraphNode.public_id == part)).first()
            if node:
                return node
    return None


def _active_edge(session: Session, edge: GraphEdge) -> tuple[DocumentChunk, Document] | None:
    chunk = session.get(DocumentChunk, edge.evidence_chunk_id)
    document = session.get(Document, chunk.document_id) if chunk else None
    if not chunk or not document or document.deleted_at or document.ingest_status != "ready":
        return None
    return chunk, document


def _node_view(session: Session, node: GraphNode) -> dict[str, Any]:
    if node.node_type == "document" and node.document_id:
        doc = session.get(Document, node.document_id)
        return {"id": node.public_id, "node_type": node.node_type, "label": doc.title if doc else "문서", "overview": excerpt(doc.summary or doc.content, 400) if doc else ""}
    if node.node_type == "chunk" and node.chunk_id:
        chunk = session.get(DocumentChunk, node.chunk_id)
        return {"id": node.public_id, "node_type": node.node_type, "label": f"청크 {(chunk.ordinal + 1) if chunk else ''}", "overview": excerpt(chunk.text, 400) if chunk else ""}
    concept = session.get(Concept, node.concept_id) if node.concept_id else None
    return {
        "id": node.public_id,
        "node_type": node.node_type,
        "label": concept.canonical_name if concept else "개념",
        "overview": concept.description[:400] if concept else "",
        "concept_type": concept.concept_type if concept else None,
        "korean_name": concept.korean_name if concept else None,
        "english_name": concept.english_name if concept else None,
        "acronym": concept.acronym if concept else None,
    }


def _terms_for_node(session: Session, node: GraphNode) -> list[str]:
    values: list[str] = []
    if node.node_type == "concept" and node.concept_id:
        concept = session.get(Concept, node.concept_id)
        if concept and not concept.deleted_at:
            values.extend([concept.canonical_name, concept.korean_name or "", concept.english_name or "", concept.acronym or ""])
            values.extend(alias.alias for alias in session.exec(select(ConceptAlias).where(ConceptAlias.concept_id == concept.id)).all())
    elif node.node_type == "document" and node.document_id:
        document = session.get(Document, node.document_id)
        if document:
            values.extend([document.title, document.source_name])
    elif node.node_type == "chunk" and node.chunk_id:
        chunk = session.get(DocumentChunk, node.chunk_id)
        if chunk:
            values.append(chunk.text[:200])
    return list(dict.fromkeys(value.strip() for value in values if value and len(value.strip()) >= 2))


def _occurrences(text: str, terms: list[str], max_excerpts: int) -> list[dict[str, Any]]:
    hits: list[tuple[int, int, str]] = []
    folded = text.casefold()
    for term in sorted(terms, key=len, reverse=True):
        needle = term.casefold()
        start = 0
        while needle:
            position = folded.find(needle, start)
            if position < 0:
                break
            hits.append((position, position + len(term), term))
            start = position + max(1, len(needle))
    windows: list[dict[str, Any]] = []
    for start, end, term in sorted(hits):
        left = max(0, start - 500)
        right = min(len(text), end + 500)
        if windows and left <= windows[-1]["end"]:
            windows[-1]["end"] = max(windows[-1]["end"], right)
            windows[-1]["matched_terms"] = list(dict.fromkeys([*windows[-1]["matched_terms"], term]))
        else:
            windows.append({"start_char": left, "end_char": right, "matched_terms": [term]})
    for item in windows[:max_excerpts]:
        item["excerpt"] = text[item["start_char"] : item["end_char"]]
    return windows[:max_excerpts]


def execute(session: Session, arguments: dict[str, Any]) -> dict[str, Any]:
    raw_ids = arguments.get("node_ids")
    if not isinstance(raw_ids, list) or not 1 <= len(raw_ids) <= 8:
        return _failure("INVALID_ARGUMENT", "explore_node의 node_ids는 1~8개여야 합니다.", details={"field": "node_ids"})
    max_excerpts = min(max(int(arguments.get("max_excerpts_per_node", 8) or 8), 1), 12)
    if int(arguments.get("context_chars", 500) or 500) != 500:
        return _failure("INVALID_ARGUMENT", "context_chars는 정확히 500이어야 합니다.", details={"field": "context_chars"})
    requested = list(dict.fromkeys(str(value).strip() for value in raw_ids if str(value).strip()))
    nodes = [_resolve_node(session, value) for value in requested]
    missing = [value for value, node in zip(requested, nodes) if node is None]
    nodes = [node for node in nodes if node is not None]
    if not nodes:
        return _failure("NODE_NOT_FOUND", "탐색할 활성 그래프 노드를 찾지 못했습니다.", details={"node_ids": missing})

    node_outputs: list[dict[str, Any]] = []
    total_chars = 0
    truncated = False
    for node in nodes:
        edges = session.exec(select(GraphEdge).where((GraphEdge.source_node_id == node.id) | (GraphEdge.target_node_id == node.id))).all()
        valid_edges = [(edge, _active_edge(session, edge)) for edge in edges]
        valid_edges = [(edge, evidence) for edge, evidence in valid_edges if evidence]
        related_nodes: dict[int, GraphNode] = {}
        relations = []
        chunks: dict[int, tuple[DocumentChunk, Document]] = {}
        for edge, evidence in valid_edges:
            assert evidence is not None
            chunk, document = evidence
            chunks[chunk.id] = (chunk, document)
            neighbor_id = edge.target_node_id if edge.source_node_id == node.id else edge.source_node_id
            neighbor = session.get(GraphNode, neighbor_id)
            if not neighbor:
                continue
            related_nodes[neighbor.id] = neighbor
            relations.append({
                "id": edge.public_id,
                "neighbor_id": neighbor.public_id,
                "relation_type": edge.relation_type,
                "label": edge.label,
                "confidence": edge.confidence,
                "evidence_chunk_id": chunk.public_id,
                "evidence": excerpt(edge.evidence_text, 300),
            })
        terms = _terms_for_node(session, node)
        occurrences = []
        for chunk, document in chunks.values():
            for occurrence in _occurrences(chunk.text, terms, max_excerpts):
                total_chars += len(occurrence["excerpt"])
                if total_chars > settings.agent_max_output_chars:
                    truncated = True
                    break
                occurrences.append({"chunk_id": chunk.public_id, "document_id": document.public_id, **occurrence})
            if truncated:
                break
        node_outputs.append({
            "node": _node_view(session, node),
            "related_nodes": [_node_view(session, related) for related in list(related_nodes.values())[:100]],
            "relations": relations[:200],
            "source_chunks": [
                {"id": chunk.public_id, "document_id": document.public_id, "document_title": document.title, "ordinal": chunk.ordinal}
                for chunk, document in list(chunks.values())[:100]
            ],
            "occurrences": occurrences,
            "terms": terms,
        })
        if truncated:
            break
    return {
        "ok": True,
        "data": {
            "nodes": node_outputs,
            "missing_node_ids": missing,
            "truncated": truncated,
            "searched_context_chars": 500,
        },
    }
