from __future__ import annotations

import json
from typing import Any


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def tool_error(code: str, message: str, *, retryable: bool = False, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            "retryable": retryable,
            "details": details or {},
            "suggested_next_action": "입력을 좁히거나 다른 Agent 도구를 사용하세요.",
        },
    }
