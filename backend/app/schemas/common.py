from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ErrorSummary(BaseModel):
    code: str
    message: str
    retryable: bool = False


class ErrorDetail(BaseModel):
    field: str | None = None
    reason: str
    value: Any = None


class Envelope(BaseModel, Generic[T]):
    data: T | None = None
    meta: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    request_id: str


class Pagination(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
    has_next: bool
    has_previous: bool


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
