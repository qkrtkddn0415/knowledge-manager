# Second Brain — OpenAI API 개발자 레퍼런스

개인 지식 자료를 업로드하면 문서 내용을 분석·연결하고, 질문에 대해 관련 문서 3개를 검색한 뒤 근거 링크와 함께 답변하는 서비스의 OpenAI 연동 기준서다.

- 기준일: 2026-09-10
- 적용 범위: 업로드, 벡터 검색, 지식 그래프 추출, 답변 생성, 보안, 장애 처리
- 공식 SDK: Python `openai`
- 기본 생성 모델: `gpt-5-mini`
- 기본 벡터 저장소: OpenAI Vector Store + File Search
- 애플리케이션 DB: SQLite + SQLModel + Alembic
- 사용 형태: 단일 사용자 로컬 웹서비스. 로그인은 없지만 API 키는 반드시 서버에만 둔다.

## 1. 확정 아키텍처

```text
문서 업로드
  → 로컬 Document 생성 및 SHA-256 중복 검사
  → OpenAI Files API 업로드
  → Vector Store 파일 등록(외부 처리는 비동기)
  → Responses API로 엔티티·관계 구조화 추출
  → SQLite에 Document / KnowledgeNode / KnowledgeEdge 저장

질문
  → 검색 계획 생성
  → 원문·계획 질의로 Vector Store 검색, max_num_results=10
  → 로컬 매핑 후 최종 근거 최대 3개 확정
  → file_id를 로컬 Document로 매핑
  → 검색 결과를 근거로 Responses API 답변 생성
  → 답변 + 로컬 문서 링크 3개 반환
```

### 시스템별 책임

| 구성 | 저장·책임 |
|---|---|
| SQLite | 원문 메타데이터, 파일 해시, OpenAI ID, 그래프 노드·엣지, 로컬 문서 URL |
| OpenAI Files | 검색 대상 원본 파일 |
| OpenAI Vector Store | 파일 파싱·청킹·임베딩·검색 인덱스 |
| Responses API | 구조화된 지식 추출 및 답변 합성 |
| Frontend | 3D 그래프와 문서 패널 렌더링. OpenAI API 직접 호출 금지 |

OpenAI Vector Store를 쓰면 애플리케이션이 임베딩과 청킹을 직접 관리하지 않아도 된다. 오프라인 실행파일, 완전한 로컬 보관, 외부 API 차단이 필수인 배포판에서는 별도 로컬 임베딩 DB 구성을 사용한다.

## 2. 환경 변수와 초기 설정

`backend/.env`에만 설정한다.

```dotenv
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
OPENAI_EXTRACTION_MODEL=gpt-4o-mini
OPENAI_VECTOR_STORE_ID=vs_...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

`OPENAI_EMBEDDING_MODEL`은 자체 벡터 DB를 선택할 때만 사용한다. OpenAI Vector Store를 사용할 때 검색 임베딩은 OpenAI가 처리한다.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -U openai
```

```python
from openai import OpenAI

client = OpenAI()  # OPENAI_API_KEY를 환경 변수에서 읽음
```

원칙:

- 키를 React 코드, 브라우저 요청, 저장소 커밋, 로그에 넣지 않는다.
- 서버에서만 `Authorization: Bearer` 인증을 수행한다.
- 개발·운영 키를 분리하고 프로젝트별 지출·사용량 제한을 설정한다.
- 키가 노출되면 즉시 폐기하고 새 키로 교체한다.
- `127.0.0.1` 바인딩은 단일 사용자 로컬 배포의 기본값으로 유지한다.

## 3. 모델과 API 선택

### 3.1 Responses API

직접 텍스트 생성, 도구 호출, 구조화된 출력, 상태성 상호작용은 Responses API를 사용한다. 이 서비스는 Chat Completions에 새 기능을 맞추지 않는다.

```python
response = client.responses.create(
    model="gpt-5-mini",
    instructions="주어진 근거만 사용해 답변한다.",
    input="질문과 검색 결과를 처리한다.",
)
answer = response.output_text
```

