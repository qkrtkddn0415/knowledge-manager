from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlmodel import Session

from app.api.response import ok
from app.core.config import settings
from app.db import engine, get_session
from app.services.knowledge_service import get_setting

router = APIRouter(tags=["health"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/health")
def health_check(request: Request, session: SessionDep):
    try:
        session.exec(text("SELECT 1"))
        database = "ok"
    except Exception:
        database = "error"
    storage = "ok" if settings.data_dir.exists() else "error"
    configured = bool(settings.openai_api_key or get_setting(session, "openai_api_key"))
    vector_id = settings.openai_vector_store_id or get_setting(session, "vector_store_id")
    return ok(request, {"status": "ok" if database == "ok" and storage == "ok" else "degraded", "version": "1.0.0", "database": database, "storage": storage, "openai": "configured" if configured else "not_configured", "vector_store": "ready" if vector_id else "missing"})
