from pydantic import BaseModel, Field


class ConfirmRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(default="", max_length=2000)
    included_concept_keys: list[str] = []
    excluded_relation_keys: list[str] = []


class WebSourceImportRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    title: str | None = Field(default=None, max_length=200)
    excerpt: str | None = Field(default=None, max_length=1000)


class JobOut(BaseModel):
    job_id: str
    document_id: str
    status: str
    current_step: str
    progress: int
    message: str
    preview: dict | None = None
    error: dict | None = None
    started_at: str | None = None
    finished_at: str | None = None
    attempt: int = 0