응답 내부 배열의 첫 요소가 항상 텍스트라고 가정하지 않는다. SDK의 `output_text`를 우선 사용한다. 모델과 스냅샷은 설정값으로 주입하고, 품질 평가 후 운영에서 스냅샷을 고정할 수 있다.

### 3.2 생성 모델

질문 답변은 `OPENAI_MODEL`(기본 `gpt-5-mini`), 문서 구조화 추출은 `OPENAI_EXTRACTION_MODEL`(기본 `gpt-4o-mini`)을 사용한다. 문서 추출은 출력 필드가 많아 응답 지연을 줄이는 별도 모델을 둔다.

- 문서 분석: 짧은 입력이면 낮은 reasoning effort 또는 기본 설정
- 질문 답변: 검색 결과 3개만 컨텍스트로 전달
- 출력 길이: 서비스 화면에 필요한 범위로 `max_output_tokens` 제한
- 긴 원문 전체를 매번 모델에 전달하지 말고 Vector Store 검색 결과만 전달

### 3.3 임베딩 모델

자체 벡터 DB가 필요할 때 `text-embedding-3-small`을 사용한다.

- 검색·군집화·추천용 임베딩 모델
- 기본 벡터 차원: 1536
- API 입력 최대 토큰 수: 공식 모델 문서의 현재 제한을 적용
- 임베딩과 검색 인덱스의 모델·차원은 전체 데이터셋에서 동일하게 유지

자체 임베딩을 사용할 때의 최소 호출:

```python
response = client.embeddings.create(
    model="text-embedding-3-small",
    input="검색 또는 문서 청크 텍스트",
)
vector = response.data[0].embedding
```

## 4. 문서 업로드와 적재

### 4.1 입력 정책

지원 형식은 `.txt`, `.md`, 텍스트형 `.pdf`다. PDF는 로컬에서 텍스트를 추출해 canonical content로 사용하고, 원본 파일은 보관 및 OpenAI 업로드 대상으로 사용한다. 업로드 시 다음을 적용한다.

1. 확장자와 실제 MIME을 검증한다.
2. UTF-8로 정규화하되 원본 파일명과 원문은 로컬에 보존한다.
3. 애플리케이션 크기 제한을 먼저 적용한다. 현재 기본값은 512 MiB이며 `MAX_DOCUMENT_BYTES`로 조정한다.
4. Vector Store 파일 첨부 응답의 `status`는 `in_progress`일 수 있으므로 업로드 요청에서 완료까지 동기 대기하지 않는다. 상태 ID를 저장하고 검색 시점에 준비 여부를 확인한다.
4. 내용의 SHA-256을 계산해 동일 문서를 중복 적재하지 않는다.
5. 로컬 `Document`를 `ingesting` 상태로 만든다.
6. OpenAI Files 업로드 → Vector Store 등록 순서로 실행하고, `in_progress` 상태에서는 로컬 분석을 계속한다. 검색 시 외부 인덱스가 준비되지 않으면 로컬 FTS 결과를 사용한다.
7. 처리 성공 후 `openai_file_id`, `vector_store_file_id`, 상태, 오류 메시지를 기록한다.

### 4.2 Files API와 Vector Store

```python
file = client.files.create(
    file=open(local_path, "rb"),
    purpose="user_data",
)

vector_store_file = client.vector_stores.files.create(
    vector_store_id=vector_store_id,
    file_id=file.id,
)
```

Vector Store 파일의 `status`는 `in_progress`, `completed`, `failed` 등이 될 수 있다. 현재 구현은 업로드 요청에서 완료까지 폴링하지 않고 상태를 저장한다. `failed` 상태는 외부 검색 결과에서 제외하고 로컬 문서·청크 검색으로 fallback한다. 다수 파일을 한 번에 올릴 때는 Vector Store file batch API를 사용해 개별 요청 수를 줄인다.

삭제 시 로컬 문서, Vector Store 파일, Files API 파일을 함께 정리한다. Vector Store와 Files 데이터는 자동으로 로컬 DB 삭제와 동기화되지 않는다.

권장 로컬 필드:

```text
Document
  id, filename, content, content_hash
  openai_file_id, vector_store_file_id
  ingest_status, ingest_error, created_at, updated_at
```

### 4.3 문서 분석용 구조화 출력

