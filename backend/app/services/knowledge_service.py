import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, text
from sqlmodel import Session, select

from app.core.config import settings
from app.core.constants import CONCEPT_TYPES
from app.core.errors import DomainError
from app.db import engine, ensure_fts
from app.integrations.openai_adapter import OpenAIAdapter
from app.models import AppSetting, Concept, ConceptAlias, Document, DocumentChunk, GraphEdge, GraphNode, IngestionJob, SearchHistory, SearchHistorySource
from app.storage.local_files import delete_original, save_original
from app.utils.citations import map_external_chunk
from app.utils.hashing import sha256_text
from app.utils.text import excerpt, normalize_key, normalize_text, split_chunks


def now() -> datetime:
    return datetime.now(timezone.utc)


def json_load(value: str | None, default: Any) -> Any:
    try:
        return json.loads(value) if value else default
    except (TypeError, json.JSONDecodeError):
        return default


def set_step(session: Session, job: IngestionJob, document: Document, step: str, progress: int, status: str = "running") -> None:
    job.current_step, job.progress, job.status, job.updated_at = step, progress, status, now()
    document.updated_at = now()
    session.add(job)
    session.add(document)
    session.commit()


def get_setting(session: Session, key: str) -> Any:
    setting = session.get(AppSetting, key)
    return json_load(setting.value_json, None) if setting else None


def put_setting(session: Session, key: str, value: Any, secret: bool = False) -> None:
    setting = session.get(AppSetting, key)
    if not setting:
        setting = AppSetting(key=key, value_json=json.dumps(value, ensure_ascii=False), is_secret=secret)
    else:
        setting.value_json, setting.updated_at, setting.is_secret = json.dumps(value, ensure_ascii=False), now(), secret
    session.add(setting)
    session.commit()


def create_ingestion(session: Session, raw: bytes, filename: str, title: str | None = None, source_name: str | None = None, extracted_text: str | None = None) -> tuple[Document, IngestionJob]:
    suffix = "." + filename.lower().rsplit(".", 1)[-1] if "." in filename else ".txt"
    if suffix not in {".txt", ".md", ".pdf"}: suffix = ".txt"
    if extracted_text is not None:
        content = extracted_text
    else:
        try:
            content = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            content = raw.decode("cp949", errors="replace")
    content = normalize_text(content)
    if not content:
        raise DomainError("EMPTY_DOCUMENT", "문서 내용이 비어 있습니다.", 422)
    content_hash = sha256_text(content)
    duplicate = session.exec(select(Document).where(Document.content_hash == content_hash, Document.deleted_at.is_(None))).first()
    has_materialized_graph = False
    if duplicate:
        has_document_node = session.exec(select(GraphNode.id).where(GraphNode.document_id == duplicate.id)).first() is not None
        concept_node_ids = select(GraphNode.id).where(GraphNode.node_type == "concept")
        has_concept_edge = session.exec(select(GraphEdge.id).join(DocumentChunk, GraphEdge.evidence_chunk_id == DocumentChunk.id).where(DocumentChunk.document_id == duplicate.id, (GraphEdge.source_node_id.in_(concept_node_ids) | GraphEdge.target_node_id.in_(concept_node_ids)))).first() is not None
        has_materialized_graph = has_document_node and has_concept_edge
    if duplicate and duplicate.ingest_status not in {"failed", "draft", "ready"}:
        raise DomainError("DUPLICATE_DOCUMENT", "같은 내용의 자료가 이미 저장되어 있습니다.", 409)
    if duplicate and duplicate.ingest_status == "ready" and has_materialized_graph:
        raise DomainError("DUPLICATE_DOCUMENT", "같은 내용의 자료가 이미 저장되어 있습니다.", 409)
    if duplicate:
        try:
            delete_original(duplicate.original_path)
        except (OSError, ValueError):
            pass
        duplicate.deleted_at = now()
        duplicate.ingest_status = "deleted"
        duplicate.updated_at = now()
        session.add(duplicate)
        session.commit()
        # A failed/incomplete duplicate may already have chunks or graph
        # material. Treat replacement as source deletion so no old evidence
        # edge or orphan concept remains in the new graph.
        cleanup_deleted_document(session, duplicate.id or 0)
        session.commit()
    document = Document(title=(title or filename.rsplit(".", 1)[0])[:200], source_name=(source_name or filename)[:300], source_format=suffix[1:], original_path="pending", content=content, content_hash=content_hash, content_chars=len(content), ingest_status="draft")
    session.add(document)
    session.flush()
    relative_path, _ = save_original(document.public_id, suffix, raw)
    document.original_path = relative_path
    document.updated_at = now()
    job = IngestionJob(document_id=document.id or 0, job_type="ingest", status="queued", current_step="validating")
    session.add(job)
    session.commit()
    session.refresh(document)
    session.refresh(job)
    return document, job


