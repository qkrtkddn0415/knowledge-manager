# 04. Backend Architecture

## 0. 목표와 범위

FastAPI 기반 백엔드는 개인용 Second Brain의 데이터 정본, 자료 적재 오케스트레이션, OpenAI 연동, 검색·답변, 파일 보존을 담당한다.

아키텍처 방향:

- MVP는 하나의 모듈형 애플리케이션으로 유지한다.
- 기능별 경계를 분리해 이후 작업 실행 방식이나 저장소를 교체할 수 있게 한다.
- 외부 AI 호출을 API route에 직접 넣지 않는다.
- 모든 처리 상태를 DB에 기록해 화면이 재조회할 수 있게 한다.
- 긴 적재 작업은 요청-응답 수명과 분리하되 별도 메시지 시스템은 도입하지 않는다.
- 서비스 재시작·OpenAI 장애·부분 성공을 전제로 복구 가능하게 한다.
- OpenAI 응답은 로컬 정본에 검증·매핑된 뒤에만 그래프와 답변에 사용한다.

## 1. 런타임 경계

요청 흐름:

Frontend → API Router → Application Service → Repository/Integration → Response Envelope

적재 흐름:

Upload → Local File Storage → Document/Job 저장 → OpenAI File/Vector Store → Local Chunk Mapping → Responses Extraction → Graph Commit

질문 흐름:

Question → Vector Store Search → Local Chunk Match → Grounded Answer → Citation Validation → History Snapshot

각 계층의 규칙:

- Router: HTTP 입력·출력·상태 코드만 담당
- Schema: 외부 요청·응답 형태와 필드 검증
- Service: 사용자 시나리오와 상태 전이 조정
- Repository: SQLModel 세션과 쿼리 캡슐화
- Integration: OpenAI SDK와 외부 오류 변환
- Storage: 로컬 파일의 경로 검증·읽기·쓰기·삭제
- Model: DB 영속 구조와 제약

## 2. 권장 디렉터리 구조

backend/

    app/
        main.py
        core/
            config.py
            errors.py
            logging.py
            constants.py
        api/
            deps.py
            routes/
                health.py
                documents.py
                ingestions.py
                graph.py
                search.py
                history.py
                settings.py
                transfer.py
        schemas/
            common.py
            documents.py
            ingestions.py
            graph.py
            search.py
            history.py
            settings.py
            transfer.py
        models/
            base.py
            document.py
            chunk.py
            concept.py
            graph.py
            ingestion.py
            history.py
            setting.py
        repositories/
            documents.py
            chunks.py
            concepts.py
            graph.py
            ingestions.py
            history.py
            settings.py
        services/
            document_service.py
            ingestion_service.py
            analysis_service.py
            graph_service.py
            search_service.py
            answer_service.py
            history_service.py
            settings_service.py
            transfer_service.py
        integrations/
            openai/
                client.py
                files.py
                vector_store.py
                responses.py
                errors.py
        storage/
            local_files.py
            backup_archive.py
            secrets.py
        tasks/
            runner.py
            recovery.py
        utils/
            text.py
            chunking.py
            hashing.py
            citations.py
        db.py
    alembic/
        env.py
        versions/
    tests/
        api/
        services/
        repositories/
        integrations/
        fixtures/
    pyproject.toml

패키지의 __init__.py는 실제 패키지에 포함한다. routes는 리소스별로 나누되, 하나의 기능이 여러 서비스로 흩어지지 않도록 문서·적재·검색·히스토리 경계를 유지한다.

## 3. 모듈 책임

### 3.1 app.main

- FastAPI 앱 생성
- CORS와 middleware 등록
- request_id 생성·전파
- route 등록
- startup에서 DB·파일 저장소·미완료 작업 복구
- shutdown에서 작업 실행기 정리

앱 생성 시 외부 OpenAI 호출을 수행하지 않는다. 설정 유효성은 health와 실제 작업에서 분리해 표시한다.

### 3.2 core

config:

- 환경 변수·기본값·경로·크기 제한
- OpenAI answer model·extraction model, vector_store_id, timeout, retry 설정
- 개발·배포 환경별 데이터 루트

errors:

