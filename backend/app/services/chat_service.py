from __future__ import annotations

from uuid import uuid4

from sqlmodel import Session, select

from app.models import SearchHistory


MAX_CONTEXT_TURNS = 3
MAX_RETRIEVAL_CONTEXT_CHARS = 3600
MAX_ANSWER_CONTEXT_CHARS = 6000


def new_conversation_id() -> str:
    return str(uuid4())


def get_conversation_turns(session: Session, conversation_id: str) -> list[SearchHistory]:
    return session.exec(
        select(SearchHistory)
        .where(
            SearchHistory.conversation_id == conversation_id,
            SearchHistory.deleted_at.is_(None),
        )
        .order_by(SearchHistory.turn_index, SearchHistory.created_at)
    ).all()


def next_turn_index(turns: list[SearchHistory]) -> int:
    return max((turn.turn_index for turn in turns), default=-1) + 1


def conversation_context(
    turns: list[SearchHistory],
    *,
    max_turns: int = MAX_CONTEXT_TURNS,
    max_chars: int = MAX_ANSWER_CONTEXT_CHARS,
) -> list[dict[str, str]]:
    context: list[dict[str, str]] = []
    used = 0
    for turn in turns[-max_turns:]:
        question = turn.query[:1200]
        answer = turn.answer[:1800]
        item_size = len(question) + len(answer)
        if context and used + item_size > max_chars:
            break
        context.append({"question": question, "answer": answer})
        used += item_size
    return context


def retrieval_query(question: str, turns: list[SearchHistory]) -> str:
    context = conversation_context(
        turns,
        max_turns=3,
        max_chars=MAX_RETRIEVAL_CONTEXT_CHARS,
    )
    if not context:
        return question
    prior = "\n".join(
        f"이전 질문: {item['question']}\n이전 답변: {item['answer']}"
        for item in context
    )
    return f"{prior}\n현재 질문: {question}"[:MAX_RETRIEVAL_CONTEXT_CHARS]


def conversation_summary(turns: list[SearchHistory]) -> dict[str, object]:
    first = turns[0]
    latest = turns[-1]
    return {
        "conversation_id": first.conversation_id,
        "title": first.query[:80],
        "last_question_preview": latest.query[:160],
        "last_answer_preview": latest.answer[:240],
        "turn_count": len(turns),
        "last_turn_index": latest.turn_index,
        "created_at": first.created_at.isoformat(),
        "updated_at": latest.updated_at.isoformat(),
    }
