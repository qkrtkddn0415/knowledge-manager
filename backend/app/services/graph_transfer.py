from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.models import Concept, ConceptAlias, Document, DocumentChunk, GraphEdge, GraphNode
from app.services.knowledge_service import sync_all_fts
from app.utils.text import normalize_key, normalize_text


GRAPH_FORMAT = "second-brain-property-graph"
GRAPH_VERSION = 1


def _safe_type(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9_]", "_", value or "RELATED").strip("_")
    return value.upper() or "RELATED"


def _valid_uuid(value: Any) -> str | None:
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def build_graph_export(session: Session) -> dict[str, Any]:
    documents = {item.id: item for item in session.exec(select(Document).where(Document.deleted_at.is_(None))).all() if item.id is not None}
    chunks = {item.id: item for item in session.exec(select(DocumentChunk)).all() if item.id is not None and item.document_id in documents}
    concepts = {item.id: item for item in session.exec(select(Concept).where(Concept.deleted_at.is_(None))).all() if item.id is not None}
    rows = session.exec(select(GraphNode)).all()
    edges = [item for item in session.exec(select(GraphEdge)).all() if item.evidence_chunk_id in chunks]
    active_node_ids = {node_id for edge in edges for node_id in (edge.source_node_id, edge.target_node_id)}

    nodes: list[dict[str, Any]] = []
    node_ids: set[int] = set()
    for node in rows:
        if node.node_type == "document" and node.document_id in documents:
            document = documents[node.document_id]
            properties = {
                "public_id": document.public_id,
                "title": document.title,
                "source_name": document.source_name,
                "source_format": document.source_format,
                "content": document.content,
                "summary": document.summary,
                "content_hash": document.content_hash,
            }
        elif node.node_type == "chunk" and node.chunk_id in chunks:
            chunk = chunks[node.chunk_id]
            properties = {
                "public_id": chunk.public_id,
                "document_id": documents[chunk.document_id].public_id,
                "ordinal": chunk.ordinal,
                "start_char": chunk.start_char,
                "end_char": chunk.end_char,
                "text": chunk.text,
                "content_hash": chunk.content_hash,
            }
        elif node.node_type == "concept" and node.concept_id in concepts and node.id in active_node_ids:
            concept = concepts[node.concept_id]
            aliases = session.exec(select(ConceptAlias).where(ConceptAlias.concept_id == concept.id)).all()
            properties = {
                "public_id": concept.public_id,
                "concept_type": concept.concept_type,
                "canonical_name": concept.canonical_name,
                "korean_name": concept.korean_name,
                "english_name": concept.english_name,
                "acronym": concept.acronym,
                "normalized_key": concept.normalized_key,
                "description": concept.description,
                "aliases": [alias.alias for alias in aliases],
            }
        else:
            continue
        node_ids.add(node.id)
        entity_id = properties.get("public_id")
        nodes.append({
            "id": node.public_id,
            "labels": [node.node_type.capitalize()],
            "node_type": node.node_type,
            "entity_id": entity_id,
            "properties": properties,
        })

    node_public_ids = {node.id: item["id"] for node in rows if node.id in node_ids for item in nodes if item["id"] == node.public_id}
    exported_edges = []
    for edge in edges:
        if edge.source_node_id not in node_ids or edge.target_node_id not in node_ids:
            continue
        evidence = chunks.get(edge.evidence_chunk_id)
        source_id = node_public_ids.get(edge.source_node_id)
        target_id = node_public_ids.get(edge.target_node_id)
        if not source_id or not target_id or not evidence:
            continue
        exported_edges.append({
            "id": edge.public_id,
            "source": source_id,
            "target": target_id,
            "type": _safe_type(edge.relation_type),
            "properties": {
                "relation_type": edge.relation_type,
                "label": edge.label,
                "evidence_chunk_id": evidence.public_id,
                "evidence_text": edge.evidence_text,
                "confidence": edge.confidence,
                "origin": edge.origin,
            },
        })
    return {
        "format": GRAPH_FORMAT,
        "version": GRAPH_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "id_policy": "node and entity IDs are stable UUID public IDs; frontend satellite IDs are excluded",
        "nodes": nodes,
        "edges": exported_edges,
        "counts": {"nodes": len(nodes), "edges": len(exported_edges)},
    }


def _properties(item: dict[str, Any]) -> dict[str, Any]:
    value = item.get("properties")
    return value if isinstance(value, dict) else item