- DomainError와 세부 오류 코드
- HTTP 상태로 변환할 정보
- 사용자 메시지와 내부 원인 분리

logging:

- request_id, job_id, document_id, operation, latency
- API 키·원문·질문 전문 제외
- 외부 오류의 안전한 요약

constants:

- 문서 상태
- 작업 단계
- 개념 유형
- 최대 크기·페이지 크기

### 3.3 api

route는 다음만 수행한다.

1. 입력 schema 검증
2. 의존성에서 DB 세션·서비스 얻기
3. application service 호출
4. 공통 response envelope 반환

route에서 SQL 쿼리, OpenAI SDK, 원문 청킹, 프롬프트를 직접 호출하지 않는다.

### 3.4 schemas

요청 schema와 응답 schema를 분리한다. DB model을 그대로 API 응답으로 노출하지 않는다.

- 공통 envelope
- pagination meta
- error details
- document summary/detail
- analysis preview
- graph node/edge
- search result/reference
- job status
- history snapshot

응답에서 내부 PK, 원본 파일 절대 경로, OpenAI API 키를 제외한다.

### 3.5 models

01_database_model의 테이블과 제약을 SQLModel로 표현한다. 모델에는 비즈니스 흐름을 넣지 않는다. 상태 전이는 service가 검사한다.

관계:

- document ↔ chunks
- document ↔ ingestion_jobs
- concept ↔ aliases
- node ↔ document/chunk/concept
- edge ↔ node/evidence_chunk
- history ↔ history_sources

### 3.6 repositories

Repository는 세션을 새로 생성하지 않고 호출자로부터 전달받은 세션을 사용한다. 외부에 query object나 ORM model을 반환하지 말고 service가 쓸 수 있는 model 또는 projection을 반환한다.

필수 repository 작업:

- 활성 문서 목록·상세·hash 중복 조회
- 문서와 청크 교체
- 개념 alias 후보 검색·생성·갱신
- 그래프 범위 조회
- FTS5 검색
- 작업 상태 잠금·갱신
- 히스토리 snapshot 저장·조회

### 3.7 services

document_service:

- 문서 상세·목록·수정·삭제 요청 조정
- 원문 수정 금지
- 삭제 작업 시작과 활성 화면 숨김

ingestion_service:

- 입력 정규화·hash 중복 검사. `.txt`, `.md`, 텍스트형 `.pdf`를 지원하며 PDF는 PyMuPDF로 추출한 텍스트를 canonical content로 사용한다.
- 원본 파일 저장
- ingestion_job 생성
- 단계별 진행·상태 저장
- retry/cancel/confirm 처리

analysis_service:

- 청크 생성
- Vector Store 적재 결과 확인
- 청크별 개념·관계 추출
- 구조화 결과 검증
- 개념 정규화·후보 판정

graph_service:

- 문서·청크·개념 graph node 생성
- contains/mentions/relation edge 생성
- 문서 재분석 시 소유 그래프 교체
- 고립 개념 정리
- 화면 좌표·카메라·사용자 레이아웃은 관리하지 않음

search_service:

- keyword·semantic·hybrid 모드 선택
- FTS5 결과 조합
- Vector Store 결과를 로컬 청크에 매핑
- score와 match_type 정규화

answer_service:

- 최대 3개 근거 생성
- 근거 컨텍스트 구성
- Responses API 호출
- 구조화 답변 검증
- citation ID를 검색 결과와 대조

history_service:

- 질문·답변·근거 snapshot 저장
- 삭제된 문서 상태 표시
- 목록·상세·삭제

settings_service:

- 첫 실행 안내 완료 여부와 화면 설정 조회·변경
- OpenAI API 키 입력·변경 요청을 secrets 저장 경계로 전달
- Vector Store ID와 AI 기능 사용 가능 상태 관리
- 키 원문을 DB model·API response·로그에 전달하지 않음

transfer_service:

- 백업 archive 생성
- import 검증·중복 정책·재적재 작업

storage/secrets:

- 환경 변수 또는 배포파일 전용 로컬 비밀 저장 영역에서 API 키를 읽고 갱신
- 평문 키를 SQLite app_settings, Frontend, 일반 로그에 저장하지 않음
- 키가 없을 때도 로컬 문서·그래프·FTS 검색을 사용할 수 있게 상태만 제공