def run_ingestion(job_public_id: str) -> None:
    with Session(engine) as session:
        job = session.exec(select(IngestionJob).where(IngestionJob.public_id == job_public_id)).first()
        if not job or job.status not in {"queued", "running"}:
            return
        document = session.get(Document, job.document_id)
        if not document:
            return
        try:
            job.status, job.started_at, job.attempt = "running", now(), job.attempt + 1
            document.ingest_status = "analyzing"
            session.add(job); session.add(document); session.commit()
            set_step(session, job, document, "storing_source", 10)
            set_step(session, job, document, "chunking", 25)
            # Re-ingestion replaces the source's chunks. Remove every edge
            # evidenced by the old chunks first; concept-to-concept edges do
            # not touch a document node, so deleting only old graph nodes
            # would leave stale relationships behind.
            old_chunk_ids = [chunk.id for chunk in session.exec(select(DocumentChunk).where(DocumentChunk.document_id == document.id)).all() if chunk.id]
            if old_chunk_ids:
                session.exec(delete(GraphEdge).where(GraphEdge.evidence_chunk_id.in_(old_chunk_ids)))
            session.exec(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
            pieces = split_chunks(document.content, settings.chunk_size_chars, settings.chunk_overlap_chars)
            chunks: list[DocumentChunk] = []
            for piece in pieces:
                chunk = DocumentChunk(document_id=document.id or 0, ordinal=int(piece["ordinal"]), start_char=int(piece["start_char"]), end_char=int(piece["end_char"]), text=str(piece["text"]), normalized_text=normalize_text(str(piece["text"])), content_hash=sha256_text(str(piece["text"])))
                session.add(chunk); chunks.append(chunk)
            session.commit()
            for chunk in chunks: session.refresh(chunk)
            adapter = OpenAIAdapter()
            vector_id = settings.openai_vector_store_id or get_setting(session, "vector_store_id")
            if adapter.configured:
                set_step(session, job, document, "uploading", 35)
                vector_id = adapter.ensure_vector_store(vector_id)
                if not settings.openai_vector_store_id: put_setting(session, "vector_store_id", vector_id)
                result = adapter.upload_and_index(settings.data_dir / document.original_path, vector_id)
                document.openai_file_id = result.get("file_id")
                document.vector_store_id = vector_id
                document.vector_store_file_id = result.get("vector_store_file_id")
                document.vector_store_file_status = result.get("status")
                set_step(session, job, document, "waiting_index", 55)
            set_step(session, job, document, "extracting", 65)
            if adapter.configured:
                # Extraction is network-bound. Run a small bounded number of
                # independent chunk requests concurrently, while keeping all
                # DB writes and progress updates in this session/thread.
                chunk_analyses_by_ordinal: dict[int, dict[str, Any]] = {}
                worker_count = min(settings.openai_extraction_workers, max(len(chunks), 1))

                def extract_chunk(chunk: DocumentChunk) -> tuple[int, dict[str, Any]]:
                    adapter_for_chunk = OpenAIAdapter()
                    extraction = adapter_for_chunk.extract(chunk.text, source_ordinal=chunk.ordinal)
                    concept_items = extraction.get("concepts", []) if isinstance(extraction.get("concepts"), list) else []
                    # A second call is intentionally adaptive: dense documents get
                    # better recall without doubling latency for already-rich chunks.
                    expected_minimum = max(
                        settings.openai_extraction_gap_min_concepts,
                        min(24, len(chunk.text.strip()) // 3_000),
                    )
                    if (
                        settings.openai_extraction_gap_pass
                        and len(chunk.text.strip()) >= settings.openai_extraction_gap_min_chars
                        and len(concept_items) < expected_minimum
                    ):
                        existing_names = [
                            str(item.get(field, "")).strip()
                            for item in concept_items
                            for field in ("canonical_name", "korean_name", "english_name", "acronym")
                            if str(item.get(field, "")).strip()
                        ]
                        gap = adapter_for_chunk.extract_gap(chunk.text, existing_names, source_ordinal=chunk.ordinal)
                        extraction["concepts"] = concept_items + (gap.get("concepts", []) if isinstance(gap.get("concepts"), list) else [])
                        extraction["relations"] = (extraction.get("relations", []) if isinstance(extraction.get("relations"), list) else []) + (gap.get("relations", []) if isinstance(gap.get("relations"), list) else [])
                    return chunk.ordinal, extraction

                with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="extract") as executor:
                    futures = [executor.submit(extract_chunk, chunk) for chunk in chunks]
                    for index, future in enumerate(as_completed(futures), start=1):
                        ordinal, extraction = future.result()
                        chunk_analyses_by_ordinal[ordinal] = extraction
                        progress = 65 + int((index / max(len(chunks), 1)) * 12)
                        set_step(session, job, document, "extracting", progress)
                chunk_analyses = [chunk_analyses_by_ordinal[chunk.ordinal] for chunk in chunks]
                analysis = merge_chunk_analyses(document, chunk_analyses)
            else:
                analysis = fallback_analysis(document)
            analysis = validate_analysis(analysis, chunks)
            job.preview_json = json.dumps(make_preview(document, chunks, analysis), ensure_ascii=False)
            job.status, job.current_step, job.progress = "review_ready", "ready", 80
            document.ingest_status = "review_ready"
            job.updated_at = document.updated_at = now()
            session.add(job); session.add(document); session.commit()
        except DomainError as exc:
            fail_job(session, job, document, exc.code, exc.message)
        except Exception:
            fail_job(session, job, document, "INTERNAL_ERROR", "자료 처리 중 오류가 발생했습니다.")


def confirm_ingestion(session: Session, job: IngestionJob, title: str, summary: str, included: list[str], excluded_relations: list[str]) -> None:
    if job.status == "succeeded":
        return
    if job.status != "review_ready":
        raise DomainError("VALIDATION_ERROR", "분석 검토가 완료된 작업만 저장할 수 있습니다.", 409)
    document = session.get(Document, job.document_id)
    if not document or document.deleted_at:
        raise DomainError("NOT_FOUND", "문서를 찾을 수 없습니다.", 404)
    preview = json_load(job.preview_json, {})
    analysis = preview.get("analysis", {})
    analysis["title"], analysis["summary"] = title, summary
    if included:
        analysis["concepts"] = [item for item in analysis.get("concepts", []) if item.get("temp_key") in included or item.get("key") in included]
    analysis["relations"] = [item for item in analysis.get("relations", []) if item.get("temp_key") not in excluded_relations and item.get("key") not in excluded_relations]
    job.status, job.current_step, job.progress = "running", "storing", 85
    document.ingest_status, document.title, document.summary = "storing", title, summary
    session.add(job); session.add(document); session.commit()
    apply_analysis(session, document, analysis)
    document.analysis_json = json.dumps(analysis, ensure_ascii=False)
    document.ingest_status, document.updated_at = "ready", now()
    job.status, job.current_step, job.progress, job.finished_at = "succeeded", "ready", 100, now()
    job.updated_at = now()
    refresh_concept_liveness(session)
    sync_document_fts(session, document)
    session.add(document); session.add(job); session.commit()


def apply_analysis(session: Session, document: Document, analysis: dict[str, Any]) -> None:
    old_nodes = session.exec(select(GraphNode).where(GraphNode.document_id == document.id)).all()
    old_node_ids = [node.id for node in old_nodes if node.id]
    if old_node_ids:
        session.exec(delete(GraphEdge).where(GraphEdge.source_node_id.in_(old_node_ids) | GraphEdge.target_node_id.in_(old_node_ids)))
    session.exec(delete(GraphNode).where(GraphNode.document_id == document.id))
    chunks = session.exec(select(DocumentChunk).where(DocumentChunk.document_id == document.id).order_by(DocumentChunk.ordinal)).all()
    document_node = GraphNode(node_type="document", document_id=document.id, is_visible_default=True)
    session.add(document_node); session.flush()
    chunk_nodes: dict[int, GraphNode] = {}
    if len(chunks) > 1:
        for chunk in chunks:
            node = GraphNode(node_type="chunk", document_id=document.id, chunk_id=chunk.id, is_visible_default=False)
            session.add(node); session.flush(); chunk_nodes[chunk.ordinal] = node
            session.add(GraphEdge(source_node_id=document_node.id, target_node_id=node.id, relation_type="contains", label="contains", evidence_chunk_id=chunk.id, evidence_text=excerpt(chunk.text, 200), confidence=1, origin="extracted"))
    concept_nodes: dict[str, GraphNode] = {}
    for item in analysis.get("concepts", []):
        kind = item.get("concept_type", "document")
        if kind not in CONCEPT_TYPES: continue
        names = [item.get("canonical_name", ""), item.get("korean_name", ""), item.get("english_name", ""), item.get("acronym", "")]
        names = [str(name).strip() for name in names if str(name).strip()]
        if not names: continue
        key = normalize_key(names[0])
        concept = session.exec(select(Concept).where(Concept.normalized_key == key, Concept.concept_type == kind, Concept.deleted_at.is_(None))).first()
        if not concept:
            concept = session.exec(select(Concept).where(Concept.normalized_key == key, Concept.concept_type == kind)).first()
            if concept:
                concept.deleted_at = None
                concept.merge_status = "confirmed"
        if not concept:
            concept = Concept(concept_type=kind, canonical_name=names[0][:300], korean_name=(names[1] if len(names) > 1 else None), english_name=(names[2] if len(names) > 2 else None), acronym=(names[3] if len(names) > 3 else None), normalized_key=key, description=str(item.get("description", ""))[:500], merge_status="confirmed")
            session.add(concept); session.flush()
        for alias_type, alias in (("korean", concept.korean_name), ("english", concept.english_name), ("acronym", concept.acronym), ("alternate", concept.canonical_name)):
            if alias:
                exists = session.exec(select(ConceptAlias).where(ConceptAlias.concept_id == concept.id, ConceptAlias.normalized_alias == normalize_key(alias))).first()
                if not exists: session.add(ConceptAlias(concept_id=concept.id, alias=alias, normalized_alias=normalize_key(alias), alias_type=alias_type, is_primary=alias == concept.canonical_name))
        node = session.exec(select(GraphNode).where(GraphNode.concept_id == concept.id)).first()
        if not node:
            node = GraphNode(node_type="concept", concept_id=concept.id, is_visible_default=True); session.add(node); session.flush()
        concept_nodes[str(item.get("key") or item.get("temp_key"))] = node
        ordinals = item.get("source_ordinals") or [item.get("source_ordinal", 0)]
        for raw_ordinal in sorted({int(value or 0) for value in ordinals}):
            chunk = next((x for x in chunks if x.ordinal == raw_ordinal), chunks[0])
            source_node = chunk_nodes.get(chunk.ordinal, document_node)
            session.add(GraphEdge(source_node_id=source_node.id, target_node_id=node.id, relation_type="mentions", label="mentions", evidence_chunk_id=chunk.id, evidence_text=excerpt(chunk.text, 200), confidence=0.9, origin="extracted"))
    for relation in analysis.get("relations", []):
        source, target = concept_nodes.get(str(relation.get("source_key"))), concept_nodes.get(str(relation.get("target_key")))
        if not source or not target or source.id == target.id: continue
        ordinals = relation.get("source_ordinals") or [relation.get("source_ordinal", 0)]
        for raw_ordinal in sorted({int(value or 0) for value in ordinals}):
            chunk = next((x for x in chunks if x.ordinal == raw_ordinal), chunks[0])
            session.add(GraphEdge(source_node_id=source.id, target_node_id=target.id, relation_type=str(relation.get("relation_type", "relates_to"))[:50], label=str(relation.get("label", "related"))[:200], evidence_chunk_id=chunk.id, evidence_text=str(relation.get("evidence", ""))[:1000], confidence=max(0, min(float(relation.get("confidence", 0.7) or 0.7), 1)), origin="extracted"))
    session.flush()
    for concept in session.exec(select(Concept)).all():
        concept.source_count = len(session.exec(select(GraphEdge).where(GraphEdge.target_node_id.in_(select(GraphNode.id).where(GraphNode.concept_id == concept.id)))).all())
        concept.updated_at = now()
    sync_all_fts(session)


def cleanup_deleted_document(session: Session, document_id: int) -> None:
    """Remove source-owned graph material without deleting shared concepts."""
    chunks = session.exec(select(DocumentChunk).where(DocumentChunk.document_id == document_id)).all()
    chunk_ids = {chunk.id for chunk in chunks if chunk.id}
    if chunk_ids:
        session.exec(delete(GraphEdge).where(GraphEdge.evidence_chunk_id.in_(chunk_ids)))
    session.exec(delete(GraphNode).where(GraphNode.document_id == document_id))
    session.flush()
    refresh_concept_liveness(session)
    sync_all_fts(session)


def refresh_concept_liveness(session: Session) -> None:
    """Keep a concept visible iff an active source still has an evidence edge."""
    active_chunks = {
        chunk.id: chunk
        for chunk in session.exec(
            select(DocumentChunk).join(Document).where(Document.deleted_at.is_(None), Document.ingest_status == "ready")
        ).all()
        if chunk.id
    }
    active_edges = session.exec(select(GraphEdge).where(GraphEdge.evidence_chunk_id.in_(set(active_chunks)))).all() if active_chunks else []
    concept_nodes = {
        node.id: node.concept_id
        for node in session.exec(select(GraphNode).where(GraphNode.node_type == "concept", GraphNode.concept_id.is_not(None))).all()
        if node.id and node.concept_id
    }
    documents_by_concept: dict[int, set[int]] = {}
    for edge in active_edges:
        concept_ids = {concept_nodes.get(edge.source_node_id), concept_nodes.get(edge.target_node_id)} - {None}
        document_id = active_chunks.get(edge.evidence_chunk_id).document_id if active_chunks.get(edge.evidence_chunk_id) else None
        if document_id is None:
            continue
        for concept_id in concept_ids:
            documents_by_concept.setdefault(int(concept_id), set()).add(document_id)
    timestamp = now()
    for concept in session.exec(select(Concept)).all():
        source_ids = documents_by_concept.get(concept.id or 0, set())
        concept.source_count = len(source_ids)
        concept.deleted_at = None if source_ids else timestamp
        concept.updated_at = timestamp
        session.add(concept)


def merge_chunk_analyses(document: Document, analyses: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge high-recall per-chunk extraction while retaining all evidence locations."""
    concepts: list[dict[str, Any]] = []
    concept_by_identity: dict[tuple[str, str], dict[str, Any]] = {}
    concept_by_name: dict[tuple[str, str], dict[str, Any]] = {}
    key_map: dict[str, str] = {}
    relation_by_identity: dict[tuple[str, str, str, str], dict[str, Any]] = {}

    for analysis in analyses:
        for raw_item in analysis.get("concepts", []) if isinstance(analysis.get("concepts"), list) else []:
            if not isinstance(raw_item, dict):
                continue
            canonical_name = str(raw_item.get("canonical_name", "")).strip()
            if not canonical_name:
                continue
            concept_type = str(raw_item.get("concept_type", "document"))
            names = [raw_item.get(field, "") for field in ("canonical_name", "korean_name", "english_name", "acronym")]
            normalized_names = [normalize_key(str(name)) for name in names if str(name).strip()]
            identity = (normalize_key(canonical_name), concept_type)
            current = next((concept_by_name.get((name, concept_type)) for name in normalized_names if concept_by_name.get((name, concept_type))), None)
            if current is None:
                current = dict(raw_item)
                current["key"] = f"c{len(concepts)}"
                current["source_ordinals"] = []
                concepts.append(current)
                concept_by_identity[identity] = current
            for name in normalized_names:
                concept_by_name[(name, concept_type)] = current
            source_ordinal = int(raw_item.get("source_ordinal", 0) or 0)
            if source_ordinal not in current["source_ordinals"]:
                current["source_ordinals"].append(source_ordinal)
            for field in ("korean_name", "english_name", "acronym", "description"):
                if not str(current.get(field, "")).strip() and str(raw_item.get(field, "")).strip():
                    current[field] = raw_item[field]
            raw_key = str(raw_item.get("key") or raw_item.get("temp_key") or "").strip()
            if raw_key:
                key_map[raw_key] = str(current["key"])

        for raw_relation in analysis.get("relations", []) if isinstance(analysis.get("relations"), list) else []:
            if not isinstance(raw_relation, dict):
                continue
            source_key = key_map.get(str(raw_relation.get("source_key", "")))
            target_key = key_map.get(str(raw_relation.get("target_key", "")))
            if not source_key or not target_key or source_key == target_key:
                continue
            relation_type = str(raw_relation.get("relation_type", "relates_to"))
            label = str(raw_relation.get("label", "related"))
            identity = (source_key, target_key, relation_type, label)
            current = relation_by_identity.get(identity)
            if current is None:
                current = dict(raw_relation)
                current["source_key"] = source_key
                current["target_key"] = target_key
                current["source_ordinals"] = []
                relation_by_identity[identity] = current
            source_ordinal = int(raw_relation.get("source_ordinal", 0) or 0)
            if source_ordinal not in current["source_ordinals"]:
                current["source_ordinals"].append(source_ordinal)
            if len(str(raw_relation.get("evidence", ""))) > len(str(current.get("evidence", ""))):
                current["evidence"] = raw_relation.get("evidence", "")
            current["confidence"] = max(float(current.get("confidence", 0.7) or 0.7), float(raw_relation.get("confidence", 0.7) or 0.7))

    title = next((str(item.get("title", "")).strip() for item in analyses if str(item.get("title", "")).strip()), document.title)
    summary = next((str(item.get("summary", "")).strip() for item in analyses if str(item.get("summary", "")).strip()), excerpt(document.content, 500))
    return {"title": title, "summary": summary, "concepts": concepts, "relations": list(relation_by_identity.values())}


def fallback_analysis(document: Document) -> dict[str, Any]:
    words = []
    for word in re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}|[가-힣]{2,}", document.content):
        if word not in words and word.lower() not in {"그리고", "대한", "통해", "있는", "있다"}: words.append(word)
    return {"title": document.title, "summary": excerpt(document.content, 500), "concepts": [{"key": f"c{i}", "concept_type": "technology", "canonical_name": word, "korean_name": word if re.search(r"[가-힣]", word) else "", "english_name": word if re.search(r"[A-Za-z]", word) else "", "acronym": "", "description": "문서에서 추출된 키워드", "source_ordinal": 0} for i, word in enumerate(words[:120])], "relations": []}


def validate_analysis(analysis: dict[str, Any], chunks: list[DocumentChunk]) -> dict[str, Any]:
    result = {"title": str(analysis.get("title", "자료"))[:200], "summary": str(analysis.get("summary", ""))[:2000], "concepts": [], "relations": []}
    for index, item in enumerate(analysis.get("concepts", []) if isinstance(analysis.get("concepts"), list) else []):
        if not isinstance(item, dict) or not str(item.get("canonical_name", "")).strip(): continue
        key = str(item.get("key") or f"c{index}")[:80]
        ordinals = item.get("source_ordinals") if isinstance(item.get("source_ordinals"), list) else [item.get("source_ordinal", 0)]
        valid_ordinals = sorted({min(max(int(value or 0), 0), max(len(chunks) - 1, 0)) for value in ordinals}) if chunks else [0]
        result["concepts"].append({"temp_key": key, "key": key, "concept_type": str(item.get("concept_type", "document")), "canonical_name": str(item.get("canonical_name"))[:300], "korean_name": str(item.get("korean_name", ""))[:300], "english_name": str(item.get("english_name", ""))[:300], "acronym": str(item.get("acronym", ""))[:100], "description": str(item.get("description", ""))[:500], "source_ordinal": valid_ordinals[0], "source_ordinals": valid_ordinals, "source_chunk_ids": [chunks[ordinal].public_id for ordinal in valid_ordinals] if chunks else []})
    keys = {item["key"] for item in result["concepts"]}
    for index, item in enumerate(analysis.get("relations", []) if isinstance(analysis.get("relations"), list) else []):
        if not isinstance(item, dict) or str(item.get("source_key")) not in keys or str(item.get("target_key")) not in keys: continue
        ordinals = item.get("source_ordinals") if isinstance(item.get("source_ordinals"), list) else [item.get("source_ordinal", 0)]
        valid_ordinals = sorted({min(max(int(value or 0), 0), max(len(chunks) - 1, 0)) for value in ordinals}) if chunks else [0]
        result["relations"].append({"temp_key": f"r{index}", "key": f"r{index}", "source_key": str(item["source_key"]), "target_key": str(item["target_key"]), "relation_type": str(item.get("relation_type", "relates_to"))[:50], "label": str(item.get("label", "related"))[:200], "evidence": str(item.get("evidence", ""))[:1000], "source_ordinal": valid_ordinals[0], "source_ordinals": valid_ordinals, "confidence": max(0, min(float(item.get("confidence", 0.7) or 0.7), 1))})
    return result


def make_preview(document: Document, chunks: list[DocumentChunk], analysis: dict[str, Any]) -> dict[str, Any]:
    return {"document_id": document.public_id, "chunk_count": len(chunks), "analysis": analysis, "chunks": [{"id": chunk.public_id, "ordinal": chunk.ordinal, "start_char": chunk.start_char, "end_char": chunk.end_char, "text_preview": excerpt(chunk.text, 500)} for chunk in chunks], "existing_concept_matches": []}


def fail_job(session: Session, job: IngestionJob, document: Document, code: str, message: str) -> None:
    job.status, job.error_code, job.error_message, job.finished_at, job.updated_at = "failed", code, message, now(), now()
    document.ingest_status, document.ingest_error_code, document.ingest_error_message, document.updated_at = "failed", code, message, now()
    session.add(job); session.add(document); session.commit()


def sync_document_fts(session: Session, document: Document) -> None:
    connection = session.connection()
    ensure_fts(connection)
    connection.exec_driver_sql("DELETE FROM documents_fts WHERE public_id = ?", (document.public_id,))
    if not document.deleted_at:
        connection.exec_driver_sql("INSERT INTO documents_fts(title, summary, source_name, public_id) VALUES (?, ?, ?, ?)", (document.title, document.summary or "", document.source_name, document.public_id))


def sync_all_fts(session: Session) -> None:
    connection = session.connection()
    ensure_fts(connection)
    connection.exec_driver_sql("DELETE FROM documents_fts"); connection.exec_driver_sql("DELETE FROM chunks_fts"); connection.exec_driver_sql("DELETE FROM concepts_fts")
    for document in session.exec(select(Document).where(Document.deleted_at.is_(None))).all(): connection.exec_driver_sql("INSERT INTO documents_fts VALUES (?, ?, ?, ?)", (document.title, document.summary or "", document.source_name, document.public_id))
    for chunk in session.exec(select(DocumentChunk).join(Document).where(Document.deleted_at.is_(None))).all(): connection.exec_driver_sql("INSERT INTO chunks_fts VALUES (?, ?)", (chunk.text, chunk.public_id))
    for concept in session.exec(select(Concept).where(Concept.deleted_at.is_(None))).all(): connection.exec_driver_sql("INSERT INTO concepts_fts VALUES (?, ?, ?, ?, ?, ?)", (concept.canonical_name, concept.korean_name or "", concept.english_name or "", concept.acronym or "", concept.description, concept.public_id))


def search_local(session: Session, query: str, limit: int = 10) -> list[dict[str, Any]]:
    stopwords = {"그리고", "대한", "the", "and", "what", "which", "how"}
    raw_terms = [term for term in re.findall(r"[A-Za-z0-9가-힣_-]{2,}", query) if term.lower() not in stopwords]
    korean_particles = ("에서", "으로", "부터", "까지", "에게", "에는", "은", "는", "이", "가", "을", "를", "의", "도", "로", "와", "과")
    terms = []
    for term in raw_terms:
        terms.append(term)
        if re.search(r"[가-힣]", term):
            for particle in korean_particles:
                if term.endswith(particle) and len(term) - len(particle) >= 2:
                    stem = term[: -len(particle)]
                    if stem not in terms:
                        terms.append(stem)
                    break
    if not terms: return []
    # Prefix matching keeps keyword search useful for inflected Korean/English tokens.
    match = " OR ".join(f'{term.replace(chr(34), "")}*' for term in terms)
    connection = session.connection()
    ensure_fts(connection)
    try:
        doc_rows = connection.exec_driver_sql("SELECT public_id, bm25(documents_fts) AS rank FROM documents_fts WHERE documents_fts MATCH ? ORDER BY rank LIMIT ?", (match, limit)).fetchall()
        chunk_rows = connection.exec_driver_sql("SELECT public_id, bm25(chunks_fts) AS rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?", (match, limit)).fetchall()
    except Exception:
        doc_rows, chunk_rows = [], []
    try:
        concept_rows = connection.exec_driver_sql("SELECT public_id, bm25(concepts_fts) AS rank FROM concepts_fts WHERE concepts_fts MATCH ? ORDER BY rank LIMIT ?", (match, limit)).fetchall()
    except Exception:
        concept_rows = []
    chunk_ids = {row[0] for row in chunk_rows}
    chunks = session.exec(select(DocumentChunk).where(DocumentChunk.public_id.in_(chunk_ids))).all() if chunk_ids else []
    chunk_by_id = {chunk.public_id: chunk for chunk in chunks}
    doc_by_chunk = {chunk.public_id: session.get(Document, chunk.document_id) for chunk in chunks}
    best_chunk_by_document = {}
    scores = {row[0]: 1 / (1 + max(float(row[1]), 0)) for row in doc_rows}
    for row in chunk_rows:
        document = doc_by_chunk.get(row[0])
        if document:
            best_chunk_by_document.setdefault(document.public_id, chunk_by_id.get(row[0]))
            scores[document.public_id] = max(scores.get(document.public_id, 0), 1 / (1 + max(float(row[1]), 0)))
    documents = {document.public_id: document for document in session.exec(select(Document).where(Document.deleted_at.is_(None), Document.ingest_status == "ready")).all()}
    results: dict[str, dict[str, Any]] = {}
    for public_id, document in documents.items():
        if public_id not in scores:
            continue
        chunk = best_chunk_by_document.get(public_id)
        content = chunk.text if chunk else document.content
        results[public_id] = {"document": document, "score": round(scores.get(public_id, 0.1), 4), "chunk": chunk, "content": content, "matched_terms": [term for term in terms if term.casefold() in content.casefold()]}

    # The graph is also a retrieval index: a matched concept must lead through
    # an evidence edge to the source chunk and document before it can ground an answer.
    concept_ids = {row[0] for row in concept_rows}
    if concept_ids:
        concepts = session.exec(select(Concept).where(Concept.public_id.in_(concept_ids), Concept.deleted_at.is_(None))).all()
        concept_by_id = {concept.id: concept for concept in concepts}
        concept_nodes = session.exec(select(GraphNode).where(GraphNode.node_type == "concept", GraphNode.concept_id.in_(set(concept_by_id)))).all()
        concept_node_ids = {node.id for node in concept_nodes}
        edges = session.exec(select(GraphEdge).where(GraphEdge.source_node_id.in_(concept_node_ids) | GraphEdge.target_node_id.in_(concept_node_ids))).all()
        concept_scores = {public_id: 1 / (1 + max(float(rank), 0)) for public_id, rank in concept_rows}
        for edge in edges:
            chunk = session.get(DocumentChunk, edge.evidence_chunk_id)
            document = documents.get(session.get(Document, chunk.document_id).public_id) if chunk and session.get(Document, chunk.document_id) else None
            if not document:
                continue
            concept_node = next((node for node in concept_nodes if node.id in {edge.source_node_id, edge.target_node_id}), None)
            concept = concept_by_id.get(concept_node.concept_id) if concept_node else None
            if not concept:
                continue
            score = round(max(results.get(document.public_id, {}).get("score", 0), concept_scores.get(concept.public_id, 0.1)), 4)
            current = results.get(document.public_id)
            if not current or score > current["score"]:
                results[document.public_id] = {"document": document, "score": score, "chunk": chunk, "content": chunk.text, "matched_terms": [concept.canonical_name]}

    return sorted(results.values(), key=lambda item: item["score"], reverse=True)[:limit]
