# 멀티턴 AI 챗봇 구현 계획

## 1. 목표와 범위

기존 `POST /api/knowledge/ask` 기반의 단일 질문·답변 기능을 대화형 RAG로 확장한다.

- 후속 질문은 같은 대화의 이전 질문·답변을 맥락으로 사용한다.
- 매 턴 현재 질문에 대해 기존 로컬 FTS5와 OpenAI Vector Store 검색을 수행한다.
- 답변은 기존과 같이 최대 3개의 근거 청크와 문서 링크를 포함한다.
- 답변·질문·근거 스냅샷은 로컬 SQLite에 저장하여 히스토리에서 대화를 다시 연다.
- 로그인, 다중 사용자, 멀티모달 입력, 음성, 스트리밍 토큰, 외부 공유는 범위에 포함하지 않는다.

## 2. 현재 구현 분석

### 백엔드

- `backend/app/api/routes/knowledge.py`의 `POST /ask`는 `question`만 받고 매번 독립 검색한다.
- 로컬 검색 결과와 Vector Store 결과를 합쳐 최대 3개를 근거로 선택하고, `SearchHistory`와 `SearchHistorySource`에 한 번의 질문·답변 및 근거를 저장한다.
- `SearchHistory`에 `response_id` 필드는 있지만 현재 저장하지 않는다.
- `backend/app/integrations/openai_adapter.py`의 `answer()`는 Responses API를 사용하지만 `previous_response_id`를 받지 않고 `store=False`로 호출한다.
- 검색 질의가 현재 질문만이므로 “그것”, “앞서 말한 정책” 같은 후속 질문의 검색 정확도가 낮다.
- 답변 JSON schema의 citation 타입과 로컬 문서 ID 처리도 멀티턴 작업에서 함께 정리해야 한다.
- Alembic에는 `search_history`를 대화 단위로 묶을 컬럼과 데이터 보정 마이그레이션이 없다.

### 프론트엔드

- `frontend/src/app/App.tsx`가 `question` 1개와 `answer` 1개만 상태로 보유한다.
- `frontend/src/features/ask/AskPage.tsx`와 `AnswerCard.tsx`가 단일 답변 화면만 렌더링한다.
- `frontend/src/api/client.ts`의 `ask()`는 문자열만 받고 `conversation_id`를 전송하지 않는다.
- `frontend/src/mocks/data.ts`도 매번 독립 히스토리를 추가하므로 데모에서 대화 지속성을 검증할 수 없다.
- `HistoryPage`는 턴 목록만 표시하고 대화 전체를 다시 불러오는 동작이 없다.

## 3. 확정 설계

### 3.1 대화 식별과 저장

기존 `search_history`를 대화의 턴 저장소로 재사용한다. MVP에서 별도의 `chat_conversations`, `chat_turns` 테이블을 추가하지 않는다.

`search_history` 추가 필드:

- `conversation_id`: 대화 공개 ID, UUID 문자열, 인덱스. 기존 행은 각 행의 `public_id`를 값으로 채워 독립 대화로 보정한다.
- `turn_index`: 대화 내 0부터 시작하는 순번, `(conversation_id, turn_index)` 인덱스.

대화 제목은 첫 턴의 질문을 화면에서 축약해 표시하며 별도 제목 컬럼은 만들지 않는다. `SearchHistorySource`는 그대로 턴별 근거 스냅샷으로 사용한다. OpenAI의 `response_id`는 다음 턴의 `previous_response_id`로만 사용하고 클라이언트에는 노출하지 않는다.

### 3.2 Responses API 상태 전략

새 대화의 첫 답변부터 `store=true`로 Responses API를 호출하고 반환된 response ID를 저장한다. 다음 턴에는 직전 턴의 response ID를 `previous_response_id`로 전달한다. 매 턴 시스템 지침은 다시 전달한다. `conversation`과 `previous_response_id`는 함께 사용하지 않는다.

이 방식은 reasoning/output 상태를 직접 재구성하지 않아 MVP 구현이 단순하다. 대신 OpenAI 측 응답 보존이 발생하므로 문서와 환경설정에 명시한다. 문서·추출용 호출은 기존처럼 `store=false`를 유지한다. 장기적으로 원격 보존을 허용하지 않는 모드가 필요하면 로컬 transcript 재전송 모드를 별도 설계한다.

