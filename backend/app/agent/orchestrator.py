from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from app.agent.contracts import compact_json
from app.agent.events import EventRecorder
from app.agent.prompts import load_agent_prompt, load_tool_instructions, prompt_version
from app.agent.registry import ToolRegistry
from app.agent.tools.web_search import query_from_response_item, sources_from_response
from app.core.config import settings
from app.core.errors import DomainError
from app.integrations.openai_adapter import OpenAIAdapter
from app.models import AgentReference, AgentRun, Document, DocumentChunk, SearchHistory
from app.services.chat_service import conversation_context, get_conversation_turns, next_turn_index


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _output_type(item: Any) -> str:
    return str(getattr(item, "type", None) or (item.get("type") if isinstance(item, dict) else ""))


def _field(item: Any, name: str, default: Any = None) -> Any:
    if isinstance(item, dict):
        return item.get(name, default)
    return getattr(item, name, default)


def _local_references(search_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None]] = set()
    for result in search_results:
        data = result.get("data") if isinstance(result, dict) else None
        for item in (data or {}).get("results", []):
            document = item.get("document", {})
            chunk = item.get("local_chunk", {})
            key = (str(document.get("id") or ""), chunk.get("id"))
            if not key[0] or key in seen:
                continue
            seen.add(key)
            refs.append({
                "source_type": "local",
                "document_id": key[0],
                "chunk_id": chunk.get("id"),
                "document_title": document.get("title", ""),
                "chunk_ordinal": chunk.get("ordinal"),
                "local_start_char": chunk.get("start_char"),
                "local_end_char": chunk.get("end_char"),
                "url": (item.get("evidence") or {}).get("url"),
                "title": document.get("title", ""),
                "excerpt": (item.get("evidence") or {}).get("excerpt", ""),
                "score": float((item.get("openai_chunk") or {}).get("score", 0) or 0),
                "local_match_type": chunk.get("match_type", "unresolved"),
                "provider_source_id": (item.get("openai_chunk") or {}).get("file_id"),
            })
    return refs[:3]


