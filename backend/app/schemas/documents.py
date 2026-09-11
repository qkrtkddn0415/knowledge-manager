from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import APIModel

ConceptType = Literal["organization", "organization_unit", "person", "country", "region", "place", "technology", "equipment", "system", "project_program", "policy_law", "event", "document"]


class ConceptOut(APIModel):
    id: str
    concept_type: str
    canonical_name: str
    korean_name: str | None = None
    english_name: str | None = None
    acronym: str | None = None
    description: str
    merge_status: str
    document_count: int = 0
    chunk_count: int = 0
    related_concept_count: int = 0


class ChunkOut(APIModel):
    id: str
    document_id: str
    ordinal: int
    start_char: int
    end_char: int
    text: str | None = None
    concept_ids: list[str] = []


class DocumentSummaryOut(APIModel):
    id: str
    title: str
    source_name: str
    source_format: str
    summary: str | None = None
    content_chars: int
    chunk_count: int
    concept_count: int
    ingest_status: str
    ingest_error: dict | None = None
    created_at: datetime
    updated_at: datetime


class DocumentDetailOut(DocumentSummaryOut):
    content: str | None = None
    analysis: dict | None = None
    chunks: list[ChunkOut] = []
    concepts: list[ConceptOut] = []
    related_documents: list[dict] = []
    source: dict


class ConceptEdit(BaseModel):
    concept_id: str | None = None
    temp_key: str | None = None
    canonical_name: str = Field(min_length=1, max_length=300)
    korean_name: str | None = None
    english_name: str | None = None
    acronym: str | None = None
    description: str = Field(default="", max_length=500)
    include: bool = True


class DocumentPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    concepts: list[ConceptEdit] | None = None
    remove_relation_ids: list[str] = []