문서 분석 결과는 자유 형식 텍스트가 아니라 JSON Schema로 받는다. 노드 ID는 애플리케이션이 최종 확정하고, 모델은 안정적인 임시 키와 라벨을 제안한다.

```python
schema = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "nodes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "key": {"type": "string"},
                    "label": {"type": "string"},
                    "kind": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": ["key", "label", "kind", "description"],
            },
        },
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "source_key": {"type": "string"},
                    "target_key": {"type": "string"},
                    "relation": {"type": "string"},
                    "evidence": {"type": "string"},
                },
                "required": ["source_key", "target_key", "relation", "evidence"],
            },
        },
    },
    "required": ["nodes", "edges"],
}

response = client.responses.create(
    model="gpt-4o-mini",  # OPENAI_EXTRACTION_MODEL
    instructions=(
        "문서에 명시되거나 강하게 근거된 개념과 관계만 추출한다. "
        "추측한 관계는 만들지 않는다."
    ),
    input=document_text,
    text={
        "format": {
            "type": "json_schema",
            "name": "knowledge_extraction",
            "strict": True,
            "schema": schema,
        }
    },
)
analysis = json.loads(response.output_text)
```

구조화 출력 스키마 규칙:

- 객체는 `additionalProperties: false`를 사용한다.
- 모든 속성을 `required`에 넣고 선택값은 nullable 또는 빈 문자열로 표현한다.
- 모델 결과를 그대로 DB에 신뢰하지 말고 길이, 중복, 참조 무결성을 검증한다.
- `source_key`, `target_key`가 실제 `nodes[].key`에 존재하는 엣지만 저장한다.
- 동일 문서 재분석 시 해당 문서가 소유한 노드·엣지를 교체한다.

## 5. 검색: 질문당 관련 문서 3개

### 5.1 권장 경로: Vector Store 직접 검색

직접 검색을 사용하면 상위 3개 결과를 서버에서 명확히 통제하고, 각 결과를 로컬 문서 링크로 매핑하기 쉽다.

```python
page = client.vector_stores.search(
    vector_store_id=vector_store_id,
    query=user_question,
    max_num_results=10,
)

for result in page.data:
    print(result.file_id, result.filename, result.score)
```

검색 결과 처리 규칙:

- `max_num_results`는 매 검색당 최대 10으로 요청하고, 로컬 매핑·중복 제거 후 최종 근거를 3개로 제한한다.
- `score`, `file_id`, `filename`, content chunk를 보관한다.
- `file_id → Document.id`를 로컬 DB에서 매핑한다.
- 매핑되지 않은 파일은 답변 근거에서 제외하고 운영 로그에 남긴다.
- 결과가 3개 미만이면 실제 개수만 사용하고 부족함을 답변에 명시한다.
- 임계값을 도입할 때는 고정 숫자보다 평가 데이터로 결정한다.
- 검색 결과가 없으면 모델을 호출하지 않고 “관련 자료를 찾지 못했다”고 반환할 수 있다. 한국어 질의와 영문 개념명이 다르면 Responses API로 번역·약어·도메인 동의어 검색어를 생성해 재검색하되, 확장 실패 시 원문 질의를 사용한다.

### 5.2 대안: Responses API의 File Search 도구

모델이 검색 도구를 직접 호출하게 하려면 다음 형태를 사용한다.

```python
response = client.responses.create(
    model="gpt-5-mini",
    input=user_question,
    tools=[
        {
            "type": "file_search",
            "vector_store_ids": [vector_store_id],
        }
    ],
)
```

이 방식은 모델 중심의 검색·답변 흐름에 적합하지만, 이 서비스의 “정확히 상위 3개 문서와 로컬 링크 반환” 계약에는 5.1의 직접 검색이 기본값이다. File Search 결과를 검사하거나 디버깅할 때는 `include=["file_search_call.results"]`를 사용한다.

### 5.3 자체 벡터 DB를 쓰는 경우

OpenAI Embeddings API로 문서 청크와 질문을 벡터화하고, SQLite 확장·FAISS·Chroma 등 별도 인덱스에서 cosine similarity를 계산한다. 이 경로는 다음 상황에서만 선택한다.