## 4. 작업 실행 방식

MVP는 별도 외부 queue 없이 프로세스 내부의 단일 작업 실행기를 사용한다.

- HTTP 요청은 job을 queued로 저장하고 202를 반환한다.
- 작업 실행기는 queued job을 하나씩 실행한다.
- 실행 단계마다 ingestion_jobs를 갱신한다.
- Frontend는 job 조회를 polling한다.
- 서버 재시작 시 running 작업을 재검사해 queued 또는 failed로 되돌린다.
- 동시에 실행하는 OpenAI 적재·분석 작업은 기본 1개로 제한한다.

이 방식은 개인용 로컬 서비스의 복잡도를 낮추면서 진행 상태와 재시작 복구를 제공한다. 작업량이 커지면 실행기만 별도 프로세스나 queue로 교체한다.

### 작업 단계

| 단계 | DB 기록 | 완료 조건 |
|---|---|---|
| validating | 입력 검증 | 형식·크기·빈 내용 통과 |
| storing_source | 원본 저장 | 상대 경로와 hash 기록 |
| chunking | 청크 생성 | ordinal·offset 유효 |
| uploading | Files 업로드 | openai_file_id 기록 |
| indexing | Vector Store 등록 | vector_store_file_id 기록 |
| waiting_index | 외부 색인 상태 기록 | status 저장, 로컬 분석 계속 |
| extracting | 개념·관계 추출 | JSON Schema 검증 |
| graphing | 로컬 그래프 저장 | FK·근거 무결성 통과 |
| review_ready | 사용자 검토 | preview 반환 |
| storing | 확정 결과 반영 | FTS·그래프 commit |
| ready | 완료 | 검색·그래프 노출 |

분석 preview 단계에서는 확정 그래프를 노출하지 않는다. 저장 확정 후 하나의 DB 트랜잭션으로 문서 요약·개념·엣지·FTS를 반영한다.

## 5. OpenAI Integration

### 5.1 역할 분리

integrations/openai/files:

- 원본 파일 업로드
- 파일 삭제
- 파일 ID와 오류 변환

integrations/openai/vector_store:

- Vector Store 파일 등록
- 처리 상태 조회
- 직접 검색
- 파일 삭제

integrations/openai/responses:

- 문서 구조화 추출
- 근거 기반 답변
- response_id·usage·모델 기록

OpenAI SDK 호출은 integrations 안에서만 수행한다. 서비스는 OpenAI 객체 대신 내부 DTO와 DomainError를 받는다.

### 5.2 적재 기준

- 전체 원문 파일을 Files API와 Vector Store에 전달한다.
- 로컬 canonical chunk는 24,000자 목표와 500자 overlap으로 생성한다.
- OpenAI Vector Store가 반환하는 검색 content는 local chunk의 normalized_text와 exact containment를 먼저 비교한다.
- exact가 없으면 token overlap 또는 문장 단위 overlap으로 가장 높은 후보를 찾는다.
- 매핑이 확정되지 않으면 citation으로 사용하지 않는다.
- Vector Store 파일 status와 로컬 문서 ready 상태는 분리한다. 외부 status가 `in_progress`여도 로컬 분석·검토·그래프 저장을 진행하며, 검색 시 외부 결과가 없거나 매핑되지 않으면 SQLite FTS를 사용한다.

OpenAI Vector Store 검색 API의 결과는 file_id, filename, score, content를 내부 SearchHit으로 변환한다. ask는 외부 결과를 최대 10개까지 받아 현재 로컬 문서로 매핑되는 항목을 추린 뒤, 최종 근거를 3개로 제한한다.

### 5.3 Responses API 사용

