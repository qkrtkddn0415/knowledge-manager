from __future__ import annotations

from typing import Any


def response_item_dict(item: Any) -> dict[str, Any]:
    if isinstance(item, dict):
        return item
    for method in ("model_dump", "to_dict"):
        callable_method = getattr(item, method, None)
        if callable(callable_method):
            try:
                value = callable_method()
                if isinstance(value, dict):
                    return value
            except Exception:
                pass
    return {key: value for key in ("type", "id", "status", "action", "sources", "query") if (value := getattr(item, key, None)) is not None}


def sources_from_response(response: Any) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for item in getattr(response, "output", []) or []:
        data = response_item_dict(item)
        action = data.get("action") if isinstance(data.get("action"), dict) else {}
        values = data.get("sources") or action.get("sources") or []
        for source in values:
            source_data = response_item_dict(source)
            url = source_data.get("url") or source_data.get("link")
            if url:
                sources.append({
                    "id": source_data.get("id"),
                    "url": str(url)[:2000],
                    "title": str(source_data.get("title") or source_data.get("name") or url)[:500],
                    "snippet": str(source_data.get("snippet") or source_data.get("description") or "")[:1000],
                })
    return list({item["url"]: item for item in sources}.values())


def query_from_response_item(item: Any) -> str:
    data = response_item_dict(item)
    action = data.get("action") if isinstance(data.get("action"), dict) else {}
    query = data.get("query") or action.get("query")
    queries = action.get("queries") if isinstance(action.get("queries"), list) else []
    return str(query or (queries[0] if queries else "외부 정보"))[:300]
