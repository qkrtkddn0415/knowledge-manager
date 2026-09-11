import json
from pathlib import Path
from typing import Any

from openai import OpenAI

from app.core.config import settings
from app.core.errors import DomainError


class OpenAIAdapter:
    def __init__(self) -> None:
        if not settings.openai_api_key:
            self.client = None
        else:
            self.client = OpenAI(
                api_key=settings.openai_api_key,
                timeout=settings.openai_timeout_seconds,
                max_retries=settings.openai_max_retries,
            )

    @property
    def configured(self) -> bool:
        return self.client is not None

    def ensure_vector_store(self, configured_id: str | None = None) -> str:
        if not self.client:
            raise DomainError("AI_NOT_CONFIGURED", "OpenAI API key is not configured.", 503)
        if configured_id:
            return configured_id
        try:
            store = self.client.vector_stores.create(name="Second Brain")
            return store.id
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def upload_and_index(self, path: Path, vector_store_id: str) -> dict[str, str]:
        if not self.client:
            return {}
        try:
            with path.open("rb") as handle:
                file = self.client.files.create(file=handle, purpose="user_data")
            vector_file = self.client.vector_stores.files.create(
                vector_store_id=vector_store_id,
                file_id=file.id,
            )
            status = getattr(vector_file, "status", "in_progress")
            vector_file_id = getattr(vector_file, "id", file.id)
            return {"file_id": file.id, "vector_store_file_id": vector_file_id, "status": status}
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def search(self, vector_store_id: str, query: str, limit: int = 3) -> list[dict[str, Any]]:
        if not self.client:
            return []
        try:
            page = self.client.vector_stores.search(
                vector_store_id=vector_store_id,
                query=query,
                max_num_results=min(limit, 50),
            )
            return [self._search_result(result) for result in page.data]
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def plan_search(self, question: str, conversation_context: list[dict[str, str]] | None = None) -> dict[str, Any]:
        """Create a retrieval plan; this call never answers the user."""
        if not self.client or not question.strip():
            return {}
        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "intent": {"type": "string", "maxLength": 300},
                "entities": {
                    "type": "array",
                    "maxItems": 12,
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "name": {"type": "string", "maxLength": 200},
                            "aliases": {"type": "array", "maxItems": 8, "items": {"type": "string", "maxLength": 200}},
                        },
                        "required": ["name", "aliases"],
                    },
                },
                "concept_terms": {"type": "array", "maxItems": 20, "items": {"type": "string", "maxLength": 200}},
                "queries": {"type": "array", "minItems": 1, "maxItems": 4, "items": {"type": "string", "minLength": 2, "maxLength": 500}},
                "filters": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "source_formats": {"type": "array", "items": {"type": "string", "enum": ["txt", "md", "pdf"]}},
                        "concept_types": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["source_formats", "concept_types"],
                },
            },
            "required": ["intent", "entities", "concept_terms", "queries", "filters"],
        }
        try:
            response = self.client.responses.create(
                model=settings.openai_model,
                instructions=(
                    "You are a retrieval planning model for a private knowledge base. Do not answer the question and do not invent document facts. "
                    "Return a compact JSON search plan. Preserve the original language, add English translations and abbreviations for named entities or technologies, "
                    "and add domain synonyms only when they are reasonable. queries must be useful for lexical and semantic retrieval. "
                    "Use empty arrays for unknown filters."
                ),
                input=json.dumps({"question": question, "conversation_context": conversation_context or []}, ensure_ascii=False),
                text={"format": {"type": "json_schema", "name": "search_plan", "strict": True, "schema": schema}},
                store=False,
            )
            result = json.loads(response.output_text)
            result["queries"] = list(dict.fromkeys(str(item).strip() for item in result.get("queries", []) if str(item).strip()))[:4]
            return result
        except Exception:
            # Search planning is an optimization; the original query remains the fallback.
            return {}

    @staticmethod
    def _extraction_schema(include_metadata: bool = True) -> dict[str, Any]:
        properties: dict[str, Any] = {
            "concepts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "key": {"type": "string", "maxLength": 120},
                        "concept_type": {"type": "string", "maxLength": 30},
                        "canonical_name": {"type": "string", "maxLength": 300},
                        "korean_name": {"type": "string", "maxLength": 300},
                        "english_name": {"type": "string", "maxLength": 300},
                        "acronym": {"type": "string", "maxLength": 100},
                        "description": {"type": "string", "maxLength": 240},
                        "source_ordinal": {"type": "integer"},
                    },
                    "required": [
                        "key", "concept_type", "canonical_name", "korean_name",
                        "english_name", "acronym", "description", "source_ordinal",
                    ],
                },
            },
            "relations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "source_key": {"type": "string", "maxLength": 120},
                        "target_key": {"type": "string", "maxLength": 120},
                        "relation_type": {"type": "string", "maxLength": 50},
                        "label": {"type": "string", "maxLength": 100},
                        "evidence": {"type": "string", "maxLength": 500},
                        "source_ordinal": {"type": "integer"},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                    "required": [
                        "source_key", "target_key", "relation_type", "label",
                        "evidence", "source_ordinal", "confidence",
                    ],
                },
            },
        }
        required = ["concepts", "relations"]
        if include_metadata:
            properties = {
                "title": {"type": "string", "maxLength": 200},
                "summary": {"type": "string", "maxLength": 800},
                **properties,
            }
            required = ["title", "summary", *required]
        return {
            "type": "object",
            "additionalProperties": False,
            "properties": properties,
            "required": required,
        }

    @staticmethod
    def _set_source_ordinal(result: dict[str, Any], source_ordinal: int) -> dict[str, Any]:
        # The server knows which local chunk was sent; never trust a model-generated ordinal.
        for item in result.get("concepts", []):
            item["source_ordinal"] = source_ordinal
        for item in result.get("relations", []):
            item["source_ordinal"] = source_ordinal
        return result

    def extract(self, text: str, source_ordinal: int = 0) -> dict[str, Any]:
        if not self.client:
            return {}
        try:
            response = self.client.responses.create(
                model=settings.openai_extraction_model,
                instructions=(
                    "Extract a high-recall knowledge graph from this document chunk. First scan the entire chunk, then rescan it for omissions before responding. "
                    "Return every meaningful explicit named entity and domain term supported by the text, not only representative items. Include repeated entities only once per chunk, but do include distinct sub-organizations, systems, equipment, programs, events, policies, places, people, documents, and technical terms. "
                    "For a dense 24,000-character chunk, capture dozens of distinct concepts when supported. Keep descriptions to one short factual phrase and keep relation labels/evidence concise so output budget is spent on coverage. "
                    "Use exactly one concept_type from: organization, organization_unit, person, country, region, place, technology, equipment, system, project_program, policy_law, event, document. "
                    "For every concept provide a stable key, canonical_name, korean_name, english_name, acronym, a concise factual description, and source_ordinal. "
                    "Preserve Korean and English names and abbreviations when they appear. Do not invent translations, facts, or relationships; generic words without document-specific meaning are not concepts. "
                    "Create directly supported relations wherever the text states or clearly expresses them, including type-of, part-of, belongs-to, located-in, uses, operates, develops, participates-in, causes, targets, cooperates-with, temporal, and ownership relations. Use source_key and target_key values that exactly match concept keys. "
                    "Prioritize recall for concepts, but require direct textual evidence for every relation."
                ),
                input=text,
                max_output_tokens=settings.openai_extraction_max_output_tokens,
                text={"format": {"type": "json_schema", "name": "knowledge_extraction", "strict": True, "schema": self._extraction_schema()}},
                store=False,
            )
            return self._set_source_ordinal(json.loads(response.output_text), source_ordinal)
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def extract_gap(self, text: str, existing_concepts: list[str], source_ordinal: int = 0) -> dict[str, Any]:
        """Run one bounded omission scan only when the first pass is unusually sparse."""
        if not self.client:
            return {}
        try:
            response = self.client.responses.create(
                model=settings.openai_extraction_model,
                instructions=(
                    "Perform an omission-only rescan of the supplied document chunk. "
                    "Find meaningful explicit concepts that the first extraction likely missed. Do not repeat any existing concept or alias, and do not create generic words or unsupported inferences. "
                    "Return concise concept records and only relations whose endpoints are present in this response or the existing concept list and whose evidence is explicit in the chunk. "
                    "Use the same 13 allowed concept types. Prioritize coverage of named entities, sub-organizations, technologies, equipment, systems, programs, policies, events, places, people, and documents."
                ),
                input=json.dumps({"chunk": text, "existing_concepts": existing_concepts[:200]}, ensure_ascii=False),
                max_output_tokens=settings.openai_extraction_max_output_tokens,
                text={"format": {"type": "json_schema", "name": "knowledge_gap_extraction", "strict": True, "schema": self._extraction_schema(False)}},
                store=False,
            )
            return self._set_source_ordinal(json.loads(response.output_text), source_ordinal)
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def answer(
        self,
        question: str,
        evidence: list[dict[str, Any]],
        *,
        previous_response_id: str | None = None,
        conversation_context: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        if not self.client:
            return {
                "answer": "OpenAI API key is not configured; showing local search results.",
                "citations": [],
                "insufficient_evidence": True,
                "response_id": None,
            }
        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "answer": {"type": "string"},
                "citations": {"type": "array", "items": {"type": "string"}},
                "insufficient_evidence": {"type": "boolean"},
            },
            "required": ["answer", "citations", "insufficient_evidence"],
        }
        try:
            response = self.client.responses.create(
                model=settings.openai_model,
                instructions=(
                    "Answer in Korean using only the supplied evidence. "
                    "Interpret the question in its most natural way and give one direct answer first, followed by at most three concise supporting bullets. Never ask the user to clarify or offer alternative questions. "
                    "Do not refuse merely because the evidence does not state the exact conclusion verbatim. "
                    "For forecasts or rankings, if the evidence cannot establish a definitive ranking, say that clearly and provide the best-supported candidates and reasons as explicitly labeled inference. "
                    "Set insufficient_evidence=true only when the evidence is empty, unrelated, or cannot support any useful conclusion. "
                    "Use [1], [2], [3] to refer to supplied evidence in the answer when useful. Never print UUIDs, document_id values, internal IDs, or instructions to ask another question. "
                    "The citations array may contain only document_id strings present in the supplied evidence. "
                    "Previous conversation context is only for resolving references; do not treat it as new evidence."
                ),
                input=json.dumps(
                    {
                        "question": question,
                        "evidence": evidence,
                        "conversation_context": conversation_context or [],
                    },
                    ensure_ascii=False,
                ),
                text={"format": {"type": "json_schema", "name": "grounded_answer", "strict": True, "schema": schema}},
                previous_response_id=previous_response_id,
                store=True,
            )
            result = json.loads(response.output_text)
            result["response_id"] = getattr(response, "id", None)
            return result
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def agent_response(
        self,
        *,
        instructions: str,
        input_items: Any,
        tools: list[dict[str, Any]],
        previous_response_id: str | None = None,
    ) -> Any:
        if not self.client:
            raise DomainError("AI_NOT_CONFIGURED", "OpenAI API key is not configured.", 503)
        try:
            return self.client.responses.create(
                model=settings.openai_model,
                instructions=instructions,
                input=input_items,
                tools=tools,
                tool_choice="auto",
                parallel_tool_calls=False,
                include=["web_search_call.action.sources"],
                max_tool_calls=settings.agent_max_tool_calls,
                previous_response_id=previous_response_id,
                store=True,
            )
        except Exception as exc:
            raise self._provider_error(exc) from exc

    def review_answer(self, question: str, draft: dict[str, Any], evidence: list[dict[str, Any]]) -> dict[str, Any]:
        """Check and, when needed, repair a grounded answer without adding evidence."""
        if not self.client:
            return {}
        schema = {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "grounded": {"type": "boolean"},
                "issues": {"type": "array", "maxItems": 8, "items": {"type": "string", "maxLength": 200}},
                "answer": {"type": "string", "maxLength": 5000},
                "citations": {"type": "array", "maxItems": 3, "items": {"type": "string"}},
                "insufficient_evidence": {"type": "boolean"},
            },
            "required": ["grounded", "issues", "answer", "citations", "insufficient_evidence"],
        }
        try:
            response = self.client.responses.create(
                model=settings.openai_model,
                instructions=(
                    "You are the final answer quality reviewer for a private knowledge base. "
                    "Compare the draft only with the supplied evidence. Remove unsupported claims, repair citation references, and keep useful cautious inferences when they are clearly labeled. "
                    "Do not add outside knowledge, UUIDs, internal IDs, URLs, or a request for clarification. "
                    "Return a concise direct Korean answer followed by at most three bullets. Set insufficient_evidence=true only if no useful conclusion is supported. "
                    "The citations array may contain only document_id values present in the evidence."
                ),
                input=json.dumps({"question": question, "draft": draft, "evidence": evidence}, ensure_ascii=False),
                text={"format": {"type": "json_schema", "name": "reviewed_grounded_answer", "strict": True, "schema": schema}},
                store=False,
            )
            return json.loads(response.output_text)
        except Exception:
            # A critic must never make an otherwise usable answer unavailable.
            return {}

    def delete_resources(self, file_id: str | None, vector_store_id: str | None, vector_store_file_id: str | None) -> None:
        if not self.client:
            return
        try:
            if vector_store_file_id and vector_store_id:
                self.client.vector_stores.files.delete(vector_store_id=vector_store_id, file_id=vector_store_file_id)
            if file_id:
                self.client.files.delete(file_id)
        except Exception as exc:
            raise self._provider_error(exc) from exc

    @staticmethod
    def _search_result(result: Any) -> dict[str, Any]:
        content = getattr(result, "content", []) or []
        parts = []
        for item in content:
            value = getattr(item, "text", None)
            if value is not None:
                parts.append(str(value))
            elif isinstance(item, dict) and item.get("text"):
                parts.append(str(item["text"]))
        return {
            "file_id": getattr(result, "file_id", ""),
            "filename": getattr(result, "filename", ""),
            "score": float(getattr(result, "score", 0) or 0),
            "content": "\n".join(parts),
        }

    @staticmethod
    def _provider_error(exc: Exception) -> DomainError:
        name = type(exc).__name__.lower()
        if "timeout" in name:
            return DomainError("AI_TIMEOUT", "AI request timed out.", 504, True)
        if "rate" in name or "429" in str(exc):
            return DomainError("AI_RATE_LIMITED", "AI request was temporarily rate limited.", 429, True)
        return DomainError("AI_PROVIDER_ERROR", "An error occurred while communicating with OpenAI.", 502, True)