- 문서 추출과 답변 합성 모두 Responses API를 사용한다.
- 구조화 결과는 strict JSON Schema로 요청한다.
- SDK의 output_text를 우선 사용하고 output 배열의 순서를 가정하지 않는다.
- 멀티턴 질문은 `SearchHistory.conversation_id`와 `turn_index`로 묶고, 각 턴의 `response_id`를 다음 Responses API 호출의 `previous_response_id`로 전달한다.
- 매 턴 현재 질문의 RAG 검색을 새로 수행하고, 현재 턴의 근거만 citation으로 검증한다. 이전 턴의 history snapshot은 대화 표시와 검색 맥락 구성에 사용한다.
- 멀티턴 답변은 `store=true`로 호출해 Responses 상태를 이어간다. 응답 ID는 서버 DB에만 저장하고 클라이언트에는 노출하지 않는다.
- 문서 분석·추출 호출은 개인정보 최소화를 위해 기존처럼 `store=false`를 유지한다. 원격 응답 보존을 허용하지 않는 모드는 후속 수동 transcript 재전송 모드로 분리한다.
- 필요 시 request metadata에 local document/job ID를 넣되 민감한 원문은 넣지 않는다.
- 검색 계획 호출은 `store=false`로 수행하며 intent·entities·concept_terms·queries·filters만 반환한다. 계획이 반환한 문서 ID나 사실은 근거로 사용하지 않는다.
- 답변 생성 후 검수 호출도 `store=false`로 수행한다. 검수는 초안·질문·확정 근거만 받아 수정 답변과 citation 후보를 반환하며, 최종 문서 ID·청크·근거 수는 서버가 재검증한다.

### 5.4 프롬프트 계약

analysis prompt:

- 문서에 명시된 개념만 추출
- 13개 concept_type 중 하나 선택
- 한글명·영문명·약어 산출
- 설명 최소화
- 관계마다 source_key, target_key, evidence 요구
- 추측·중복 개념 억제

answer prompt:

- 제공된 근거만 사용
- 근거 번호 외 임의 citation 금지
- 충돌하는 근거는 함께 표시
- 근거 부족 시 insufficient_evidence=true
- 기본 3~5문장 또는 핵심 bullet
- 관련 근거가 있으면 정확한 순위가 없어도 후보와 이유를 제한적 추론으로 제시

search planner prompt:

- 답변하지 않고 intent, entities, concept_terms, queries, filters만 반환
- 한글·영문·약어·도메인 동의어를 검색어에 포함
- 계획이 만든 문서 ID·사실은 근거로 사용하지 않음

answer critic prompt:

- 초안의 주장과 근거 청크의 연결을 확인
- 근거 없는 주장·잘못된 citation을 제거하거나 수정
- 관련 근거가 있으면 유용한 제한적 추론을 유지하고, 근거가 전혀 없을 때만 insufficient_evidence=true

프롬프트와 schema 버전은 설정 가능한 상수로 관리하고, 응답 snapshot에 버전을 기록한다.

### 5.5 재시도·오류

- 400 계열 입력·schema 오류는 재시도하지 않는다.
- 401·403은 구성 오류로 즉시 실패한다.
- 429와 일시적 5xx는 Retry-After를 우선하고 제한된 지수 backoff를 적용한다.
- quota·billing 오류는 재시도하지 않는다.
- 업로드·삭제·작업 생성은 hash와 상태로 중복을 막는다.
- OpenAI 오류 전문은 사용자에게 노출하지 않고 내부 로그의 안전한 원인만 보존한다.

## 6. 트랜잭션 경계

### 업로드 시작

원본 파일을 임시 경로에 저장 → hash 확인 → documents draft와 job queued 저장. 파일 저장 성공과 DB 기록이 어긋나면 정리 작업이 필요하다.

### 분석 확정

검토 결과를 입력 검증 → 기존 문서 소유 청크·그래프 삭제 표시 → 새 청크·개념 연결·엣지·FTS 저장 → document ready 전환을 하나의 DB 트랜잭션으로 처리한다.

외부 OpenAI 호출은 DB 트랜잭션 안에서 오래 유지하지 않는다. 외부 호출 결과를 메모리에서 검증한 후 짧은 commit 단계로 반영한다.

### 삭제

로컬 화면에서 숨김 → 삭제 job 생성 → 로컬 데이터 삭제 → 외부 리소스 삭제 시도 → 결과 기록. 외부 삭제가 실패해도 로컬 화면에서 삭제된 것으로 보이게 하되, 정리 실패 상태를 job과 health에 남긴다.

## 7. 상태·동시성 규칙

