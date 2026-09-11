from dataclasses import dataclass
from typing import Any


@dataclass
class DomainError(Exception):
    code: str
    message: str
    status_code: int = 400
    retryable: bool = False
    details: list[dict[str, Any]] | None = None


ERROR_STATUS = {
    "NOT_FOUND": 404, "JOB_NOT_FOUND": 404, "DUPLICATE_DOCUMENT": 409,
    "INGESTION_ALREADY_RUNNING": 409, "UNSUPPORTED_FILE_TYPE": 422,
    "EMPTY_DOCUMENT": 422, "INVALID_PDF": 422, "DOCUMENT_TOO_LARGE": 413, "VALIDATION_ERROR": 422,
    "AI_NOT_CONFIGURED": 503, "VECTOR_STORE_NOT_CONFIGURED": 503,
    "AI_PROVIDER_ERROR": 502, "AI_RATE_LIMITED": 429, "AI_TIMEOUT": 504,
    "CITATION_MAPPING_FAILED": 502, "IMPORT_INVALID": 422, "INTERNAL_ERROR": 500,
}
