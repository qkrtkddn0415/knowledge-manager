import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.api.response import ok
from app.core.config import settings
from app.core.errors import DomainError
from app.db import get_session
from app.models import Document, IngestionJob
from app.services.knowledge_service import json_load
from app.services.graph_transfer import graph_export_bytes, import_graph
from app.storage.local_files import save_original

router = APIRouter(prefix="/knowledge", tags=["transfer"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/export")
def export_data(session: SessionDep):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = settings.exports_dir / f"second-brain-{stamp}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    documents = session.exec(select(Document).where(Document.deleted_at.is_(None))).all()
    payload = {"version": 1, "exported_at": datetime.now(timezone.utc).isoformat(), "documents": [{"title": x.title, "source_name": x.source_name, "source_format": x.source_format, "content": x.content, "content_hash": x.content_hash, "summary": x.summary, "analysis": json_load(x.analysis_json, None)} for x in documents]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return FileResponse(path, media_type="application/json", filename=path.name)


@router.get("/graph/export")
def export_graph_data(session: SessionDep):
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = settings.exports_dir / f"second-brain-graph-{stamp}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(graph_export_bytes(session))
    return FileResponse(path, media_type="application/json", filename=path.name)


@router.post("/graph/import")
async def import_graph_data(request: Request, session: SessionDep, file: UploadFile = File(...)):
    raw = await file.read()
    if len(raw) > settings.max_document_bytes:
        raise DomainError("GRAPH_IMPORT_TOO_LARGE", f"그래프 파일은 {settings.max_document_bytes // (1024 * 1024)} MiB 이하이어야 합니다.", 413)
    try:
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError
        result = import_graph(session, payload)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise DomainError("GRAPH_IMPORT_INVALID", "property-graph JSON 형식이 올바르지 않습니다.", 422) from exc
    return ok(request, result)


@router.post("/import", status_code=202)
async def import_data(request: Request, session: SessionDep, file: UploadFile = File(...)):
    raw = await file.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
        documents = payload["documents"]
        if not isinstance(documents, list): raise ValueError
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise DomainError("IMPORT_INVALID", "백업 파일 구조가 올바르지 않습니다.", 422) from exc
    imported = 0; skipped = 0
    for item in documents:
        content = str(item.get("content", ""))
        if not content: skipped += 1; continue
        exists = session.exec(select(Document).where(Document.content_hash == item.get("content_hash"), Document.deleted_at.is_(None))).first() if item.get("content_hash") else None
        if exists: skipped += 1; continue
        # Imported content is intentionally created as a draft; it must pass the same analysis/confirm flow.
        document = Document(title=str(item.get("title") or "Imported document")[:200], source_name=str(item.get("source_name") or "import.txt")[:300], source_format=str(item.get("source_format") or "txt"), original_path="pending", content=content, content_hash=item.get("content_hash") or __import__("hashlib").sha256(content.encode()).hexdigest(), content_chars=len(content), ingest_status="draft")
        session.add(document); session.flush(); rel, _ = save_original(document.public_id, ".md" if document.source_format == "md" else ".txt", content.encode()); document.original_path = rel
        session.add(IngestionJob(document_id=document.id, job_type="import", status="queued", current_step="validating")); imported += 1
    session.commit()
    job = IngestionJob(document_id=0, job_type="import", status="succeeded", current_step="ready", progress=100)
    return ok(request, {"job_id": job.public_id, "status": "queued", "poll_url": None, "imported_count": imported, "skipped_count": skipped}, {"poll_after_ms": 1000})
