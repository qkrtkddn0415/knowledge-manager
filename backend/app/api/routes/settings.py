from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session

from app.api.response import ok
from app.core.config import settings
from app.db import get_session
from app.services.knowledge_service import get_setting, put_setting

router = APIRouter(tags=["settings"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.get("/settings")
def read_settings(request: Request, session: SessionDep):
    configured = bool(settings.openai_api_key or get_setting(session, "openai_api_key"))
    return ok(request, {"openai_api_key": {"configured": configured, "masked": "••••••••" if configured else None}, "openai_model": settings.openai_model, "vector_store_id": settings.openai_vector_store_id or get_setting(session, "vector_store_id"), "ai_available": configured})


@router.patch("/settings")
def update_settings(payload: dict, request: Request, session: SessionDep):
    value = str(payload.get("openai_api_key", "")).strip()
    if value:
        settings.openai_api_key = value
        put_setting(session, "openai_api_key", value, secret=True)
    return read_settings(request, session)