### 3.3 검색과 답변 흐름

1. 클라이언트가 `conversation_id` 없이 첫 질문을 보낸다.
2. 서버가 새 대화 ID를 만들고, 기존 대화 ID가 있으면 활성 턴을 순서대로 조회한다.
3. 검색용 질의를 현재 질문과 최근 대화 맥락으로 구성한다. 원문 전체가 아니라 최근 질문·답변의 길이를 제한한 텍스트를 사용한다.
4. ready 문서 대상 로컬 FTS5 검색과 Vector Store 검색을 병렬 또는 기존 순서로 실행한다.
5. Vector Store 결과를 로컬 문서·청크로 매핑하고, 실패하거나 결과가 없으면 로컬 결과를 사용한다. 근거는 최대 3개로 제한한다.
6. 현재 질문, 현재 근거, 필요한 최근 대화 맥락을 Responses API에 전달한다. 모델은 제공 근거에 없는 사실을 만들지 않고, 현재 근거가 부족하면 명시한다.
7. citation은 서버가 현재 근거의 문서 ID 집합으로 검증한다. 잘못된 citation은 제거하고, 유효 citation이 없으면 검색된 근거 순서를 사용한다.
8. 응답 ID, 질문·답변, 상태, 근거 snapshot을 한 트랜잭션으로 저장한다.
9. `conversation_id`, 턴 ID, 턴 순번, 답변, 참고 문서를 반환한다.

근거가 없는 질문도 대화 흐름을 끊지 않는다. 모델이 설정된 경우 빈 근거로 호출하여 “저장 자료에서 확인할 수 없음” 답변과 response ID를 저장한다. 모델이 설정되지 않은 경우 로컬 고정 안내를 저장한다. 어떤 경우에도 근거 없는 사실을 생성하지 않는다.

### 3.4 검색 계획·답변 검수 흐름

검색과 답변을 한 번의 생성 호출에 맡기지 않는다.

1. 검색 계획 LLM이 질문과 최근 대화 맥락을 분석해 `intent`, `entities`, `concept_terms`, `queries`, `filters`를 JSON으로 반환한다.
2. 서버는 계획의 검색어와 원문 질의를 사용해 Vector Store, SQLite FTS5, 지식그래프 근거 엣지를 조회한다. 계획 LLM의 문서 ID·근거 주장은 검색 결과로 신뢰하지 않는다.
3. 서버가 로컬 청크 매핑을 통과한 최대 3개 근거를 확정한다.
4. 답변 LLM이 확정 근거만 사용해 초안을 생성한다. 관련 근거가 있으면 제한적 추론을 허용하되 확정 사실과 추론을 구분한다.
5. 검수 LLM이 초안과 근거를 검사해 `grounded`, `issues`, `answer`, `citations`, `insufficient_evidence`를 반환한다.
6. 검수 결과가 유효하면 최종 답변으로 사용하고, 문제가 있으면 검수 결과의 수정 답변을 사용한다. 검수 호출 실패 시 초안을 폐기하지 않고 초안에 서버의 근거·인용 검증만 적용한다.

검색 계획과 검수 결과는 운영 로그에 원문 없이 기록할 수 있으나, MVP에서는 사용자 history에 별도 노출하거나 저장하지 않는다.

## 4. API 변경 계획

기존 endpoint를 유지하고 하위 호환 가능한 선택 필드만 추가한다.

### `POST /api/knowledge/ask`

요청:

- `question`: string, 필수, 1~2000자
- `conversation_id`: string|null, 선택. 없으면 새 대화 생성
- `save_history`: boolean, 기본 true. 멀티턴 지속에는 true 필요
- `document_ids`: string[]|null, 선택. 기존 문서 범위 제한 유지

응답 `data`:

- `conversation_id`: string|null
- `turn_id`: string|null. 기존 `history_id`와 동일한 공개 ID
- `turn_index`: integer|null
- `history_id`: 기존 호환 필드
- `question`, `answer`, `references`, `retrieved_count`, `insufficient_evidence`, `related_concepts`, `model`: 기존 의미 유지

