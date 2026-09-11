from __future__ import annotations

from pydantic import BaseModel, Field


class AgentRunRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = Field(default=None, max_length=36)
    save_history: bool = True
    document_ids: list[str] = Field(default_factory=list, max_length=50)
    allow_web_search: bool = True