def import_graph(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    graph = payload.get("graph") if isinstance(payload.get("graph"), dict) else payload
    nodes = graph.get("nodes") if isinstance(graph.get("nodes"), list) else []
    edges = graph.get("edges") if isinstance(graph.get("edges"), list) else graph.get("links", [])
    if not nodes and not edges:
        raise ValueError("nodes 또는 edges가 포함된 property-graph JSON이 필요합니다.")

    external_nodes = {str(item.get("id")): item for item in nodes if isinstance(item, dict) and item.get("id") is not None}
    node_map: dict[str, GraphNode] = {}
    document_map: dict[str, Document] = {}
    chunk_map: dict[str, DocumentChunk] = {}
    imported_nodes = imported_edges = skipped_nodes = skipped_edges = 0
    fallback_document: Document | None = None
    fallback_chunk: DocumentChunk | None = None

    def ensure_fallback() -> tuple[Document, DocumentChunk]:
        nonlocal fallback_document, fallback_chunk
        if fallback_document and fallback_chunk:
            return fallback_document, fallback_chunk
        content = "External property-graph import metadata."
        fallback_document = Document(title="External graph import", source_name="external-graph.json", source_format="json", original_path="external://graph", content=content, content_hash=hashlib.sha256(content.encode()).hexdigest(), content_chars=len(content), summary="Imported graph nodes without a source document.", ingest_status="ready")
        session.add(fallback_document); session.flush()
        fallback_chunk = DocumentChunk(document_id=fallback_document.id, ordinal=0, start_char=0, end_char=len(content), text=content, normalized_text=normalize_text(content), content_hash=hashlib.sha256(content.encode()).hexdigest())
        session.add(fallback_chunk); session.flush()
        fallback_node = GraphNode(node_type="document", document_id=fallback_document.id)
        session.add(fallback_node); session.flush()
        return fallback_document, fallback_chunk

    # Documents establish the source and provenance required by SQLite graph edges.
    for external_id, item in external_nodes.items():
        node_type = str(item.get("node_type") or "").lower()
        labels = [str(label).lower() for label in item.get("labels", [])] if isinstance(item.get("labels"), list) else []
        if node_type != "document" and "document" not in labels:
            continue
        props = _properties(item)
        content = str(props.get("content") or props.get("text") or props.get("summary") or props.get("title") or "Imported document")
        incoming_public_id = _valid_uuid(props.get("public_id") or item.get("entity_id"))
        document = session.exec(select(Document).where(Document.public_id == incoming_public_id)).first() if incoming_public_id else None
        content_hash = str(props.get("content_hash") or hashlib.sha256(content.encode()).hexdigest())[:64]
        if not document:
            document = session.exec(select(Document).where(Document.content_hash == content_hash, Document.deleted_at.is_(None))).first()
        if not document:
            document_kwargs = {"title": str(props.get("title") or props.get("source_name") or "Imported document")[:200], "source_name": str(props.get("source_name") or props.get("title") or "external-graph.json")[:300], "source_format": str(props.get("source_format") or "json")[:10], "original_path": "external://graph", "content": content, "content_hash": content_hash, "content_chars": len(content), "summary": str(props.get("summary") or "")[:2000], "ingest_status": "ready"}
            if incoming_public_id:
                document_kwargs["public_id"] = incoming_public_id
            document = Document(**document_kwargs)
            session.add(document); session.flush(); imported_nodes += 1
        document_map[external_id] = document
        document_map[document.public_id] = document
        graph_node = session.exec(select(GraphNode).where(GraphNode.document_id == document.id, GraphNode.node_type == "document")).first()
        if not graph_node:
            graph_node = GraphNode(node_type="document", document_id=document.id); session.add(graph_node); session.flush()
        node_map[external_id] = graph_node

        incoming_chunks = [child for child in external_nodes.values() if str(child.get("node_type") or "").lower() == "chunk" and str(_properties(child).get("document_id") or "") in {external_id, document.public_id}]
        if not incoming_chunks:
            existing_chunk = session.exec(select(DocumentChunk).where(DocumentChunk.document_id == document.id).order_by(DocumentChunk.ordinal)).first()
            if not existing_chunk:
                existing_chunk = DocumentChunk(document_id=document.id, ordinal=0, start_char=0, end_char=len(content), text=content, normalized_text=normalize_text(content), content_hash=hashlib.sha256(content.encode()).hexdigest())
                session.add(existing_chunk); session.flush()
            chunk_map[external_id] = existing_chunk

    # Chunks and concepts are then attached to their source document.
    for external_id, item in external_nodes.items():
        node_type = str(item.get("node_type") or "").lower()
        props = _properties(item)
        if node_type == "chunk":
            parent_key = str(props.get("document_id") or "")
            document = document_map.get(parent_key)
            if not document:
                document = next(iter(document_map.values()), None) or ensure_fallback()[0]
            ordinal = int(props.get("ordinal") or 0)
            chunk = session.exec(select(DocumentChunk).where(DocumentChunk.document_id == document.id, DocumentChunk.ordinal == ordinal)).first()
            text = str(props.get("text") or props.get("content") or "Imported chunk")
            if not chunk:
                chunk = DocumentChunk(document_id=document.id, ordinal=ordinal, start_char=int(props.get("start_char") or 0), end_char=int(props.get("end_char") or len(text)), text=text, normalized_text=normalize_text(text), content_hash=str(props.get("content_hash") or hashlib.sha256(text.encode()).hexdigest())[:64])
                session.add(chunk); session.flush(); imported_nodes += 1
            chunk_map[external_id] = chunk
            graph_node = session.exec(select(GraphNode).where(GraphNode.chunk_id == chunk.id, GraphNode.node_type == "chunk")).first()
            if not graph_node:
                graph_node = GraphNode(node_type="chunk", chunk_id=chunk.id, document_id=document.id); session.add(graph_node); session.flush()
            node_map[external_id] = graph_node
        elif node_type == "concept" or (isinstance(item.get("labels"), list) and "concept" in [str(label).lower() for label in item["labels"]]):
            concept_type = str(props.get("concept_type") or "document")[:40]
            canonical_name = str(props.get("canonical_name") or props.get("name") or item.get("id") or "Imported concept")[:300]
            key = normalize_key(str(props.get("normalized_key") or canonical_name))[:300]
            concept = session.exec(select(Concept).where(Concept.concept_type == concept_type, Concept.normalized_key == key, Concept.deleted_at.is_(None))).first()
            if not concept:
                concept = Concept(concept_type=concept_type, canonical_name=canonical_name, korean_name=props.get("korean_name"), english_name=props.get("english_name"), acronym=props.get("acronym"), normalized_key=key, description=str(props.get("description") or "")[:2000], source_count=0)
                session.add(concept); session.flush(); imported_nodes += 1
            aliases = props.get("aliases") if isinstance(props.get("aliases"), list) else []
            for alias in aliases:
                alias_text = str(alias).strip()
                if alias_text and not session.exec(select(ConceptAlias).where(ConceptAlias.concept_id == concept.id, ConceptAlias.normalized_alias == normalize_key(alias_text))).first():
                    session.add(ConceptAlias(concept_id=concept.id, alias=alias_text[:300], normalized_alias=normalize_key(alias_text)[:300], alias_type="imported"))
            graph_node = session.exec(select(GraphNode).where(GraphNode.concept_id == concept.id, GraphNode.node_type == "concept")).first()
            if not graph_node:
                graph_node = GraphNode(node_type="concept", concept_id=concept.id); session.add(graph_node); session.flush()
            node_map[external_id] = graph_node

    if not document_map:
        ensure_fallback()
    default_chunk = next(iter(chunk_map.values()), None) or ensure_fallback()[1]
    existing_keys = {(edge.source_node_id, edge.target_node_id, edge.relation_type, edge.evidence_chunk_id) for edge in session.exec(select(GraphEdge)).all()}
    for item in edges:
        if not isinstance(item, dict):
            skipped_edges += 1; continue
        source = node_map.get(str(item.get("source") or item.get("from") or ""))
        target = node_map.get(str(item.get("target") or item.get("to") or ""))
        if not source or not target or source.id == target.id:
            skipped_edges += 1; continue
        props = _properties(item)
        evidence = chunk_map.get(str(props.get("evidence_chunk_id") or item.get("evidence_chunk_id") or "")) or default_chunk
        relation_type = str(props.get("relation_type") or item.get("type") or "related")[:50]
        key = (source.id, target.id, relation_type, evidence.id)
        if key in existing_keys:
            skipped_edges += 1; continue
        session.add(GraphEdge(source_node_id=source.id, target_node_id=target.id, relation_type=relation_type, label=str(props.get("label") or relation_type)[:200], evidence_chunk_id=evidence.id, evidence_text=str(props.get("evidence_text") or "Imported relationship")[:1000], confidence=max(0, min(float(props.get("confidence", 0.7) or 0.7), 1)), origin="imported"))
        existing_keys.add(key); imported_edges += 1
    session.commit()
    sync_all_fts(session)
    return {"format": graph.get("format", "external-property-graph"), "version": graph.get("version", 1), "imported_nodes": imported_nodes, "imported_edges": imported_edges, "skipped_nodes": skipped_nodes, "skipped_edges": skipped_edges}


def graph_export_bytes(session: Session) -> bytes:
    return json.dumps(build_graph_export(session), ensure_ascii=False, indent=2).encode("utf-8")