`references`는 항상 순위·문서 ID·문서명·청크 ID/순번·발췌·점수·로컬 매핑 상태·URL을 포함하고 최대 3개다. OpenAI 장애, 잘못된 conversation ID, 저장 실패는 기존 표준 오류 envelope을 사용한다.

### `GET /api/knowledge/chat/conversations`

대화 목록을 최신 활동 순으로 반환한다. `page`, `page_size`, `q`를 지원한다. 각 항목은 `conversation_id`, 첫 질문 축약 제목, 마지막 질문/답변 축약, `turn_count`, `last_turn_index`, `created_at`, `updated_at`을 포함한다. 기존 `/history`는 턴 목록 호환 API로 유지한다.

### `GET /api/knowledge/chat/conversations/{conversation_id}`

대화의 삭제되지 않은 모든 턴을 `turn_index` 오름차순으로 반환한다. 각 턴은 `turn_id`, `question`, `answer`, 상태, 생성 시각, 근거 `references`, `retrieved_count`, `insufficient_evidence`, `model`을 포함한다. 존재하지 않는 대화는 `NOT_FOUND` 404다.

### `DELETE /api/knowledge/chat/conversations/{conversation_id}`

해당 대화의 모든 턴을 soft delete한다. 근거 snapshot도 보존하여 기존 삭제 정책과 일관성을 유지한다. 성공 응답은 `conversation_id`, `deleted_count`, `deleted`를 포함한다.

### 기존 history API 보강

`GET /history`, `GET /history/{history_id}` 결과에 `conversation_id`, `turn_index`를 추가한다. 기존 필드와 URL은 제거하지 않는다. 오류는 `{error:{code,message,details},meta}` envelope을 유지한다.

## 5. 구현 범위 분할과 반복 절차

각 범위 시작 직전에 이 문서와 해당 설계 문서·코드를 다시 읽고, 변경 대상과 현재 상태가 계획과 일치하는지 확인한다. 범위 완료 후 해당 범위 테스트를 실행한다.

### 백엔드

#### B1. 모델·마이그레이션

- `knowledge.py`: `SearchHistory.conversation_id`, `turn_index` 및 인덱스 추가.
- 새 Alembic migration: 컬럼 추가, 기존 행 backfill, 인덱스 생성.
- `models/__init__.py`, `alembic/env.py` 등록 상태 확인.
- 기존 삭제·export·health 흐름에 영향이 없는지 확인.

#### B2. OpenAI adapter 상태 지원

- `openai_adapter.py`: `answer()`에 `previous_response_id`, 최근 transcript context 인자를 추가.
- Responses API 호출에 `previous_response_id`, `store=true`를 적용하고 매번 instructions를 전송.
- 응답 ID를 answer 결과와 함께 반환.
- citation JSON schema를 문서 ID에 맞는 string 배열로 정정하고 `output_text` 파싱 실패·provider error를 기존 DomainError로 변환.
- 기존 extraction 호출의 `store=false`와 timeout/retry 정책은 유지.

#### B3. 대화 서비스·API

- `knowledge_service.py` 또는 신규 `chat_service.py`: 대화 조회, 턴 순번 계산, 검색 질의 context 구성, 대화 목록 집계, 근거 snapshot 직렬화.
- `knowledge.py` route: `ask`에 conversation 흐름과 이전 response ID 전달.
- 새 conversation 목록/상세/삭제 route 추가.
- 기존 history route에 대화 필드 추가.
- 동시 요청 시 동일 대화의 순번 충돌을 방지하고, 실패 시 DB를 commit하지 않는다.

#### B4. 백엔드 검증

- migration 신규 DB/기존 DB 모두 적용.
- OpenAI adapter 단위 테스트: 최초 호출, `previous_response_id` 후속 호출, citation 검증, 빈 근거, provider 실패.
- route 테스트: 새 대화, 후속 턴, 잘못된 ID, 3개 근거, 히스토리 재조회, 대화 삭제.
- API key 미설정 mock/fallback과 기존 검색·history 회귀 테스트.

#### B5. 검색 계획 LLM

- `openai_adapter.py`: `plan_search()` 추가. Responses API strict JSON Schema로 의도·개념·검색어·필터를 반환한다.
- `knowledge.py`: 원문 질의와 검색 계획의 query variants를 중복 제거해 검색하고, 계획 결과 자체는 근거로 취급하지 않는다.
- 계획 호출 실패 시 원문 질의와 기존 로컬 검색만으로 계속 처리한다.
- `docs/02_api_spec.md`, `docs/external/openai.md`: 검색 계획은 내부 단계이며 기존 ask 응답 계약은 유지한다고 명시한다.