- 앱이 외부 Vector Store 없이 완전히 오프라인이어야 함
- 파일과 벡터를 모두 로컬에 둬야 함
- 검색 알고리즘·메타데이터 필터를 직접 제어해야 함

현재 저장소의 `embedding_json` 기반 로컬 유사도 코드는 이 대안의 fallback이다. OpenAI Vector Store를 운영 기본값으로 채택하면 `vector_store_file_id`와 검색 결과를 기준으로 전환한다.

## 6. 답변 생성과 인용

검색 결과를 모델에 전달할 때 각 문서에 애플리케이션 문서 ID를 붙인다. 모델이 임의의 파일명·URL을 생성하게 하지 않는다.

```python
evidence = [
    {
        "document_id": document.id,
        "title": document.filename,
        "score": result.score,
        "content": result_content,
    }
    for result, document, result_content in retrieved
]

response = client.responses.create(
    model="gpt-5-mini",
    instructions=(
        "검색 근거만 사용해 한국어로 답한다. 관련 근거가 있으면 정확한 순위가 없어도 후보와 이유를 직접 요약하고, 확정 사실과 추론을 구분한다. "
        "근거에 없는 사실은 추측하지 않는다. 답변 본문에는 UUID·document_id를 출력하지 않고 [1], [2], [3] 근거 번호를 사용한다. "
        "답변 끝에 사용한 document_id만 citations에 넣는다."
    ),
    input=json.dumps(
        {"question": user_question, "evidence": evidence},
        ensure_ascii=False,
    ),
    text={
        "format": {
            "type": "json_schema",
            "name": "grounded_answer",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "answer": {"type": "string"},
                    "citations": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "insufficient_evidence": {"type": "boolean"},
                },
                "required": ["answer", "citations", "insufficient_evidence"],
            },
        }
    },
)
```

검색 계획 prompt:

- 답변을 생성하지 않고 intent, entities, concept_terms, queries, filters만 JSON으로 반환한다.
- 한글 질의와 문서의 영문 개념명이 다를 수 있으므로 번역·약어·도메인 동의어를 검색어에 포함한다.
- 계획이 반환한 문서·사실·ID는 근거로 신뢰하지 않고, 서버가 다시 검색한 로컬 청크만 근거로 확정한다.

답변 검수 prompt:

- 초안이 제공된 근거에 포함되는지, citation이 실제 문서와 연결되는지 검사한다.
- 근거에 없는 주장은 제거하고, 관련 근거가 있는 제한적 추론은 추론임을 표시해 유지한다.
- 검수 결과는 초안 수정용이며 최종 citation·근거 수·문서 링크는 서버가 다시 검증한다.

서버 검증:

1. `citations`의 ID가 실제 검색 결과의 `document_id`인지 확인한다.
2. 검색 결과에 없는 ID와 모델이 만든 URL은 제거한다.
3. citations를 로컬 URL로 변환한다. 예: `/api/knowledge/documents/{id}`.
4. 최종 응답은 `answer`, `references`, `retrieved_count`, `insufficient_evidence`를 반환한다.
5. 근거가 부족하면 그 사실을 명시하고 일반 지식으로 보충하지 않는다. 단, 관련 근거가 있으면 가능한 후보·추론과 한계를 함께 제시하고 무조건 거절하지 않는다.

권장 응답 형태:

```json
{
  "answer": "검색된 자료를 바탕으로 한 요약",
  "references": [
    {"document_id": 12, "title": "notes.md", "url": "/api/knowledge/documents/12", "score": 0.87}
  ],
  "retrieved_count": 1,
  "insufficient_evidence": false
}
```

## 7. 서비스 API 계약

현재 FastAPI 라우트와 다음 계약을 유지한다.

| 메서드 | 경로 | 용도 |
|---|---|---|
| `POST` | `/api/knowledge/ingestions` | `.txt`·`.md`·텍스트형 `.pdf` 또는 text 입력, 분석 작업 접수 |
| `GET` | `/api/knowledge/documents` | 문서 목록 |
| `GET` | `/api/knowledge/documents/{id}` | 원문·메타데이터 조회 |
| `GET` | `/api/knowledge/graph` | 3D 그래프 노드·엣지 조회 |
| `GET` | `/api/knowledge/search?q=...` | 키워드·문장 검색 |
| `POST` | `/api/knowledge/ask` | 질문 → 검색 3개 → 답변·참고 링크 |

