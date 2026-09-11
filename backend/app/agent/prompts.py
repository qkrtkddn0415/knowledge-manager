from __future__ import annotations

import json
import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any


PROMPT_DIR = Path(__file__).parent / "prompts"
REQUIRED_PROMPTS = ("agent_system.md", "tool_instructions.md", "tools.json")


class PromptConfigError(RuntimeError):
    pass


def _read(name: str) -> str:
    path = PROMPT_DIR / name
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PromptConfigError(f"Agent prompt resource cannot be read: {path}") from exc


@lru_cache(maxsize=1)
def load_agent_prompt() -> str:
    value = _read("agent_system.md").strip()
    if not value:
        raise PromptConfigError("agent_system.md is empty")
    return value


@lru_cache(maxsize=1)
def load_tool_instructions() -> str:
    value = _read("tool_instructions.md").strip()
    if not value:
        raise PromptConfigError("tool_instructions.md is empty")
    return value


@lru_cache(maxsize=1)
def load_tool_config() -> dict[str, Any]:
    try:
        value = json.loads(_read("tools.json"))
    except json.JSONDecodeError as exc:
        raise PromptConfigError(f"tools.json is invalid JSON: {exc.msg}") from exc
    if not isinstance(value, dict) or not isinstance(value.get("custom_tools"), list):
        raise PromptConfigError("tools.json must contain a custom_tools array")
    names = [item.get("name") for item in value["custom_tools"] if isinstance(item, dict)]
    required = {"search_knowledge", "explore_node"}
    if not required.issubset(names):
        raise PromptConfigError("tools.json must define search_knowledge and explore_node")
    return value


def validate_prompt_resources() -> None:
    for name in REQUIRED_PROMPTS:
        if not (PROMPT_DIR / name).is_file():
            raise PromptConfigError(f"Missing Agent prompt resource: {PROMPT_DIR / name}")
    load_agent_prompt()
    load_tool_instructions()
    load_tool_config()


@lru_cache(maxsize=1)
def prompt_version() -> str:
    content = "\n".join((load_agent_prompt(), load_tool_instructions(), json.dumps(load_tool_config(), sort_keys=True, ensure_ascii=False)))
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