- 한 document에 running ingestion job은 하나만 허용한다.
- confirm은 review_ready에서만 실행한다.
- 같은 confirm 재요청은 이미 succeeded이면 성공으로 응답한다.
- 삭제 중인 문서는 검색·그래프에 포함하지 않는다.
- 삭제 job은 queued → running → deleting → succeeded 또는 failed로 전이한다.
- 재분석 중인 문서는 기존 ready 결과를 유지하거나 숨기는 정책을 하나로 고정한다. 초기 선택은 기존 결과를 유지하되 새 결과가 확정될 때 교체한다.
- 그래프 조회는 하나의 snapshot에서 nodes와 edges를 생성해 서로 다른 버전을 섞지 않는다.
- FTS와 원본 상태가 어긋나면 재구축 명령으로 복구한다.

## 8. 파일 저장소

데이터 루트:

- originals: 사용자 원본
- temp: 업로드·가져오기 중간 파일
- exports: 사용자가 요청한 백업
- logs: 민감정보를 제외한 운영 로그

규칙:

- 파일명은 서버 생성 ID와 안전한 확장자로 만든다.
- 원본 경로는 데이터 루트 상대 경로만 DB에 저장한다.
- 심볼릭 링크·경로 순회·임의 절대 경로를 거부한다.
- 쓰기는 임시 파일 → flush → atomic rename 순서로 수행한다.
- 문서 삭제 시 원본 파일과 임시 잔여 파일을 정리한다.
- 백업에는 원문과 분석 데이터가 함께 포함되어야 한다.

## 9. 관측성

모든 job과 외부 요청에 다음을 기록한다.

- request_id
- job_id
- document_id
- operation
- step
- start/end/latency
- model
- OpenAI response_id
- 입력·출력 토큰 수가 제공되는 경우의 usage
- 재시도 횟수
- 최종 상태와 안전한 오류 코드

기록하지 않는 것:

- API 키
- 원문 전체
- 질문 전체
- OpenAI 응답 전체

## 10. 테스트 전략

unit:

- 24,000자·500자 overlap 청킹
- Unicode·공백 정규화
- hash 중복
- 개념 alias 정규화
- OpenAI 청크와 local chunk 매핑
- citation ID 검증
- 상태 전이

repository:

- FK·cascade·unique 제약
- FTS5 동기화
- 페이지네이션·필터
- 삭제된 자료 제외

service:

- 입력 → review_ready
- confirm → ready
- 외부 업로드 실패·재시도
- partial deletion
- 근거 없음·충돌 근거·unresolved citation

API:

- 모든 endpoint의 envelope
- 202 polling
- validation·404·409·413·429·502
- CORS와 요청 ID

integration:

- OpenAI SDK mock
- Vector Store file status 시나리오
- Responses structured output 성공·실패
- OpenAI 장애 시 로컬 데이터 보존

## 11. 배포파일 전환 고려

배포파일에서도 다음 백엔드 계약은 유지한다.

- 데이터 루트는 사용자가 확인·백업할 수 있다.
- 설정과 데이터의 위치를 버전 업그레이드에서 보존한다.
- 웹 개발 환경과 동일한 export/import 형식을 사용한다.
- API 키가 없으면 문서·그래프·로컬 검색은 가능하고 AI 기능만 안내 상태가 된다.
- 프로세스 시작 시 DB migration과 미완료 job 복구를 수행한다.
- 파일 저장 경로를 실행파일 설치 위치와 분리한다.

## 12. 최종 설계 기준

- Route는 얇고 service는 시나리오 중심이다.
- 외부 연동은 교체 가능한 integration 경계 안에 있다.
- DB는 상태와 근거의 정본이다.
- 그래프는 문서·청크·개념 데이터에서 일관되게 재생성 가능하다.
- 모든 AI 결과는 schema·근거·무결성 검증을 통과해야 사용자에게 확정 데이터로 보인다.

## 13. 현재 MVP 구현 매핑

- `app/services/knowledge_service.py`: 문서 적재·청킹·분석 확정·그래프·FTS의 애플리케이션 서비스
- `app/integrations/openai_adapter.py`: Files, Vector Store, Responses API의 교체 경계
- `app/storage/local_files.py`: 데이터 루트 내 원본 저장·경로 검증
- `app/api/routes/knowledge.py`: 명세의 문서·적재·그래프·검색·질문·히스토리 HTTP 계약
- `app/api/routes/settings.py`, `transfer.py`: 설정 및 export/import 계약
- `app/core/errors.py`, `app/api/response.py`: 표준 오류·envelope