`/api/knowledge/ingestions`는 202와 `job_id`를 반환한다. 작업이 `review_ready`가 되면 `/confirm`으로 제목·요약·포함 개념을 확정하고, 다시 polling해 `succeeded`를 확인한다. 기존 `/documents/upload`는 starter 호환용 동기 경로이며 새 구현의 기본 클라이언트 계약이 아니다.

프론트엔드는 그래프 노드 클릭 시 로컬 문서 ID로 문서를 조회한다. OpenAI `file_id`나 API 키를 브라우저에 전달하지 않는다.

`/api/knowledge/ask` 구현 순서:

1. 빈 질문과 과도한 길이를 거부한다.
2. 검색 계획 Responses 호출로 intent·개념·검색어를 만든다. 실패하면 원문 질의를 사용한다.
3. 원문 질의와 계획 질의를 Vector Store에서 각각 최대 10개 검색한다.
4. 검색 결과를 로컬 `Document`·`DocumentChunk`로 매핑하고, 매핑되지 않은 결과는 제외한다.
5. 근거 JSON을 생성한다.
6. Responses API로 구조화된 답변 초안을 생성하고, 별도 검수 Responses 호출로 근거성·인용·추론을 검사한다.
7. citations를 검증하고 로컬 링크로 변환한다.
8. 모델 사용량·요청 ID·처리 시간을 메타데이터에 남긴다.

## 8. 오류, 재시도, 제한

| 상황 | 처리 |
|---|---|
| 400 계열 입력·스키마 오류 | 재시도하지 않고 사용자/개발자 오류로 반환 |
| 401·403 | 설정 또는 키 권한 오류. 즉시 실패하고 키 값을 로그에 남기지 않음 |
| 404 | 삭제됐거나 잘못된 OpenAI 리소스. ID 동기화 점검 |
| 429 | `Retry-After`와 rate-limit reset 헤더 우선. 없으면 지수 백오프 + jitter |
| 500·502·503·504 | 제한된 횟수로 재시도. 멱등 작업만 재시도 |
| 네트워크 timeout | 짧은 연결 timeout과 충분한 read timeout을 분리 설정 |
| Vector Store 파일 `failed` | 로컬 실패 상태·오류 저장, 재처리 버튼 제공 |
| quota·billing 오류 | 자동 재시도하지 않고 운영 알림 |

재시도 정책:

- 최대 3회, 총 시간 제한을 둔다.
- 업로드 파일 생성·그래프 저장은 중복 방지를 위해 `content_hash`와 상태를 확인한다.
- Responses API 답변은 재시도 시 동일 요청이 중복 과금될 수 있으므로 요청 범위를 작게 유지한다.
- SDK 기본 재시도와 애플리케이션 재시도를 합산해 과도한 재시도가 되지 않게 한다.

로깅 필드:

```text
request_id, endpoint, model, local_document_id, vector_store_id
status, latency_ms, input_tokens, output_tokens, error_type
```

원문, 질문 전체, API 키는 기본 로그에 남기지 않는다. 디버그가 필요하면 마스킹·샘플링·보존 기간을 별도로 둔다.

## 9. 데이터 보안과 보존

- OpenAI API 데이터는 사용자가 명시적으로 옵트인하지 않는 한 모델 학습·개선에 사용되지 않는 정책을 기준으로 한다.
- abuse monitoring 로그와 API 기능별 보존 정책은 변경될 수 있으므로 운영 전 공식 데이터 정책을 다시 확인한다.
- Responses·Embeddings와 Vector Store·Files는 보존 특성이 다르다. Vector Store와 Files는 애플리케이션에서 삭제하지 않으면 남을 수 있다.
- 문서 삭제 기능은 SQLite 삭제만 수행하지 말고 OpenAI 리소스 삭제까지 포함한다.
- 장기 보존이 필요 없는 임시 업로드에는 Files/Vector Store 만료 정책을 검토한다.
- 민감한 개인 자료를 다루므로 외부 전송 범위, 삭제 동작, 백업 위치를 사용자에게 명확히 알린다.
- 실행파일 배포 시 API 키를 바이너리에 포함하지 않는다. 사용자별 환경 변수 또는 최초 실행 시 로컬 비밀 저장소를 사용한다.