#### B6. 답변 검수 LLM

- `openai_adapter.py`: `review_answer()` 추가. 초안·질문·근거를 입력받아 근거성, 주장-근거 연결, 과도한 추론, 인용 ID를 검사하고 수정 답변을 반환한다.
- `knowledge.py`: 답변 생성 직후 검수 호출, 유효한 document ID와 최대 3개 citation만 서버에서 최종 검증한다.
- 검수 실패·타임아웃은 전체 질문 실패로 만들지 않고 초안과 서버 검증 결과를 사용한다.
- `insufficient_evidence`는 근거가 비어 있거나 유의미한 결론을 전혀 지지하지 못할 때만 true로 확정한다.

#### B7. 통합 검증·운영 문서

- 검색 계획이 한글·영문·약어 질의를 생성하는지 검증한다.
- 잘못된 문서 ID, 근거에 없는 주장, citation 누락·초과, 검수 실패 fallback을 테스트한다.
- 응답 envelope와 기존 Frontend 타입을 유지하는지 확인한다.

### 프론트엔드

#### F1. 타입·API client

- `types/search.ts`: `conversation_id`, `turn_id`, `turn_index`와 대화 턴 타입 추가.
- `types/history.ts`: conversation summary/detail 타입 추가.
- `api/client.ts`: `ask` payload 객체화, conversation 목록/상세/삭제 함수 추가.
- API 호출 실패가 기존 `request()` 오류 처리와 일관되게 동작하도록 유지.

#### F2. App 상태·Mock

- `app/App.tsx`: 현재 `conversationId`, `turns`, loading/error, 새 대화 상태를 관리.
- 질문 성공 시 턴을 append하고, 대화 열기 시 서버 상세로 전체 턴을 hydrate한다.
- `mocks/data.ts`: conversation별 mock 턴 저장, 후속 질문 응답, 목록/상세/삭제 구현.
- live API와 mock API의 반환 타입을 동일하게 유지하여 Mock 제거 시 화면 코드를 바꾸지 않는다.

#### F3. 챗 화면

- `features/ask/AskPage.tsx`: 단일 답변 화면을 transcript 화면으로 전환.
- 턴마다 사용자 질문, AI 답변, 최대 3개 EvidenceList, 관련 개념을 표시.
- 새 대화, 후속 질문 입력, 진행/실패/근거 부족 상태, 마지막 답변 자동 스크롤을 제공.
- 기존 문서 링크·개념 노드 이동 동작을 각 턴에서도 유지.

#### F4. 대화 히스토리

- `features/history/HistoryPage.tsx`, `HistoryList.tsx`: 턴 나열 대신 대화 단위 목록과 턴 수/최근 질문을 표시.
- 항목 클릭 시 대화 상세를 불러와 Ask 화면으로 이동.
- 기존 단일 history 데이터도 conversation ID가 없으면 단일 턴 대화로 표시.

#### F5. 프론트 검증

- mock 기준 새 질문, 후속 질문, 새 대화 초기화, history 재진입, 참고 링크 클릭을 확인.
- API 오류·빈 결과·긴 답변·모바일 폭에서 레이아웃을 확인.
- TypeScript build 및 기존 그래프/자료 추가 흐름 회귀 확인.

## 6. 파일 변경 요약

| 영역 | 파일 | 변경 |
|---|---|---|
| 계획 | `docs/implementation/chatbot-plan.md` | 본 구현 계획 및 결정사항 |
| 제품/계약 | `docs/PRD.md` | 멀티턴 대화 여정, 화면, 수용 기준, 제외 범위 갱신 |
| DB | `docs/01_database_model.md`, `backend/app/models/knowledge.py` | 턴 그룹화 필드·보정 규칙 |
| API | `docs/02_api_spec.md`, `backend/app/api/routes/knowledge.py` | ask 확장, conversation API, history 보강 |
| OpenAI | `docs/external/openai.md`, `backend/app/integrations/openai_adapter.py` | Responses 상태 연결·store 정책·구조화 출력 |
| Backend 구조 | `docs/04_backend_architecture.md`, `backend/app/services/` | chat service와 범위 분리 |
| Frontend 구조 | `docs/03_design_system.md`, `docs/05_frontend_architecture.md`, `frontend/src/` | transcript·대화 목록·상태 모델 |
| DB 변경 | `backend/alembic/versions/` | conversation 컬럼 및 기존 데이터 backfill |
| 테스트 | `backend/tests/`, `frontend/` 테스트/빌드 설정 | 멀티턴·회귀 검증 |