초기 MVP에서는 개인용 단일 프로세스의 복잡도를 낮추기 위해 일부 애플리케이션 서비스와 리소스 route를 하나의 모듈에 묶었다. 외부 계약과 OpenAI·저장소 경계는 분리되어 있으므로 이후 작업 실행기·repository를 별도 모듈로 추출해도 API 계약을 변경하지 않는다.

### 멀티턴 질문 모듈 경계

- `chat_service.py`를 추가해 conversation 조회·턴 순번·검색용 최근 context·대화 목록 집계를 담당한다.
- `answer_service.py`는 현재 질문·현재 RAG 근거·선택적 이전 response ID를 adapter에 전달하고, 반환 response ID와 구조화 답변을 route에 반환한다.
- `history_service.py`는 턴과 `SearchHistorySource` snapshot을 같은 트랜잭션으로 저장하고 대화 삭제 시 soft delete를 수행한다.
- `knowledge.py` route는 HTTP validation/envelope만 담당하며, 대화 오케스트레이션과 citation 정책을 서비스 경계 안에 둔다.
- 동시 요청은 단일 로컬 프로세스의 submit lock과 DB 재조회로 같은 conversation의 turn index 충돌을 방지한다.

### PDF 및 그래프 정합성 보완

- PDF 업로드 시 라우트에서 PyMuPDF로 텍스트를 추출하고, 추출 결과를 canonical content로 `create_ingestion`에 전달한다. 원본 바이너리는 로컬 파일 저장소에 보존한다.
- `run_ingestion`은 파일 단위로 청킹·Vector Store 업로드·개념/관계 추출을 수행하고 `review_ready`에서 중단한다. confirm 이후에만 그래프 노드와 edge를 생성한다.
- Vector Store 첨부는 파일 ID와 `in_progress` 상태를 즉시 기록하고 완료를 동기 대기하지 않는다. 외부 색인이 늦어도 로컬 청킹·분석·그래프 확정은 계속 진행하며 검색은 로컬 근거로 fallback한다.
- 그래프 조회는 삭제된 문서에 속한 document/chunk 노드와 활성 문서의 evidence가 없는 orphan concept 노드를 제외한다. 문서 목록과 그래프 snapshot의 활성 범위를 일치시킨다.
- 개념 추출 프롬프트는 13개 허용 타입, 한글/영문/약어, 근거 기반 관계, 높은 recall을 명시한다. 구조화 출력 검증에서 허용되지 않은 타입과 존재하지 않는 관계 키는 저장하지 않는다.
- 챗봇 검색은 Vector Store 결과를 로컬 문서 청크와 먼저 매핑한다. 매핑되지 않은 외부 결과는 폐기하고, 로컬 FTS 및 지식그래프의 개념 노드와 근거 엣지를 통해 `concept → evidence_chunk → document`로 이어지는 결과를 fallback으로 합쳐 최대 3개 근거를 구성한다. 한국어 조사 제거·prefix 검색으로 `기술은`처럼 활용형이 붙은 질의도 검색한다.
- 한국어 질문과 영문 개념명이 다른 경우에는 Responses API로 원문·영문·약어·도메인 동의어 검색어를 확장한다. 확장 질의는 원문 질의와 동일하게 로컬 청크 매핑 검증을 거치며, 확장 호출 실패 시 원문 질의로 계속한다. 답변 프롬프트는 관련 근거가 있으면 후보와 제한적 추론을 제시하고, 근거가 전혀 없을 때만 답변 불가 상태를 사용한다.
### Extraction coverage and merge

