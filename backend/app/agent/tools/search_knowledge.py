from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.core.config import settings
from app.integrations.openai_adapter import OpenAIAdapter
from app.models import Concept, Document, DocumentChunk, GraphEdge, GraphNode
from app.services.knowledge_service import get_setting, search_local
from app.utils.citations import map_external_chunk
from app.utils.text import excerpt


def _error(code: str, message: str, *, retryable: bool, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "details": details or {},
            "suggested_next_action": "질의를 좁혀 다시 검색하세요." if retryable else "다른 도구를 사용하거나 근거 부족을 알리세요.",
        },
    }


def _node_ids(session: Session, *, document_id: int | None = None, chunk_id: int | None = None) -> tuple[str | None, str | None]:
    document_node = session.exec(select(GraphNode).where(GraphNode.node_type == "document", GraphNode.document_id == document_id)).first() if document_id else None
    chunk_node = session.exec(select(GraphNode).where(GraphNode.node_type == "chunk", GraphNode.chunk_id == chunk_id)).first() if chunk_id else None
    return document_node.public_id if document_node else None, chunk_node.public_id if chunk_node else None


def _concepts_for_chunk(session: Session, chunk_id: int) -> list[dict[str, Any]]:
    edges = session.exec(select(GraphEdge).where(GraphEdge.evidence_chunk_id == chunk_id)).all()
    node_ids = {node_id for edge in edges for node_id in (edge.source_node_id, edge.target_node_id)}
    nodes = session.exec(select(GraphNode).where(GraphNode.id.in_(node_ids), GraphNode.node_type == "concept")).all() if node_ids else []
    concept_ids = {node.concept_id for node in nodes if node.concept_id}
    concepts = session.exec(select(Concept).where(Concept.id.in_(concept_ids), Concept.deleted_at.is_(None))).all() if concept_ids else []
    return [
        {
            "id": concept.public_id,
            "type": concept.concept_type,
            "canonical_name": concept.canonical_name,
            "korean_name": concept.korean_name,
            "english_name": concept.english_name,
            "acronym": concept.acronym,
            "overview": concept.description[:400],
        }
        for concept in concepts
    ]


def _local_item(session: Session, item: dict[str, Any], *, rank: int, file_id: str = "", openai_content: str | None = None, match_type: str | None = None, score: float | None = None) -> dict[str, Any] | None:
    document: Document = item["document"]
    chunk: DocumentChunk | None = item.get("chunk")
    if document.deleted_at or document.ingest_status != "ready":
        return None
    document_node_id, chunk_node_id = _node_ids(session, document_id=document.id, chunk_id=chunk.id if chunk else None)
    content = openai_content or item.get("content") or document.content
    return {
        "rank": rank,
        "openai_chunk": {"content": content, "file_id": file_id, "score": float(score if score is not None else item.get("score", 0))},
        "local_chunk": {
            "id": chunk.public_id if chunk else None,
            "node_id": chunk_node_id,
            "ordinal": chunk.ordinal if chunk else None,
            "start_char": chunk.start_char if chunk else None,
            "end_char": chunk.end_char if chunk else None,
            "match_type": match_type or item.get("match_type", "lexical"),
        },
        "document": {
            "id": document.public_id,
            "node_id": document_node_id,
            "title": document.title,
            "source_name": document.source_name,
            "source_format": document.source_format,
        },
        "concepts": _concepts_for_chunk(session, chunk.id) if chunk else [],
        "evidence": {
            "excerpt": excerpt(content, 800),
            "url": f"/api/knowledge/documents/{document.public_id}",
        },
    }


def execute(session: Session, arguments: dict[str, Any]) -> dict[str, Any]:
    query = str(arguments.get("query") or "").strip()
    if not query or len(query) > 1000:
        return _error("INVALID_ARGUMENT", "search_knowledge의 query는 1~1000자여야 합니다.", retryable=False, details={"field": "query"})
    requested_ids = {str(value).strip() for value in arguments.get("document_ids", []) if str(value).strip()}
    adapter = OpenAIAdapter()
    vector_id = settings.openai_vector_store_id or get_setting(session, "vector_store_id")
    candidates: dict[tuple[str, str | None], dict[str, Any]] = {}
    warnings: list[dict[str, Any]] = []

    local_items = search_local(session, query, 20)
    for item in local_items:
        if requested_ids and item["document"].public_id not in requested_ids:
            continue
        candidate = _local_item(session, item, rank=0)
        if candidate:
            key = (candidate["document"]["id"], candidate["local_chunk"]["id"])
            candidates[key] = {"candidate": candidate, "score": candidate["openai_chunk"]["score"]}

    if adapter.configured and vector_id:
        try:
            hits = adapter.search(vector_id, query, 10)
            ready_documents = session.exec(select(Document).where(Document.deleted_at.is_(None), Document.ingest_status == "ready")).all()
            if requested_ids:
                ready_documents = [doc for doc in ready_documents if doc.public_id in requested_ids]
            for hit in hits:
                document = next((doc for doc in ready_documents if doc.openai_file_id == hit.get("file_id")), None)
                if not document:
                    continue
                chunks = session.exec(select(DocumentChunk).where(DocumentChunk.document_id == document.id)).all()
                chunk, match_type = map_external_chunk(hit.get("content", ""), chunks)
                if not chunk:
                    continue
                candidate = _local_item(session, {"document": document, "chunk": chunk, "content": hit.get("content", "")}, rank=0, file_id=hit.get("file_id", ""), openai_content=hit.get("content", ""), match_type=match_type, score=hit.get("score", 0))
                if candidate:
                    key = (document.public_id, chunk.public_id)
                    if key not in candidates or candidate["openai_chunk"]["score"] > candidates[key]["score"]:
                        candidates[key] = {"candidate": candidate, "score": candidate["openai_chunk"]["score"]}
        except Exception as exc:
            code = getattr(exc, "code", "OPENAI_PROVIDER_ERROR")
            warnings.append({"code": code, "message": str(getattr(exc, "message", exc)), "retryable": True})
    elif not vector_id:
        warnings.append({"code": "VECTOR_STORE_NOT_READY", "message": "OpenAI Vector Store가 설정되지 않아 로컬 검색만 수행했습니다.", "retryable": True})

    ordered = sorted(candidates.values(), key=lambda value: value["score"], reverse=True)[:3]
    results = []
    for rank, value in enumerate(ordered, 1):
        item = value["candidate"]
        item["rank"] = rank
        results.append(item)
    return {
        "ok": True,
        "data": {
            "query": query,
            "results": results,
            "count": len(results),
            "insufficient_evidence": not results,
            "warnings": warnings,
            "truncated": bool(len(candidates) > 3),
        },
    }
