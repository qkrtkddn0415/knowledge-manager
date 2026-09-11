from __future__ import annotations

import json
from typing import Any, Callable

from sqlmodel import Session

from app.agent.prompts import load_tool_config
from app.agent.tools import explore_node, search_knowledge
from app.agent.contracts import tool_error


class ToolRegistry:
    def __init__(self, *, allow_web_search: bool = True) -> None:
        config = load_tool_config()
        self._tools: dict[str, Callable[[Session, dict[str, Any]], dict[str, Any]]] = {
            "search_knowledge": search_knowledge.execute,
            "explore_node": explore_node.execute,
        }
        self._definitions = list(config["custom_tools"])
        if allow_web_search:
            self._definitions.extend({"type": "web_search"} for item in config.get("builtin_tools", []) if item.get("enabled_by_default", True))

    @property
    def definitions(self) -> list[dict[str, Any]]:
        return self._definitions

    def execute(self, session: Session, name: str, arguments: str | dict[str, Any]) -> dict[str, Any]:
        handler = self._tools.get(name)
        if not handler:
            return tool_error("UNKNOWN_TOOL", f"등록되지 않은 도구 '{name}'입니다.", details={"tool": name})
        try:
            payload = json.loads(arguments) if isinstance(arguments, str) else arguments
            if not isinstance(payload, dict):
                return tool_error("INVALID_ARGUMENT", f"{name}의 인자는 JSON object여야 합니다.")
            return handler(session, payload)
        except json.JSONDecodeError as exc:
            return tool_error("INVALID_ARGUMENT", f"{name} 인자 JSON을 해석하지 못했습니다.", details={"reason": str(exc)})
        except Exception as exc:
            return tool_error("INTERNAL_ERROR", f"{name} 실행 중 내부 오류가 발생했습니다.", retryable=True, details={"reason": str(exc)[:300]})