## 10. 테스트와 품질 기준

최소 평가 세트를 고정한다.

- 검색: 정답 문서가 top-3에 포함되는지 `hit@3`
- 답변: 근거 문장과 일치하는지, 근거 없는 보충이 없는지
- 인용: 답변에 사용된 모든 문서가 실제 검색 결과인지
- 추출: JSON Schema 통과율, 노드 중복률, 엣지 참조 무결성
- 운영: 동일 파일 재업로드 멱등성, 삭제 동기화, 429·503 복구
- 비용: 문서당 입력·출력 토큰, 질문당 검색·생성 비용

모델 또는 프롬프트를 변경할 때 동일한 질문·문서 세트로 비교하고, 검색 품질과 인용 정확도가 유지될 때만 기본값을 변경한다.

## 11. 구현 체크리스트

- [ ] `OPENAI_API_KEY`가 백엔드 환경 변수에만 있음
- [ ] `OPENAI_VECTOR_STORE_ID`가 설정되고 파일 상태 완료를 확인함
- [ ] 문서 해시 기반 중복·재시도·실패 상태가 있음
- [ ] 구조화 출력에 strict JSON Schema 적용
- [ ] 검색 결과를 최대 3개로 제한
- [ ] 답변 citations를 서버에서 검증하고 로컬 문서 링크로 변환
- [ ] `output_text` 사용 및 output 배열 구조에 대한 안전한 처리
- [ ] 429·503에 제한된 지수 백오프 적용
- [ ] request ID·usage·latency를 기록하되 원문과 키는 기록하지 않음
- [ ] 삭제 시 SQLite와 OpenAI Files/Vector Store를 함께 정리
- [ ] 프론트엔드 번들에 OpenAI 키가 포함되지 않음

## 12. 공식 문서

