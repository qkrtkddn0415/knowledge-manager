from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.knowledge import utc_now, public_id


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    conversation_id: Optional[str] = Field(default=None, index=True, max_length=36)
    history_id: Optional[int] = Field(default=None, foreign_key="search_history.id", index=True)
    question: str = Field(sa_column=Column(Text, nullable=False))
    status: str = Field(default="queued", index=True, max_length=20)
    save_history: bool = Field(default=True)
    allow_web_search: bool = Field(default=True)
    document_ids_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    agent_turn_count: int = Field(default=0, ge=0)
    tool_call_count: int = Field(default=0, ge=0)
    termination_reason: Optional[str] = Field(default=None, max_length=80)
    response_id: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=100)
    prompt_version: Optional[str] = Field(default=None, max_length=100)
    final_answer: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    result_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    error_code: Optional[str] = Field(default=None, max_length=80)
    error_message: Optional[str] = Field(default=None, max_length=500)
    started_at: Optional[datetime] = Field(default=None)
    finished_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)


class AgentEvent(SQLModel, table=True):
    __tablename__ = "agent_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence", name="uq_agent_event_sequence"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    sequence: int = Field(default=0, ge=0)
    event_type: str = Field(max_length=30)
    status: str = Field(max_length=20)
    tool_name: Optional[str] = Field(default=None, max_length=60)
    display_message: str = Field(default="", sa_column=Column(Text, nullable=False))
    input_summary_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    result_summary_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    error_code: Optional[str] = Field(default=None, max_length=80)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class AgentReference(SQLModel, table=True):
    __tablename__ = "agent_references"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    run_id: Optional[int] = Field(default=None, foreign_key="agent_runs.id", index=True)
    history_id: Optional[int] = Field(default=None, foreign_key="search_history.id", index=True)
    rank: int = Field(ge=1, le=10)
    source_type: str = Field(default="local", index=True, max_length=10)
    document_id: Optional[int] = Field(default=None, foreign_key="documents.id", index=True)
    chunk_id: Optional[int] = Field(default=None, foreign_key="document_chunks.id", index=True)
    document_title: str = Field(default="", max_length=300)
    chunk_ordinal: Optional[int] = Field(default=None)
    local_start_char: Optional[int] = Field(default=None)
    local_end_char: Optional[int] = Field(default=None)
    url: Optional[str] = Field(default=None, max_length=2000)
    title: str = Field(default="", max_length=500)
    excerpt: str = Field(default="", sa_column=Column(Text, nullable=False))
    score: float = Field(default=0, ge=0, le=1)
    local_match_type: str = Field(default="unresolved", max_length=20)
    provider_source_id: Optional[str] = Field(default=None, max_length=200)
    created_at: datetime = Field(default_factory=utc_now, index=True)
