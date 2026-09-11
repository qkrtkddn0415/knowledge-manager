from typing import Any

from fastapi import Request


def ok(request: Request, data: Any, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"data": data, "meta": meta, "error": None, "request_id": request.state.request_id}


def failure(request: Request, code: str, message: str, retryable: bool = False, details: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {"data": None, "meta": None, "error": {"code": code, "message": message, "details": details or [], "retryable": retryable}, "request_id": request.state.request_id}
