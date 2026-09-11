from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import Column, Index, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def public_id() -> str:
    return str(uuid4())


class Document(SQLModel, table=True):
    __tablename__ = "documents"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    title: str = Field(max_length=200, index=True)
    source_name: str = Field(max_length=300)
    source_format: str = Field(max_length=10)
    original_path: str = Field(max_length=500)
    content: str = Field(sa_column=Column(Text, nullable=False))
    content_hash: str = Field(max_length=64, index=True)
    content_chars: int = Field(default=0)
    summary: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    analysis_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    ingest_status: str = Field(default="draft", index=True, max_length=30)
    ingest_error_code: Optional[str] = Field(default=None, max_length=80)
    ingest_error_message: Optional[str] = Field(default=None, max_length=500)
    openai_file_id: Optional[str] = Field(default=None, max_length=100)
    vector_store_id: Optional[str] = Field(default=None, max_length=100)
    vector_store_file_id: Optional[str] = Field(default=None, max_length=100)
    vector_store_file_status: Optional[str] = Field(default=None, max_length=30)
    vector_store_last_error: Optional[str] = Field(default=None, max_length=500)
    deleted_at: Optional[datetime] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now, index=True)


class DocumentChunk(SQLModel, table=True):
    __tablename__ = "document_chunks"
    __table_args__ = (UniqueConstraint("document_id", "ordinal", name="uq_chunks_document_ordinal"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    document_id: int = Field(foreign_key="documents.id", index=True)
    ordinal: int = Field(ge=0)
    start_char: int = Field(ge=0)
    end_char: int = Field(gt=0)
    text: str = Field(sa_column=Column(Text, nullable=False))
    normalized_text: str = Field(sa_column=Column(Text, nullable=False))
    content_hash: str = Field(max_length=64)
    extraction_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Concept(SQLModel, table=True):
    __tablename__ = "concepts"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    concept_type: str = Field(index=True, max_length=40)
    canonical_name: str = Field(max_length=300, index=True)
    korean_name: Optional[str] = Field(default=None, max_length=300)
    english_name: Optional[str] = Field(default=None, max_length=300)
    acronym: Optional[str] = Field(default=None, max_length=100)
    normalized_key: str = Field(index=True, max_length=300)
    description: str = Field(default="", sa_column=Column(Text, nullable=False))
    merge_status: str = Field(default="confirmed", index=True, max_length=20)
    source_count: int = Field(default=0)
    deleted_at: Optional[datetime] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ConceptAlias(SQLModel, table=True):
    __tablename__ = "concept_aliases"
    __table_args__ = (UniqueConstraint("concept_id", "normalized_alias", name="uq_alias_concept_key"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    concept_id: int = Field(foreign_key="concepts.id", index=True)
    alias: str = Field(max_length=300)
    normalized_alias: str = Field(index=True, max_length=300)
    alias_type: str = Field(max_length=20)
    is_primary: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)


class GraphNode(SQLModel, table=True):
    __tablename__ = "graph_nodes"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    node_type: str = Field(index=True, max_length=20)
    document_id: Optional[int] = Field(default=None, foreign_key="documents.id", index=True)
    chunk_id: Optional[int] = Field(default=None, foreign_key="document_chunks.id", index=True)
    concept_id: Optional[int] = Field(default=None, foreign_key="concepts.id", index=True)
    is_visible_default: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class GraphEdge(SQLModel, table=True):
    __tablename__ = "graph_edges"
    __table_args__ = (UniqueConstraint("source_node_id", "target_node_id", "relation_type", "evidence_chunk_id", name="uq_graph_edge_evidence"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    source_node_id: int = Field(foreign_key="graph_nodes.id", index=True)
    target_node_id: int = Field(foreign_key="graph_nodes.id", index=True)
    relation_type: str = Field(max_length=50)
    label: str = Field(max_length=200)
    evidence_chunk_id: int = Field(foreign_key="document_chunks.id", index=True)
    evidence_text: str = Field(sa_column=Column(Text, nullable=False))
    confidence: float = Field(default=0.5, ge=0, le=1)
    origin: str = Field(default="extracted", max_length=20)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class IngestionJob(SQLModel, table=True):
    __tablename__ = "ingestion_jobs"
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    document_id: int = Field(foreign_key="documents.id", index=True)
    job_type: str = Field(default="ingest", max_length=20)
    status: str = Field(default="queued", index=True, max_length=20)
    current_step: str = Field(default="validating", max_length=30)
    progress: int = Field(default=0, ge=0, le=100)
    attempt: int = Field(default=0, ge=0)
    preview_json: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    error_code: Optional[str] = Field(default=None, max_length=80)
    error_message: Optional[str] = Field(default=None, max_length=500)
    started_at: Optional[datetime] = Field(default=None)
    finished_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class SearchHistory(SQLModel, table=True):
    __tablename__ = "search_history"
    __table_args__ = (Index("ix_search_history_conversation_turn", "conversation_id", "turn_index"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    public_id: str = Field(default_factory=public_id, index=True, unique=True, max_length=36)
    query: str = Field(sa_column=Column(Text, nullable=False))
    answer: str = Field(sa_column=Column(Text, nullable=False))
    answer_status: str = Field(default="answered", max_length=30)
    response_id: Optional[str] = Field(default=None, max_length=100)
    conversation_id: Optional[str] = Field(default=None, index=True, max_length=36)
    turn_index: int = Field(default=0, index=True, ge=0)
    model: Optional[str] = Field(default=None, max_length=100)
    retrieved_count: int = Field(default=0)
    insufficient_evidence: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now, index=True)
    updated_at: datetime = Field(default_factory=utc_now)
    deleted_at: Optional[datetime] = Field(default=None, index=True)


class SearchHistorySource(SQLModel, table=True):
    __tablename__ = "search_history_sources"
    __table_args__ = (UniqueConstraint("history_id", "rank", name="uq_history_rank"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    history_id: int = Field(foreign_key="search_history.id", index=True)
    rank: int = Field(ge=1, le=3)
    document_id: Optional[int] = Field(default=None, foreign_key="documents.id")
    chunk_id: Optional[int] = Field(default=None, foreign_key="document_chunks.id")
    openai_file_id: str = Field(default="", max_length=100)
    openai_filename: str = Field(default="", max_length=300)
    openai_score: float = Field(default=0, ge=0, le=1)
    openai_content: str = Field(default="", sa_column=Column(Text, nullable=False))
    local_match_type: str = Field(default="unresolved", max_length=20)
    local_start_char: Optional[int] = Field(default=None)
    local_end_char: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class AppSetting(SQLModel, table=True):
    __tablename__ = "app_settings"
    key: str = Field(primary_key=True, max_length=100)
    value_json: str = Field(sa_column=Column(Text, nullable=False))
    is_secret: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class DocumentRead(SQLModel):
    id: int
    title: str
    source_name: str
    summary: Optional[str] = None
    keywords: list[str] = []
    created_at: datetime


class DocumentDetail(DocumentRead):
    content: str


class GraphNodeRead(SQLModel):
    id: int | str
    label: str
    node_type: str
    document_id: int | str | None = None


class GraphEdgeRead(SQLModel):
    source: int | str
    target: int | str
    relation: str


class GraphRead(SQLModel):
    nodes: list[GraphNodeRead]
    links: list[GraphEdgeRead]


class SearchResult(SQLModel):
    document: DocumentRead
    score: float
    matched_terms: list[str]


class AskRequest(SQLModel):
    question: str = Field(min_length=1, max_length=2000)


class AnswerCitation(SQLModel):
    document_id: int | str
    title: str
    source_name: str


class AskResponse(SQLModel):
    answer: str
    citations: list[AnswerCitation]