- `run_ingestion` keeps the full original file for Vector Store indexing but calls extraction once per local canonical chunk.
- The adapter overwrites model-provided `source_ordinal` with the server-known chunk ordinal.
- `merge_chunk_analyses` merges concepts by normalized canonical/alternate names and type, remaps relation keys, and preserves all source ordinals.
- `validate_analysis` keeps `source_ordinals` and `source_chunk_ids`; `apply_analysis` creates mention and relation evidence edges for every retained source chunk.
- Extraction uses a high-recall first pass with a 20,000-token default output budget (`OPENAI_EXTRACTION_MAX_OUTPUT_TOKENS`). Concept descriptions and evidence fields are length-bounded so the response budget is spent on coverage. The prompt requires a full scan plus an omission rescan, but does not force concepts that the source does not support.
- For a dense chunk at least 9,000 characters long, the worker runs one additional omission-only pass when the first pass yields fewer than `max(8, min(24, character_count // 3,000))` concepts. This pass excludes already extracted names and only adds explicit, source-backed concepts and relations. Disable it with `OPENAI_EXTRACTION_GAP_PASS=false` when latency is preferred over recall.
- Concept extraction is recall-oriented; relation extraction remains precision-oriented and requires explicit evidence. The application still merges aliases and removes invalid endpoints before persistence.
- Chunk extraction is network-bound and uses a bounded thread pool (`OPENAI_EXTRACTION_WORKERS`, default 3). Results are reassembled by chunk ordinal before merge; database writes and progress updates remain serialized in the ingestion session.

### Source-owned graph material and shared concepts

`knowledge_service` enforces provenance at the chunk level:

1. `apply_analysis` creates one document node, optional source-local chunk nodes, and shared concept nodes.
2. Every `mentions`, `contains`, and extracted concept-to-concept relation edge stores the source chunk in `evidence_chunk_id`.
3. `cleanup_deleted_document` deletes edges by the deleted document's chunk IDs, then deletes document/chunk nodes. It never cascades directly into a shared `Concept`.
4. `refresh_concept_liveness` counts active ready-document IDs per concept from active evidence edges. Concepts with at least one source remain active; concepts with none are soft-deleted and omitted from graph/search responses.
5. `run_ingestion` applies the same evidence-edge cleanup before replacing old chunks. This prevents obsolete relations from surviving re-analysis.

The invariant is: a visible relation must have an active source chunk, and a visible concept must have at least one active source-backed edge.
### Property-graph 교환

- `services/graph_transfer.py`가 canonical SQLite graph를 Neo4j 호환 property-graph JSON으로 직렬화하고 외부 property-graph JSON을 현재 저장 모델로 병합한다.
- export에는 문서·청크·개념 및 근거 엣지가 포함되며, 프론트엔드의 source-satellite projection은 제외한다.
- import 관계는 기존 `GraphEdge`의 근거 청크 제약을 준수한다. 외부 파일에 근거가 없을 때만 `External graph import` 보조 출처를 만들고 `origin=imported`로 표시한다.

### 탐색형 Agent 모듈 경계

`app/agent/`는 `orchestrator`, `registry`, `prompts`, `events`, `references`, `tools/search_knowledge`, `tools/explore_node`, `tools/web_search`로 분리한다. Orchestrator만 loop·turn cap·상태 전이를 담당하고, OpenAI adapter는 provider 호출·output parsing만 담당한다. Tool은 기존 `knowledge_service`와 canonical graph 조회를 호출하며 자체 저장 모델을 만들지 않는다.

Agent 실행은 `POST 202` 후 bounded worker가 처리하고 `agent_events`를 기록한다. SSE는 event log를 읽어 전달하며 `Last-Event-ID` 재접속을 지원한다. `POST /ask`는 Agent 결과를 기다리는 호환 facade다. 모든 cycle에 system instructions를 다시 전달하고, custom function output은 다음 Responses 호출에 포함한다. OpenAI built-in web search는 provider 실행 결과를 서버 이벤트·출처로 정규화한다.
## 외부 웹 출처 importer

`app/services/web_source_service.py`가 명시적 저장 요청의 URL 검증·공개 IP 확인·안전한 redirect 재검증·응답 크기/Content-Type 제한·HTML 본문 추출을 담당한다. route는 취득한 텍스트를 기존 `create_ingestion`에 전달하고 `run_ingestion`을 background task로 실행한다. 외부 출처도 일반 원본과 같은 중복 검사, chunk, vector store, 개념 추출, 그래프 materialization을 통과한다. 네트워크 예외는 원문 URL이나 API key를 오류 메시지에 포함하지 않는다.