## 7. 예외·운영 규칙

- 이전 response ID가 만료되거나 조회 불가하면 현재 턴을 저장하지 않고 표준 AI provider 오류를 반환한다. 사용자는 새 대화를 시작하거나 재시도할 수 있으며, 로컬 최근 transcript 기반 root 복구는 후속 보완 범위다.
- 모델 응답이 JSON schema를 위반하면 답변을 저장하지 않고 표준 502를 반환한다.
- 근거 0개인 답변은 참고 문서 링크를 표시하지 않고 `insufficient_evidence=true`를 표시한다.
- 현재 턴의 검색 결과만 근거로 citation을 검증한다. 이전 턴의 문서가 다시 검색되지 않았으면 현재 답변의 참고 문서로 재사용하지 않는다.
- 대화 ID는 서버가 생성·검증한다. 클라이언트가 임의 ID를 보내면 404로 처리한다.
- 연속 질문은 저장을 기본값으로 하며, `save_history=false`는 기존 단일 요청 호환용으로만 사용한다. 이 경우 대화 ID와 후속 맥락을 보장하지 않는다.
- 대화 목록과 상세는 soft-deleted 턴을 제외한다. 문서가 삭제되어도 history snapshot의 텍스트는 보존하고 링크만 비활성화한다.

## 8. 추가 결정 필요 사항과 권장안

### 8.1 검색 근거와 지식그래프 연결 보강

현재 턴의 근거는 `Vector Store → 로컬 chunk 매핑 → 로컬 FTS → 지식그래프 concept/evidence edge` 순서로 통합한다. 외부 파일 ID 또는 content가 현재 로컬 문서·청크와 확인되지 않으면 근거에서 제외한다. FTS에 직접 매칭되지 않아도 질의가 개념 FTS에 매칭되면 해당 개념의 근거 엣지를 따라 원문 청크와 문서를 검색 결과로 보충한다. 최종 답변에는 검증된 문서 청크만 최대 3개를 전달한다.

1. OpenAI 응답 보존: 멀티턴의 기본 구현은 `store=true` + `previous_response_id`를 권장한다. 구현이 단순하고 reasoning 상태를 안전하게 이어갈 수 있다. 개인 자료의 원격 보존을 허용하지 않으면 후속 단계에서 `store=false` 수동 transcript 재전송 모드를 추가한다.
2. 대화 제목 편집: MVP는 첫 질문 자동 축약으로 시작하고, 사용자가 제목을 직접 편집해야 할 때만 `conversation_title` 컬럼과 PATCH API를 추가한다.
3. 스트리밍: Agent 전환부터 `POST 202 + SSE`와 polling fallback으로 실행 이벤트를 전달한다. 기존 동기 `/ask`는 호환 facade로만 유지한다.
4. 컨텍스트 길이: Agent 전환부터 서버는 최근 3턴과 문자 예산을 넘는 transcript를 제외한다. 대화 요약은 구현하지 않는다.
5. 대화 삭제: MVP는 로컬 soft delete만 수행한다. OpenAI 저장 response의 원격 삭제 정책과 API 제공 여부는 배포 전 별도 확인한다.
6. 동시성: 단일 로컬 사용을 전제로 하되, 동일 conversation에 대한 중복 요청 방지를 위해 프론트 submit 잠금과 서버의 순번 재조회/검증을 함께 적용한다.

7. Agent 전환: 도구 선택·반복·한도·오류·실행 이벤트는 `docs/implementation/agent-plan.md`의 Orchestrator와 `agent_runs/agent_events/agent_references` 계약으로 이전한다. 이 문서의 선형 검색 계획→답변→검수 흐름은 legacy 호환 참고로만 유지한다.