def _concepts(search_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for result in search_results:
        for item in (result.get("data") or {}).get("results", []):
            for concept in item.get("concepts", []):
                if concept.get("id"):
                    output[str(concept["id"])] = concept
    return list(output.values())[:30]


def _safe_error(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, DomainError):
        return {"code": exc.code, "message": exc.message, "retryable": exc.retryable}
    return {"code": "INTERNAL_ERROR", "message": str(exc)[:300], "retryable": True}


def _persist_references(session: Session, run: AgentRun, references: list[dict[str, Any]], web_references: list[dict[str, Any]], history_id: int | None) -> None:
    for source_type, values in (("local", references), ("web", web_references)):
        for rank, reference in enumerate(values, 1):
            document = session.exec(select(Document).where(Document.public_id == reference.get("document_id"))).first() if reference.get("document_id") else None
            chunk = session.exec(select(DocumentChunk).where(DocumentChunk.public_id == reference.get("chunk_id"))).first() if reference.get("chunk_id") else None
            session.add(AgentReference(run_id=run.id, history_id=history_id, rank=rank, source_type=source_type, document_id=document.id if document else None, chunk_id=chunk.id if chunk else None, document_title=reference.get("document_title", ""), chunk_ordinal=reference.get("chunk_ordinal"), local_start_char=reference.get("local_start_char"), local_end_char=reference.get("local_end_char"), url=reference.get("url"), title=reference.get("title", ""), excerpt=reference.get("excerpt") or reference.get("snippet", ""), score=float(reference.get("score", 0) or 0), local_match_type=reference.get("local_match_type", "unresolved"), provider_source_id=reference.get("provider_source_id")))


def _finish(session: Session, run: AgentRun, recorder: EventRecorder, *, status: str, answer: str, termination_reason: str, references: list[dict[str, Any]], web_references: list[dict[str, Any]], concepts: list[dict[str, Any]], response_id: str | None = None, error: dict[str, Any] | None = None, insufficient_evidence: bool | None = None) -> dict[str, Any]:
    history_id = None
    history_public_id = None
    history_turn_index = None
    has_insufficient_evidence = (not references and not web_references) if insufficient_evidence is None else insufficient_evidence
    if run.save_history:
        turns = get_conversation_turns(session, run.conversation_id or "") if run.conversation_id else []
        history = SearchHistory(query=run.question, answer=answer, answer_status="insufficient_evidence" if has_insufficient_evidence else ("failed" if status == "failed" else "answered"), response_id=response_id, conversation_id=run.conversation_id, turn_index=next_turn_index(turns), model=run.model or settings.openai_model, retrieved_count=len(references), insufficient_evidence=has_insufficient_evidence)
        session.add(history)
        session.flush()
        history_id = history.id
        history_public_id = history.public_id
        history_turn_index = history.turn_index
        run.history_id = history.id
    run.status = status
    run.final_answer = answer
    run.termination_reason = termination_reason
    run.response_id = response_id
    run.error_code = (error or {}).get("code")
    run.error_message = (error or {}).get("message")
    run.finished_at = _now()
    run.updated_at = _now()
    result = {"run_id": run.public_id, "conversation_id": run.conversation_id, "turn_id": history_public_id, "history_id": history_public_id, "turn_index": history_turn_index, "question": run.question, "answer": answer, "status": status, "termination_reason": termination_reason, "references": references, "web_references": web_references, "retrieved_count": len(references), "insufficient_evidence": has_insufficient_evidence, "related_concepts": concepts, "agent_turn_count": run.agent_turn_count, "tool_call_count": run.tool_call_count, "model": run.model, "error": error}
    run.result_json = compact_json(result)
    session.commit()
    _persist_references(session, run, references, web_references, history_id)
    session.commit()
    recorder.emit("final" if status == "completed" else "run_stopped", status, "탐색을 완료했습니다." if status == "completed" else (error or {}).get("message", "탐색을 종료했습니다."), result_summary={"status": status, "reference_count": len(references), "web_reference_count": len(web_references), "termination_reason": termination_reason}, error_code=(error or {}).get("code"))
    return result


def run_agent(session: Session, run: AgentRun, adapter: Any | None = None) -> dict[str, Any]:
    recorder = EventRecorder(session, run)
    run.status = "running"
    run.started_at = _now()
    run.model = settings.openai_model
    run.prompt_version = prompt_version()
    session.add(run)
    session.commit()
    recorder.emit("run_started", "running", "질문을 분석하고 탐색 경로를 준비하는 중…")
    recorder.emit("assistant_update", "running", "질문의 성격을 판단하고 가장 빠른 답변 경로를 선택하는 중입니다.")
    try:
        turns = get_conversation_turns(session, run.conversation_id or "") if run.conversation_id else []
        context = conversation_context(turns, max_turns=3)
        system_prompt = f"{load_agent_prompt()}\n\n{load_tool_instructions()}"
        registry = ToolRegistry(allow_web_search=run.allow_web_search and settings.agent_allow_web_search)
        adapter = adapter or OpenAIAdapter()
        search_results: list[dict[str, Any]] = []
        web_references: list[dict[str, Any]] = []
        tool_used = False
        if not hasattr(adapter, "agent_response") and adapter.configured:
            from app.agent.tools.search_knowledge import execute
            fallback = execute(session, {"query": run.question, "document_ids": json.loads(run.document_ids_json or "[]"), "result_limit": 3})
            search_results.append(fallback)
            references = _local_references(search_results)
            evidence = [{"document_id": item["document_id"], "title": item["document_title"], "content": item["excerpt"], "score": item["score"]} for item in references]
            generated = adapter.answer(run.question, evidence)
            reviewed = adapter.review_answer(run.question, generated, evidence) if generated.get("answer") else {}
            generated = {**generated, **reviewed}
            return _finish(session, run, recorder, status="completed", answer=str(generated.get("answer", "")), termination_reason="legacy_adapter", references=references, web_references=[], concepts=_concepts(search_results), response_id=generated.get("response_id"))
        if not adapter.configured:
            from app.agent.tools.search_knowledge import execute
            fallback = execute(session, {"query": run.question, "document_ids": json.loads(run.document_ids_json or "[]"), "result_limit": 3})
            search_results.append(fallback)
            references = _local_references(search_results)
            answer = "\n\n".join(f"{item['document_title']}: {item['excerpt']}" for item in references) if references else "OpenAI API Key가 설정되지 않았고 저장된 자료에서 관련 근거를 찾지 못했습니다."
            recorder.emit("tool_result", "running", "지식 검색 결과를 준비했습니다.", tool_name="search_knowledge", result_summary={"count": len(references), "fallback": True})
            return _finish(session, run, recorder, status="completed", answer=answer, termination_reason="local_fallback", references=references, web_references=[], concepts=_concepts(search_results))

        input_items: Any = [{"role": "user", "content": json.dumps({"question": run.question, "conversation_context": context}, ensure_ascii=False)}]
        previous_response_id: str | None = None
        last_response_id: str | None = None
        for cycle in range(settings.agent_max_turns):
            if run.status == "cancelled":
                return _finish(session, run, recorder, status="cancelled", answer="사용자가 탐색을 취소했습니다.", termination_reason="cancelled", references=_local_references(search_results), web_references=web_references, concepts=_concepts(search_results), response_id=last_response_id)
            run.agent_turn_count = cycle + 1
            session.add(run)
            session.commit()
            recorder.emit(
                "llm_call",
                "running",
                f"LLM 호출 중: 질문을 해석하고 다음 행동을 결정하는 중입니다. (turn {cycle + 1})",
                input_summary={"turn": cycle + 1},
            )
            response = adapter.agent_response(instructions=system_prompt, input_items=input_items, tools=registry.definitions, previous_response_id=previous_response_id)
            last_response_id = getattr(response, "id", None)
            function_calls = [item for item in (getattr(response, "output", []) or []) if _output_type(item) == "function_call"]
            web_search_items = [item for item in (getattr(response, "output", []) or []) if _output_type(item) == "web_search_call"]
            if web_search_items:
                recorder.emit("llm_output", "waiting_tool", "LLM이 웹 검색을 선택했습니다.", result_summary={"web_search": True, "turn": cycle + 1})
            elif function_calls:
                recorder.emit("llm_output", "waiting_tool", "LLM이 필요한 도구와 실행 순서를 결정했습니다.", result_summary={"tools": [str(_field(item, "name", "")) for item in function_calls], "turn": cycle + 1})
            else:
                recorder.emit("llm_output", "running", "LLM이 최종 답변을 작성하고 있습니다.", result_summary={"final_candidate": True, "turn": cycle + 1})
            for item in (getattr(response, "output", []) or []):
                if _output_type(item) == "web_search_call":
                    tool_used = True
                    query = query_from_response_item(item)
                    recorder.emit("web_search", "waiting_tool", f"웹 검색 중: '{query}'", tool_name="web_search", input_summary={"query": query})
                    for source in sources_from_response(response):
                        web_references.append({"source_type": "web", "url": source["url"], "title": source["title"], "snippet": source["snippet"], "provider_source_id": source.get("id")})
            if not function_calls:
                answer = str(getattr(response, "output_text", "") or "").strip()
                if not answer:
                    return _finish(session, run, recorder, status="failed", answer="AI가 최종 답변을 반환하지 못했습니다.", termination_reason="empty_response", references=_local_references(search_results), web_references=web_references, concepts=_concepts(search_results), response_id=last_response_id, error={"code": "EMPTY_MODEL_RESPONSE", "message": "Responses API가 텍스트 답변 없이 종료되었습니다.", "retryable": True})
                references = _local_references(search_results)
                if len(references) > 3:
                    references = references[:3]
                final_web_references = list({item["url"]: item for item in web_references}.values())[:10]
                return _finish(session, run, recorder, status="completed", answer=answer, termination_reason="final_answer", references=references, web_references=final_web_references, concepts=_concepts(search_results), response_id=last_response_id, insufficient_evidence=tool_used and not references and not final_web_references)
            if len(function_calls) > settings.agent_max_calls_per_cycle:
                return _finish(session, run, recorder, status="failed", answer="한 번에 실행할 수 있는 도구 수를 초과했습니다.", termination_reason="tool_call_limit", references=_local_references(search_results), web_references=web_references, concepts=_concepts(search_results), response_id=last_response_id, error={"code": "TOOL_LIMIT_EXCEEDED", "message": "한 Agent cycle에 허용된 도구 호출 수를 초과했습니다.", "retryable": False})
            input_items = []
            for item in function_calls:
                tool_used = True
                run.tool_call_count += 1
                if run.tool_call_count > settings.agent_max_tool_calls:
                    return _finish(session, run, recorder, status="max_turns", answer="탐색 도구 실행 한도에 도달해 중단했습니다.", termination_reason="tool_call_limit", references=_local_references(search_results), web_references=web_references, concepts=_concepts(search_results), response_id=last_response_id)
                name = str(_field(item, "name", ""))
                arguments = str(_field(item, "arguments", "{}"))
                try:
                    parsed = json.loads(arguments)
                except json.JSONDecodeError:
                    parsed = {}
                if name == "search_knowledge":
                    message = f"지식 검색 중: '{str(parsed.get('query') or run.question)[:120]}'"
                elif name == "explore_node":
                    message = f"노드 탐색 중: {len(parsed.get('node_ids', []))}개 노드"
                else:
                    message = f"도구 실행 중: {name}"
                recorder.emit("tool_call", "waiting_tool", message, tool_name=name, input_summary={"query": parsed.get("query"), "node_count": len(parsed.get("node_ids", [])) if isinstance(parsed.get("node_ids"), list) else None})
                result = registry.execute(session, name, arguments)
                if name == "search_knowledge":
                    search_results.append(result)
                summary = result.get("data", {}) if result.get("ok") else result.get("error", {})
                recorder.emit("tool_result", "running", "도구 결과를 반영하는 중…", tool_name=name, result_summary={"ok": result.get("ok"), "count": summary.get("count"), "truncated": summary.get("truncated"), "error_code": summary.get("code")})
                input_items.append({"type": "function_call_output", "call_id": _field(item, "call_id", ""), "output": compact_json(result)})
            previous_response_id = last_response_id
        return _finish(session, run, recorder, status="max_turns", answer="최대 탐색 횟수(30회)에 도달해 답변 생성을 중단했습니다.", termination_reason="max_turns", references=_local_references(search_results), web_references=web_references, concepts=_concepts(search_results), response_id=last_response_id)
    except Exception as exc:
        error = _safe_error(exc)
        return _finish(session, run, recorder, status="failed", answer="탐색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", termination_reason="error", references=[], web_references=[], concepts=[], response_id=run.response_id, error=error)