- [API Overview](https://developers.openai.com/api/reference/overview)
- [Models: GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [Text generation guide](https://developers.openai.com/api/docs/guides/text)
- [Embeddings guide](https://developers.openai.com/api/docs/guides/embeddings)
- [File Search guide](https://developers.openai.com/api/docs/guides/tools-file-search)
- [Vector Store search API](https://developers.openai.com/api/reference/python/resources/vector_stores/methods/search)
- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits)
- [Your data](https://developers.openai.com/api/docs/guides/your-data)
- [Models: text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)

## 13. 멀티턴 Responses API

### 13.1 상태 연결 규칙

- 대화형 답변에는 Responses API를 사용한다.
- 첫 턴부터 `store=true`로 호출해 response ID를 확보한다.
- 후속 턴은 직전 response ID를 `previous_response_id`로 전달한다. `conversation`과 동시에 사용하지 않는다.
- `previous_response_id`를 사용해도 `instructions`는 매 요청 다시 전달한다. 이전 instructions가 자동 승계된다고 가정하지 않는다.
- 응답 본문은 `output[0]`을 직접 가정하지 않고 SDK의 `output_text`를 읽은 뒤 구조화 출력으로 검증한다.
- 문서 추출은 원격 상태가 필요 없으므로 기존 `store=false`를 유지한다.

### 13.2 Second Brain 적용

현재 질문과 현재 RAG 근거 최대 3개를 매 턴 입력한다. 후속 질문의 검색 품질을 위해 최근 로컬 질문·답변을 문자 예산 안에서 검색 질의에 반영하되, 현재 답변의 citation은 현재 턴에서 검색된 근거로만 검증한다. response ID는 SQLite `search_history.response_id`에 저장하고 브라우저에는 반환하지 않는다.

`store=true`는 OpenAI 측 응답 보존을 의미하므로 개인 자료 정책에 명시한다. 원격 보존을 허용할 수 없는 배포 환경에서는 `store=false`와 로컬 transcript 재전송을 사용하는 별도 모드를 추가한다. 긴 대화는 최근 턴 제한 또는 요약(compacting) 정책을 적용한다.

### 13.3 참고 공식 문서

- [Responses API create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [Latest model guidance: multi-turn and state](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.5)
### 4.6 Chunk-level extraction for coverage

- Upload the complete original file to Vector Store as the retrieval source.
- Send each local 24,000-character chunk with 500-character overlap to the Responses API extraction call.
- The server, not the model, owns the chunk ordinal. Replace returned ordinals with the request chunk ordinal before persistence.
- Merge same-type concepts by normalized canonical name, Korean/English name, or acronym. Remap relation endpoints after merge and keep all evidence chunk ordinals.
- Use a high-recall first pass: scan the complete chunk twice for omissions, extract every meaningful explicit entity, and keep descriptions, labels, and evidence short. Use `OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS=20000` by default; this is configurable.
- Run an omission-only second pass only for dense chunks (default: at least 9,000 characters) whose first-pass concept count is below `max(8, min(24, character_count // 3,000))`. Send the existing names to the second pass so it returns only missing concepts. Disable with `OPENAI_EXTRACTION_GAP_PASS=false` if latency is more important than recall.
- Keep concept extraction high-recall but require direct textual evidence for relations. Do not use a fixed concept count when the source does not support it; deduplicate aliases and preserve evidence chunk ordinals server-side.

## 14. 탐색형 Agent Responses API

Agent는 Responses API의 custom function tools와 OpenAI hosted `web_search`를 함께 사용한다. `search_knowledge`와 `explore_node`는 애플리케이션 function tool로 등록하고, web search는 현재 SDK/API reference의 built-in tool type을 사용한다. provider 버전 변경에 대비해 tool schema와 output item parser를 contract test로 고정한다.

- 모델 응답 output 배열에서 function call/message/web search call을 유형별로 순회한다. 첫 output item을 답변으로 가정하지 않는다.
- custom function call은 서버가 인자를 검증·실행하고 `function_call_output`을 다음 호출에 제공한다. 오류도 구조화된 tool output으로 전달해 모델이 재시도·대체 탐색할 수 있게 한다.
- `previous_response_id`를 사용해도 `instructions`는 매 호출 재전송한다. `conversation`과 병용하지 않는다. 서비스의 대화 source of truth는 SQLite의 최근 3개 질문·답변이다.
- `include`로 web search source를 수집하고, local chunk citation과 web citation을 별도 allowlist로 검증한다. 임의 URL·문서 ID는 제거한다.
- app-level 30 cycle/tool cap, timeout, rate-limit backoff, prompt injection 방어를 적용한다. OpenAI built-in tool의 `max_tool_calls`는 보조 제한일 뿐 전체 Agent loop 제한을 대체하지 않는다.

프롬프트와 function schema는 `backend/app/agent/prompts/agent_system.md`, `tool_instructions.md`, `tools.json`에서 로드하며 코드에 정책 문장을 하드코딩하지 않는다.
## 웹 검색 출처의 애플리케이션 처리

Responses API의 built-in web search를 사용할 때 `include`로 `web_search_call.action.sources`를 수집하고, 애플리케이션은 URL·제목·snippet만 서버 DB의 Agent reference로 보존한다. URL은 신뢰된 외부 출처 표시용이며, 지식 원본으로의 저장은 사용자의 별도 클릭 이후 로컬 importer가 안전성 검사를 수행할 때만 시작한다. 웹 검색 출처의 내용을 그대로 내부 지식으로 신뢰하지 않고 기존 ingestion의 분석·검토 상태를 거친다. 공식 참고: https://developers.openai.com/api/reference/cli/resources/responses/methods/create
### Agent 도구 선택 원칙

Responses API의 `tools`와 `tool_choice=auto`를 사용하되, 애플리케이션 system/tool prompt에서 direct answer·web-first·private-search 경계를 명시한다. 일반 질문은 모델이 도구 없이 `output_text`를 반환할 수 있어야 하며, 외부 최신 정보 요청은 built-in web search를 먼저 선택한다. 도구 호출 여부와 답변 상태는 분리해, 도구를 사용하지 않은 직접 답변을 근거 부족으로 잘못 표시하지 않는다.
