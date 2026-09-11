from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.agent.orchestrator import run_agent
from app.api.response import ok
from app.core.config import settings
from app.core.errors import DomainError
from app.db import engine, get_session
from app.models import AgentEvent, AgentReference, AgentRun, Document, DocumentChunk
from app.schemas.agent import AgentRunRequest
from app.services.chat_service import get_conversation_turns, new_conversation_id


router = APIRouter(prefix="/knowledge/agent", tags=["agent"])
SessionDep = Annotated[Session, Depends(get_session)]
TERMINAL = {"completed", "failed", "max_turns", "cancelled"}


def _event_out(event: AgentEvent) -> dict:
    return {
        "id": event.public_id,
        "sequence": event.sequence,
        "type": event.event_type,
        "status": event.status,
        "tool_name": event.tool_name,
        "display_message": event.display_message,
        "input_summary": json.loads(event.input_summary_json) if event.input_summary_json else None,
        "result_summary": json.loads(event.result_summary_json) if event.result_summary_json else None,
        "error_code": event.error_code,
        "created_at": event.created_at.isoformat(),
    }


def _reference_out(session: Session, reference: AgentReference) -> dict:
    document = session.get(Document, reference.document_id) if reference.document_id else None
    chunk = session.get(DocumentChunk, reference.chunk_id) if reference.chunk_id else None
    return {
        "rank": reference.rank,
        "source_type": reference.source_type,
        "document_id": document.public_id if document else None,
        "document_title": reference.document_title or reference.title,
        "chunk_id": chunk.public_id if chunk else None,
        "chunk_ordinal": reference.chunk_ordinal,
        "local_start_char": reference.local_start_char,
        "local_end_char": reference.local_end_char,
        "excerpt": reference.excerpt,
        "score": reference.score,
        "local_match_type": reference.local_match_type,
        "url": reference.url,
        "title": reference.title,
        "snippet": reference.excerpt,
        "provider_source_id": reference.provider_source_id,
    }


def _result_out(session: Session, run: AgentRun) -> dict:
    result: dict = {}
    if run.result_json:
        try:
            result = json.loads(run.result_json)
        except json.JSONDecodeError:
            result = {}
    references = [_reference_out(session, item) for item in session.exec(select(AgentReference).where(AgentReference.run_id == run.id).order_by(AgentReference.source_type, AgentReference.rank)).all()]
    local = [item for item in references if item["source_type"] == "local"]
    web = [item for item in references if item["source_type"] == "web"]
    return {
        "run_id": run.public_id,
        "conversation_id": run.conversation_id,
        "history_id": run.history_id,
        "question": run.question,
        "answer": run.final_answer,
        "status": run.status,
        "termination_reason": run.termination_reason,
        "references": local or result.get("references", []),
        "web_references": web or result.get("web_references", []),
        "retrieved_count": len(local),
        "insufficient_evidence": not local and not web,
        "related_concepts": result.get("related_concepts", []),
        "agent_turn_count": run.agent_turn_count,
        "tool_call_count": run.tool_call_count,
        "model": run.model,
        "error": {"code": run.error_code, "message": run.error_message} if run.error_code else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }


def run_agent_task(run_public_id: str) -> None:
    with Session(engine) as session:
        run = session.exec(select(AgentRun).where(AgentRun.public_id == run_public_id)).first()
        if run and run.status == "queued":
            run_agent(session, run)


@router.post("/runs", status_code=202)
def create_run(payload: AgentRunRequest, request: Request, background_tasks: BackgroundTasks, session: SessionDep):
    question = payload.question.strip()
    if not question:
        raise DomainError("VALIDATION_ERROR", "질문은 비어 있을 수 없습니다.", 422)
    conversation_id = payload.conversation_id or (new_conversation_id() if payload.save_history else None)
    if payload.conversation_id:
        if not payload.save_history:
            raise DomainError("VALIDATION_ERROR", "멀티턴 Agent는 save_history=true가 필요합니다.", 422)
        if not get_conversation_turns(session, payload.conversation_id):
            raise DomainError("NOT_FOUND", "지정한 대화를 찾을 수 없습니다.", 404)
    run = AgentRun(question=question, conversation_id=conversation_id, save_history=payload.save_history, allow_web_search=payload.allow_web_search, document_ids_json=json.dumps(payload.document_ids, ensure_ascii=False))
    session.add(run)
    session.commit()
    session.refresh(run)
    background_tasks.add_task(run_agent_task, run.public_id)
    return ok(request, {"run_id": run.public_id, "conversation_id": conversation_id, "status": run.status, "events_url": f"/api/knowledge/agent/runs/{run.public_id}/events", "result_url": f"/api/knowledge/agent/runs/{run.public_id}", "cancel_url": f"/api/knowledge/agent/runs/{run.public_id}/cancel", "created_at": run.created_at.isoformat()})


@router.get("/runs/{run_id}")
def read_run(run_id: str, request: Request, session: SessionDep):
    run = session.exec(select(AgentRun).where(AgentRun.public_id == run_id)).first()
    if not run:
        raise DomainError("NOT_FOUND", "Agent 실행을 찾을 수 없습니다.", 404)
    data = _result_out(session, run)
    data["events"] = [_event_out(item) for item in session.exec(select(AgentEvent).where(AgentEvent.run_id == run.id).order_by(AgentEvent.sequence)).all()]
    return ok(request, data)


@router.get("/runs/{run_id}/events")
async def stream_events(run_id: str, request: Request, after: int = Query(-1, ge=-1)):
    with Session(engine) as session:
        run = session.exec(select(AgentRun).where(AgentRun.public_id == run_id)).first()
        if not run:
            raise DomainError("NOT_FOUND", "Agent 실행을 찾을 수 없습니다.", 404)
    header_value = request.headers.get("Last-Event-ID")
    cursor = max(after, int(header_value) if header_value and header_value.lstrip("-").isdigit() else -1)

    async def generator():
        nonlocal cursor
        idle = 0
        while idle < 7200:
            emitted = False
            with Session(engine) as session:
                current = session.exec(select(AgentRun).where(AgentRun.public_id == run_id)).first()
                if not current:
                    return
                events = session.exec(select(AgentEvent).where(AgentEvent.run_id == current.id, AgentEvent.sequence > cursor).order_by(AgentEvent.sequence)).all()
                for event in events:
                    cursor = event.sequence
                    emitted = True
                    yield f"id: {event.sequence}\nevent: agent\ndata: {json.dumps(_event_out(event), ensure_ascii=False)}\n\n"
                if current.status in TERMINAL and not events:
                    return
            if not emitted:
                idle += 1
                if idle % 40 == 0:
                    yield ": keep-alive\n\n"
            else:
                idle = 0
            await asyncio.sleep(0.25)

    return StreamingResponse(generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"})


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, request: Request, session: SessionDep):
    run = session.exec(select(AgentRun).where(AgentRun.public_id == run_id)).first()
    if not run:
        raise DomainError("NOT_FOUND", "Agent 실행을 찾을 수 없습니다.", 404)
    if run.status not in TERMINAL:
        run.status = "cancelled"
        run.termination_reason = "cancel_requested"
        session.add(run)
        session.commit()
    return ok(request, {"run_id": run.public_id, "status": run.status, "cancelled": run.status == "cancelled"})
