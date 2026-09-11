import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.api.routes import knowledge as knowledge_routes


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def get_test_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_upload_graph_and_search(client: TestClient) -> None:
    response = client.post(
        "/api/knowledge/documents/upload",
        files={
            "file": (
                "notes.md",
                b"FastAPI is a Python web framework. SQLModel connects models and SQLite.",
                "text/markdown",
            )
        },
    )
    assert response.status_code == 201
    document_id = response.json()["data"]["id"]

    graph = client.get("/api/knowledge/graph")
    assert graph.status_code == 200
    assert any(node["document_id"] == document_id for node in graph.json()["data"]["nodes"])

    search = client.get("/api/knowledge/search", params={"q": "FastAPI"})
    assert search.status_code == 200
    assert any(item["document_id"] == document_id for item in search.json()["data"])


def test_openai_key_can_be_saved_for_deployed_workspace(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(knowledge_routes.settings, "openai_api_key", None)

    before = client.get("/api/settings")
    assert before.status_code == 200
    assert before.json()["data"]["ai_available"] is False

    saved = client.patch("/api/settings", json={"openai_api_key": "sk-test-deployment-key"})
    assert saved.status_code == 200
    assert saved.json()["data"]["ai_available"] is True

    # The persisted workspace value remains available even if process memory is reset.
    monkeypatch.setattr(knowledge_routes.settings, "openai_api_key", None)
    after_restart = client.get("/api/settings")
    assert after_restart.json()["data"]["openai_api_key"]["configured"] is True


def test_graph_property_export_and_import(client: TestClient) -> None:
    uploaded = client.post(
        "/api/knowledge/documents/upload",
        files={"file": ("portable.md", b"FastAPI is a Python framework.", "text/markdown")},
    )
    assert uploaded.status_code == 201

    exported = client.get("/api/knowledge/graph/export")
    assert exported.status_code == 200
    payload = exported.json()
    assert payload["format"] == "second-brain-property-graph"
    assert payload["nodes"]
    assert payload["edges"]

    imported = client.post(
        "/api/knowledge/graph/import",
        files={"file": ("graph.json", json.dumps(payload).encode("utf-8"), "application/json")},
    )
    assert imported.status_code == 200
    assert imported.json()["data"]["imported_edges"] == 0


def test_delete_source_keeps_shared_concept_until_last_source(client: TestClient) -> None:
    first = client.post(
        "/api/knowledge/documents/upload",
        files={"file": ("first.md", b"FastAPI is a Python web framework.", "text/markdown")},
    )
    second = client.post(
        "/api/knowledge/documents/upload",
        files={"file": ("second.md", b"FastAPI is used with SQLite.", "text/markdown")},
    )
    assert first.status_code == 201
    assert second.status_code == 201

    before = client.get("/api/knowledge/graph").json()["data"]
    assert any(node["label"] == "FastAPI" for node in before["nodes"])

    assert client.delete(f"/api/knowledge/documents/{first.json()['data']['id']}").status_code == 202
    after_first_delete = client.get("/api/knowledge/graph").json()["data"]
    assert any(node["label"] == "FastAPI" for node in after_first_delete["nodes"])

    assert client.delete(f"/api/knowledge/documents/{second.json()['data']['id']}").status_code == 202
    after_last_delete = client.get("/api/knowledge/graph").json()["data"]
    assert not any(node["label"] == "FastAPI" for node in after_last_delete["nodes"])


def test_multiturn_conversation_and_history(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class LocalOnlyAdapter:
        configured = False

    monkeypatch.setattr(knowledge_routes, "OpenAIAdapter", LocalOnlyAdapter)
    uploaded = client.post(
        "/api/knowledge/documents/upload",
        files={"file": ("chat.md", b"FastAPI is used with SQLite for this knowledge service.", "text/markdown")},
    )
    assert uploaded.status_code == 201

    first = client.post("/api/knowledge/ask", json={"question": "FastAPI"})
    assert first.status_code == 200
    first_data = first.json()["data"]
    assert first_data["conversation_id"]
    assert first_data["turn_index"] == 0
    assert first_data["turn_id"] == first_data["history_id"]
    assert first_data["references"]
    assert first_data["references"][0]["local_start_char"] == 0
    assert first_data["references"][0]["local_end_char"] > 0

    second = client.post(
        "/api/knowledge/ask",
        json={"question": "그럼 SQLite와 함께 어떤 역할을 하나요?", "conversation_id": first_data["conversation_id"]},
    )
    assert second.status_code == 200
    assert second.json()["data"]["turn_index"] == 1

    conversation = client.get(f"/api/knowledge/chat/conversations/{first_data['conversation_id']}")
    assert conversation.status_code == 200
    assert [turn["turn_index"] for turn in conversation.json()["data"]["turns"]] == [0, 1]

    listing = client.get("/api/knowledge/chat/conversations")
    assert listing.status_code == 200
    assert listing.json()["data"][0]["turn_count"] == 2

    missing = client.post("/api/knowledge/ask", json={"question": "test", "conversation_id": "missing"})
    assert missing.status_code == 404

    deleted = client.delete(f"/api/knowledge/chat/conversations/{first_data['conversation_id']}")
    assert deleted.status_code == 200
    assert deleted.json()["data"]["deleted_count"] == 2
    assert client.get(f"/api/knowledge/chat/conversations/{first_data['conversation_id']}").status_code == 404


def test_ask_runs_search_plan_and_answer_review(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    class PipelineAdapter:
        configured = True

        def plan_search(self, question, conversation_context):
            return {"queries": ["FastAPI SQLite"], "concept_terms": [], "intent": "lookup", "entities": [], "filters": {}}

        def search(self, vector_store_id, query, limit):
            return []

        def answer(self, question, evidence, **kwargs):
            assert evidence
            return {"answer": "초안 답변", "citations": [], "insufficient_evidence": False, "response_id": "resp-1"}

        def review_answer(self, question, draft, evidence):
            assert draft["answer"] == "초안 답변"
            assert evidence
            return {"grounded": True, "issues": [], "answer": "검수된 답변", "citations": [], "insufficient_evidence": False}

    monkeypatch.setattr(knowledge_routes, "OpenAIAdapter", PipelineAdapter)
    uploaded = client.post(
        "/api/knowledge/documents/upload",
        files={"file": ("pipeline.md", b"FastAPI is used with SQLite for this knowledge service.", "text/markdown")},
    )
    assert uploaded.status_code == 201

    response = client.post("/api/knowledge/ask", json={"question": "FastAPI"})
    assert response.status_code == 200
    assert response.json()["data"]["answer"] == "검수된 답변"
    assert response.json()["data"]["retrieved_count"] == 1
