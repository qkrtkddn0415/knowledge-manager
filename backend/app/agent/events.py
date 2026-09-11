from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session, select

from app.models import AgentEvent, AgentRun


class EventRecorder:
    def __init__(self, session: Session, run: AgentRun) -> None:
        self.session = session
        self.run = run

    def emit(
        self,
        event_type: str,
        status: str,
        message: str,
        *,
        tool_name: str | None = None,
        input_summary: dict[str, Any] | None = None,
        result_summary: dict[str, Any] | None = None,
        error_code: str | None = None,
    ) -> AgentEvent:
        latest = self.session.exec(select(AgentEvent.sequence).where(AgentEvent.run_id == self.run.id).order_by(AgentEvent.sequence.desc())).first()
        event = AgentEvent(
            run_id=self.run.id,
            sequence=(latest if latest is not None else -1) + 1,
            event_type=event_type,
            status=status,
            tool_name=tool_name,
            display_message=message[:500],
            input_summary_json=json.dumps(input_summary, ensure_ascii=False, separators=(",", ":")) if input_summary else None,
            result_summary_json=json.dumps(result_summary, ensure_ascii=False, separators=(",", ":")) if result_summary else None,
            error_code=error_code,
        )
        self.session.add(event)
        self.session.commit()
        self.session.refresh(event)
        return event
