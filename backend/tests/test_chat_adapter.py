import json

from app.integrations import openai_adapter
from app.integrations.openai_adapter import OpenAIAdapter
from app.core.config import settings


class FakeResponse:
    id = "resp-follow-up"
    output_text = json.dumps({"answer": "근거 기반 답변", "citations": ["doc-1"], "insufficient_evidence": False})


class FakeResponses:
    def __init__(self) -> None:
        self.kwargs = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        return FakeResponse()


class FakeClient:
    def __init__(self) -> None:
        self.responses = FakeResponses()


def test_answer_uses_previous_response_and_stores_state(monkeypatch) -> None:
    client = FakeClient()
    monkeypatch.setattr(openai_adapter, "OpenAI", lambda **_: client)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")

    result = OpenAIAdapter().answer(
        "후속 질문",
        [{"document_id": "doc-1", "title": "자료", "content": "근거", "score": 0.9}],
        previous_response_id="resp-previous",
        conversation_context=[{"question": "이전 질문", "answer": "이전 답변"}],
    )

    assert result["response_id"] == "resp-follow-up"
    assert client.responses.kwargs["previous_response_id"] == "resp-previous"
    assert client.responses.kwargs["store"] is True
    assert json.loads(client.responses.kwargs["input"])["conversation_context"]


class PlanningResponses:
    def create(self, **kwargs):
        name = kwargs["text"]["format"]["name"]
        if name == "search_plan":
            return type("Response", (), {"output_text": json.dumps({
                "intent": "compare technologies",
                "entities": [{"name": "대드론", "aliases": ["counter-UAS"]}],
                "concept_terms": ["radar", "electronic warfare"],
                "queries": ["counter-UAS radar electronic warfare"],
                "filters": {"source_formats": [], "concept_types": ["technology", "system"]},
            })})()
        return type("Response", (), {"output_text": json.dumps({
            "grounded": True,
            "issues": [],
            "answer": "검수된 답변",
            "citations": ["doc-1"],
            "insufficient_evidence": False,
        })})()


def test_search_plan_and_answer_review(monkeypatch) -> None:
    client = type("Client", (), {"responses": PlanningResponses()})()
    monkeypatch.setattr(openai_adapter, "OpenAI", lambda **_: client)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")

    adapter = OpenAIAdapter()
    plan = adapter.plan_search("앞으로 대드론 기술은?", [])
    review = adapter.review_answer(
        "앞으로 대드론 기술은?",
        {"answer": "초안", "citations": ["doc-1"], "insufficient_evidence": False},
        [{"document_id": "doc-1", "title": "자료", "content": "근거", "score": 0.9}],
    )

    assert plan["queries"] == ["counter-UAS radar electronic warfare"]
    assert plan["entities"][0]["aliases"] == ["counter-UAS"]
    assert review["answer"] == "검수된 답변"
    assert review["citations"] == ["doc-1"]
