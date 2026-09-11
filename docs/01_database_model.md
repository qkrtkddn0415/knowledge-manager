# 01. Database Model

## 0. 목적과 설계 원칙

이 문서는 Second Brain의 원문·문서 청크·개념·관계·검색 히스토리·처리 상태를 SQLite에 일관되게 저장하기 위한 논리 모델을 정의한다.

- SQLite를 서비스의 로컬 정본으로 사용한다.
- 원본 파일은 로컬 파일 시스템에 저장하고, DB에는 식별자·메타데이터·경로를 저장한다.
- 검색과 인용에 필요한 청크 텍스트는 DB에 저장한다.
- OpenAI 리소스 ID는 로컬 레코드와 함께 저장해 동기화·삭제·장애 복구에 사용한다.
- 모든 사용자 데이터는 단일 로컬 사용자 영역에 속한다. 사용자·권한 테이블은 만들지 않는다.
- 모델의 자동 추출 결과는 초안 상태를 거쳐 검토·확정된 데이터만 활성 그래프에 반영한다.
- 삭제·재분석·재시도는 멱등적으로 수행할 수 있어야 한다.
- 내부 정수 ID와 외부 공개 식별자를 분리한다. API에는 UUID 형식의 public_id를 사용한다.
- 시간은 UTC ISO 8601로 저장하고 화면에서 로컬 시간으로 변환한다.

## 1. 논리 관계

자료 적재의 정본 흐름은 다음과 같다.

문서 1개는 원본 파일 1개, 로컬 청크 1개 이상, 그래프 문서 노드 1개를 가진다. 2개 이상의 청크가 있으면 청크별 그래프 노드를 추가한다. 개념은 여러 문서와 청크에 걸쳐 공유될 수 있다. 관계는 그래프 노드 사이에 생성되고, 반드시 근거 청크를 가리킨다.

| 관계 | 카디널리티 | 규칙 |
|---|---:|---|
| document → document_chunks | 1:N | 최소 1개. 순서와 원문 위치를 보존 |
| document → document_node | 1:1 | 활성 문서마다 하나 |
| document_chunks → chunk_node | 0:1 | 청크가 2개 이상인 문서에서만 그래프 노드 생성 |
| concept → concept_aliases | 1:N | 대표명·한글명·영문명·약어 검색 지원 |
| document/chunk/concept → graph_nodes | 1:1 | 하나의 실제 대상을 하나의 그래프 노드로 매핑 |
| graph_nodes → graph_edges | N:N | 자기 자신으로 향하는 관계는 금지 |
| graph_edge → document_chunk | N:1 | 관계의 근거. 항상 존재해야 함 |
| search_history → search_history_sources | 1:N | 질문 당시의 검색 근거 snapshot |
| ingestion_job → document | N:1 | 재시도·재분석 이력 보존 |

## 2. 공통 규칙

### 2.1 식별자

모든 영속 엔티티는 내부 기본키와 외부 식별자를 가진다.

- 내부 PK: SQLite INTEGER, 조인과 정렬에 사용
- public_id: UUID 문자열, API·URL·프론트 상태에 사용
- OpenAI ID: file_id, vector_store_file_id, response_id 등을 별도 필드에 저장
- public_id는 생성 후 변경하지 않는다.

### 2.2 공통 필드

문서·개념·히스토리·작업 테이블에는 다음 필드를 적용한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id | INTEGER | Y | 내부 PK |
| public_id | TEXT | Y | NOT NULL, UNIQUE, UUID |
| created_at | TEXT | Y | UTC, NOT NULL |
| updated_at | TEXT | Y | UTC, NOT NULL |

삭제 가능한 엔티티는 deleted_at을 추가한다. 활성 조회는 deleted_at IS NULL을 기본 조건으로 한다.

### 2.3 문자열 정규화

- 원문은 보존하되 검색용 값은 Unicode NFC로 정규화한다.
- 공백·줄바꿈·문장부호 정규화는 검색용 복사본에만 적용한다.
- 개념 비교용 normalized_key는 한글·영문·숫자·약어를 비교 가능한 형태로 만든다.
- 정규화는 원래 표시명을 덮어쓰지 않는다.

## 3. 테이블 정의

### 3.1 app_settings

개인용 서비스의 비밀값이 아닌 제품 설정을 저장한다. API 키 원문은 이 테이블에 저장하지 않고 별도 로컬 비밀 저장 정책을 따른다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| key | TEXT | Y | PK. 예: onboarding_completed, vector_store_id |
| value_json | TEXT | Y | JSON 값 |
| is_secret | INTEGER | Y | 기본 0. secret 값은 일반 조회에서 제외 |
| created_at | TEXT | Y | 생성 시각 |
| updated_at | TEXT | Y | 변경 시각 |

### 3.2 documents

사용자가 추가한 원본 자료의 메타데이터와 처리 상태를 저장한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id, public_id | INTEGER, TEXT | Y | 공통 식별자 |
| title | TEXT | Y | 사용자 표시 제목. 1~200자 |
| source_name | TEXT | Y | 업로드 파일명 또는 paste-YYYYMMDD-HHMMSS.txt |
| source_format | TEXT | Y | txt, md 또는 pdf |
| original_path | TEXT | Y | 로컬 파일 저장 경로. 앱 데이터 루트 기준 상대 경로 |
| content_hash | TEXT | Y | 원문 SHA-256 hex. 활성 문서에서 UNIQUE |
| content_chars | INTEGER | Y | 정규화 전 원문 문자 수 |
| summary | TEXT | N | 검토 후 확정된 짧은 요약 |
| analysis_json | TEXT | N | 확정 분석 결과의 원본 JSON snapshot |
| ingest_status | TEXT | Y | draft, analyzing, review_ready, storing, ready, failed, deleted |
| ingest_error_code | TEXT | N | 사용자에게 표시할 오류 코드 |
| ingest_error_message | TEXT | N | 안전하게 정제한 오류 설명 |
| openai_file_id | TEXT | N | Files API 파일 ID |
| vector_store_id | TEXT | N | 연결된 Vector Store ID |
| vector_store_file_id | TEXT | N | Vector Store 파일 ID |
| vector_store_file_status | TEXT | N | in_progress, completed, cancelled, failed |
| vector_store_last_error | TEXT | N | OpenAI 파일 처리 오류의 안전한 요약 |
| deleted_at | TEXT | N | 삭제 확정 시각 |
| created_at, updated_at | TEXT | Y | 공통 시각 |

제약:

- 활성 문서의 content_hash는 유일하다.
- ingest_status가 ready가 아니면 그래프·질문 근거로 사용하지 않는다.
- original_path는 앱 데이터 루트 밖의 임의 경로를 가리킬 수 없다.
- source_format은 txt, md, pdf를 허용한다. PDF의 canonical content에는 텍스트 추출 결과를 저장한다.

### 3.3 document_chunks

검색·인용·개념 추출의 로컬 기준 단위다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id, public_id | INTEGER, TEXT | Y | 공통 식별자 |
| document_id | INTEGER | Y | documents FK |
| ordinal | INTEGER | Y | 0부터 시작하는 문서 내 순서 |
| start_char | INTEGER | Y | 정규화 전 원문 기준 시작 offset |
| end_char | INTEGER | Y | exclusive end offset |
| text | TEXT | Y | 검색·근거 표시용 청크 |
| normalized_text | TEXT | Y | 검색·OpenAI 결과 매핑용 |
| content_hash | TEXT | Y | 청크 SHA-256 |
| extraction_json | TEXT | N | 해당 청크의 추출 결과 snapshot |
| created_at, updated_at | TEXT | Y | 공통 시각 |

청킹 정책:

- 목표 크기: 24,000자
- 인접 청크 overlap: 500자
- 문서 전체가 목표보다 짧으면 1개 청크
- 문단·줄 경계를 우선하되 목표 크기는 하드 제한으로 적용하지 않는다.
- ordinal, start_char, end_char는 재현 가능해야 한다.
- 원문 변경은 새 문서 버전으로 취급하며 기존 청크를 수정하지 않는다.

제약:

- UNIQUE(document_id, ordinal)
- start_char는 0 이상, end_char는 start_char보다 커야 함
- document_id 삭제 시 청크도 함께 삭제

### 3.4 concepts

문서에서 추출하고 여러 자료에서 공유하는 정규화 개념이다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id, public_id | INTEGER, TEXT | Y | 공통 식별자 |
| concept_type | TEXT | Y | 13개 허용 유형 중 하나 |
| canonical_name | TEXT | Y | 대표 표시명 |
| korean_name | TEXT | N | 한글명 |
| english_name | TEXT | N | 영문명 |
| acronym | TEXT | N | 약어 |
| normalized_key | TEXT | Y | 자동 매칭용 키 |
| description | TEXT | Y | 최소 설명, 500자 이하 |
| merge_status | TEXT | Y | confirmed, candidate, rejected |
| source_count | INTEGER | Y | 활성 근거 청크 수의 캐시 |
| deleted_at | TEXT | N | 삭제 시각 |
| created_at, updated_at | TEXT | Y | 공통 시각 |

허용 concept_type:

organization, organization_unit, person, country, region, place, technology, equipment, system, project_program, policy_law, event, document

같은 normalized_key라도 concept_type이 다르면 자동 병합하지 않는다. 자동 병합은 한글명·영문명·약어가 명확히 동일한 confirmed 개념에만 적용한다.

### 3.5 concept_aliases

개념의 표시명 변형과 검색어를 저장한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id | INTEGER | Y | 내부 PK |
| concept_id | INTEGER | Y | concepts FK |
| alias | TEXT | Y | 별칭 |
| normalized_alias | TEXT | Y | 비교용 별칭 |
| alias_type | TEXT | Y | korean, english, acronym, alternate |
| is_primary | INTEGER | Y | 대표 여부 |
| created_at | TEXT | Y | 생성 시각 |

UNIQUE(concept_id, normalized_alias). 활성 개념끼리 동일 normalized_alias가 충돌하면 자동 병합하지 않고 후보 상태로 만든다.

### 3.6 graph_nodes

문서·청크·개념을 프론트엔드가 공통 노드로 다룰 수 있게 하는 안정적인 매핑 테이블이다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id | INTEGER | Y | 내부 PK |
| public_id | TEXT | Y | 그래프 노드 ID |
| node_type | TEXT | Y | document, chunk, concept |
| document_id | INTEGER | 조건부 | node_type=document일 때 |
| chunk_id | INTEGER | 조건부 | node_type=chunk일 때 |
| concept_id | INTEGER | 조건부 | node_type=concept일 때 |
| is_visible_default | INTEGER | Y | 기본 그래프 표시 여부 |
| created_at, updated_at | TEXT | Y | 공통 시각 |

세 대상 FK 중 node_type에 해당하는 하나만 채운다. 각 대상은 활성 graph_node 하나만 가질 수 있다. 1개 청크 문서는 chunk graph node를 만들지 않고 document node에서 개념으로 직접 연결한다.

화면 좌표, 카메라, 사용자별 레이아웃은 저장하지 않는다. 노드 배치는 프론트엔드의 현재 그래프 세션 상태이며, 문서·청크·개념·관계 정본과 분리된다.

### 3.7 graph_edges

그래프에 표시할 방향성 관계와 근거를 저장한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id, public_id | INTEGER, TEXT | Y | 공통 식별자 |
| source_node_id | INTEGER | Y | graph_nodes FK |
| target_node_id | INTEGER | Y | graph_nodes FK |
| relation_type | TEXT | Y | contains, mentions, relates_to, supports 등 |
| label | TEXT | Y | 화면에 표시할 짧은 관계명 |
| evidence_chunk_id | INTEGER | Y | 관계 근거 document_chunks FK |
| evidence_text | TEXT | Y | 근거 문장 또는 짧은 발췌 |
| confidence | REAL | Y | 0~1. 모델 제안 신뢰도 |
| origin | TEXT | Y | extracted, user_edited |
| created_at, updated_at | TEXT | Y | 공통 시각 |

제약:

- source_node_id와 target_node_id는 같을 수 없다.
- source·target 노드는 삭제된 자료에 속할 수 없다.
- UNIQUE(source_node_id, target_node_id, relation_type, evidence_chunk_id)
- edge가 연결하는 문서·청크와 evidence_chunk의 문서가 일관되어야 한다.

문서와 개념의 연결:

- 문서 청크가 1개면 document node → concept node
- 문서 청크가 2개 이상이면 document node → chunk node → concept node
- chunk node와 문서의 연결은 contains
- 청크와 개념 연결은 mentions 또는 extracted relation

### 3.8 ingestion_jobs

분석·Vector Store 적재의 진행 상태와 재시도를 저장한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id, public_id | INTEGER, TEXT | Y | 공통 식별자 |
| document_id | INTEGER | Y | 대상 문서 |
| job_type | TEXT | Y | ingest, reanalyze, delete, import |
| status | TEXT | Y | queued, running, review_ready, deleting, succeeded, failed, cancelled |
| current_step | TEXT | Y | validating, chunking, uploading, indexing, extracting, graphing, ready |
| progress | INTEGER | Y | 0~100 |
| attempt | INTEGER | Y | 0부터 시작 |
| error_code | TEXT | N | 안전한 오류 코드 |
| error_message | TEXT | N | 사용자용 오류 설명 |
| started_at | TEXT | N | 실행 시작 |
| finished_at | TEXT | N | 종료 |
| created_at, updated_at | TEXT | Y | 공통 시각 |

같은 document에 running job은 하나만 허용한다. 서버 재시작 시 running job은 queued 또는 failed로 복구 정책을 적용한다.

### 3.9 search_history

질문 모드의 결과를 다시 열기 위한 사용자 기록이다. 단순 키워드 검색은 기본적으로 저장하지 않으며, 사용자가 “질문”을 실행한 경우만 저장한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id, public_id | INTEGER, TEXT | Y | 공통 식별자 |
| query | TEXT | Y | 사용자 질문 |
| answer | TEXT | Y | 생성 답변 |
| answer_status | TEXT | Y | answered, insufficient_evidence, failed |
| response_id | TEXT | N | Responses API response ID |
| model | TEXT | N | 사용 모델 |
| retrieved_count | INTEGER | Y | 실제 근거 수, 0~3 |
| insufficient_evidence | INTEGER | Y | 근거 부족 여부 |
| created_at, updated_at | TEXT | Y | 공통 시각 |
| deleted_at | TEXT | N | 사용자 삭제 시각 |

### 3.10 search_history_sources

질문 당시의 검색 결과를 보존하는 snapshot이다. 문서가 이후 수정·삭제되어도 당시 근거를 설명할 수 있어야 한다.

| 필드 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| id | INTEGER | Y | 내부 PK |
| history_id | INTEGER | Y | search_history FK |
| rank | INTEGER | Y | 1~3 |
| document_id | INTEGER | N | 현재 문서 FK. 삭제 시 NULL 가능 |
| chunk_id | INTEGER | N | 현재 청크 FK |
| openai_file_id | TEXT | Y | 당시 검색 file_id |
| openai_filename | TEXT | Y | 당시 파일명 |
| openai_score | REAL | Y | 0~1 |
| openai_content | TEXT | Y | OpenAI가 반환한 청크 snapshot |
| local_match_type | TEXT | Y | exact, overlap, unresolved |
| local_start_char | INTEGER | N | 매핑된 로컬 위치 |
| local_end_char | INTEGER | N | 매핑된 로컬 위치 |
| created_at | TEXT | Y | 생성 시각 |

UNIQUE(history_id, rank). unresolved는 화면에서 확정 근거가 아닌 “원문 매핑 실패”로 표시하고 답변 인용에서 제외한다.

## 4. FTS5 검색 모델

### 4.1 가상 테이블

FTS5는 원본 테이블의 검색 전용 인덱스다. 원본 데이터의 정본이 아니며, 활성 레코드만 노출한다.

| 가상 테이블 | 검색 컬럼 | 연결 키 |
|---|---|---|
| documents_fts | title, summary, source_name | document public_id |
| chunks_fts | text | chunk public_id |
| concepts_fts | canonical_name, korean_name, english_name, acronym, description | concept public_id |

### 4.2 동기화

- 문서·청크·개념 생성·수정·삭제와 FTS 반영은 같은 애플리케이션 작업에서 처리한다.
- 트랜잭션 성공 전에 FTS만 먼저 노출하지 않는다.
- 마이그레이션 후 전체 재구축 명령을 제공한다.
- 삭제된 문서는 FTS 검색에서 제외한다.
- FTS 결과는 BM25 순위와 정규화된 키워드 일치 정보를 반환한다.

### 4.3 검색 결합

- 키워드 검색: FTS5를 우선 사용한다.
- 자연어 검색: OpenAI Vector Store 검색을 사용한다.
- 검색 화면은 FTS 결과와 의미 검색 결과를 중복 제거해 보여줄 수 있다.
- 질문 답변은 Vector Store에서 최대 3개를 얻고, 로컬 청크 매핑에 성공한 결과만 근거로 사용한다.
- FTS5는 질문 답변의 근거 수를 임의로 늘리지 않는다.

## 5. 상태 전이

### 5.1 문서 상태

| 현재 | 허용 전이 | 조건 |
|---|---|---|
| draft | analyzing, deleted | 입력 검증 완료 또는 취소 |
| analyzing | review_ready, failed | 분석 결과 생성 |
| review_ready | storing, analyzing, deleted | 저장 확정 또는 재분석 |
| storing | ready, failed | Vector Store·그래프 반영 |
| ready | analyzing, deleted | 재분석 또는 삭제 |
| failed | analyzing, deleted | 재시도 또는 삭제 |
| deleted | 없음 | 복구는 초기 범위에 없음 |

### 5.2 작업 상태

queued → running → review_ready → succeeded

삭제 작업은 queued → running → deleting → succeeded 또는 failed로 전이한다. 삭제 중인 문서는 활성 그래프·검색에서 제외한다.

실패 시 running → failed, 취소 시 queued/running → cancelled. 재시도는 새 attempt를 기록하되 같은 ingestion_job을 재사용하거나 새 job을 생성하는 정책을 하나로 고정한다. 초기 권장안은 같은 document에 새 job을 생성하고 이전 job을 이력으로 보존하는 방식이다.

## 6. 삭제·재분석·복구 규칙

### 삭제

1. 문서를 삭제 확인 상태로 만든다.
2. 그래프·목록·검색에서 즉시 숨긴다.
3. 로컬 원본 파일을 삭제한다.
4. 청크·그래프 노드·그래프 엣지·개념의 고립 관계를 정리한다.
5. OpenAI Vector Store 파일과 Files 리소스 삭제를 시도한다.
6. 외부 삭제 성공 여부를 기록하고, 실패하면 사용자에게 정리 필요 상태를 표시한다.
7. 최종적으로 documents.deleted_at과 ingest_status=deleted를 기록한다.

초기 제품은 휴지통·복구를 제공하지 않는다. 삭제 전 백업·내보내기를 제공한다.

### 재분석

- 원문 파일과 document public_id는 유지한다.
- 기존 청크·문서 소유 그래프 데이터를 새 분석 결과로 교체한다.
- 기존 검색 히스토리 snapshot은 변경하지 않는다.
- 개념이 다른 문서에서 사용 중이면 삭제하지 않고 연결만 정리한다.

### 데이터 이전

내보내기에는 원문, 메타데이터, 청크 위치, 확정 개념, 관계, 히스토리를 포함한다. OpenAI 리소스 ID는 이전 대상이 아니며 가져오기 후 새 리소스 연결을 다시 만든다.

## 7. 인덱스와 성능 기준

필수 일반 인덱스:

- documents(content_hash), documents(ingest_status, updated_at), documents(deleted_at)
- document_chunks(document_id, ordinal)
- concepts(concept_type, normalized_key), concepts(deleted_at)
- concept_aliases(normalized_alias)
- graph_nodes(node_type), graph_nodes(document_id), graph_nodes(chunk_id), graph_nodes(concept_id)
- graph_edges(source_node_id), graph_edges(target_node_id), graph_edges(evidence_chunk_id)
- ingestion_jobs(document_id, status, created_at)
- search_history(deleted_at, created_at)
- search_history_sources(history_id, rank)

MVP 성능 목표:

- 홈 그래프 최초 로딩: 활성 노드 2,000개 이하에서 2초 내 API 응답 목표
- 문서 목록: 페이지당 20개 기본, 최대 100개
- 검색: 일반적인 로컬 자료 규모에서 1초 내 결과 응답 목표
- 질문: 검색과 답변은 외부 AI 지연을 별도 로딩 단계로 표시

그래프가 목표 규모를 넘으면 API가 전체 데이터를 무조건 반환하지 않고 limit, node_type, focus_node_id, depth 필터로 범위를 줄인다.

## 8. 무결성 검증

적재 완료 전에 다음을 검사한다.

- 모든 청크의 순서·offset·내용이 원문과 일치
- 모든 개념의 유형이 허용 목록에 포함
- 모든 관계의 source·target 노드가 존재
- 모든 관계의 evidence_chunk이 해당 문서에 속함
- 문서의 청크 수가 그래프 연결 규칙과 일치
- 동일한 문서·개념 관계가 중복 생성되지 않음
- FTS에 활성 데이터만 존재
- OpenAI file ID가 다른 활성 문서와 중복 연결되지 않음

검증 실패 시 원문과 작업 로그는 보존하되 문서를 ready로 전환하지 않는다.

## 9. 멀티턴 질문 저장 확장

기존 `search_history` 한 행을 대화의 한 턴으로 사용한다. 별도 conversation/turn 테이블은 MVP에서 추가하지 않는다.

| 컬럼 | 타입 | 필수 | 규칙 |
|---|---|---:|---|
| conversation_id | VARCHAR(36) | N | 대화 그룹 공개 ID. 새 대화의 모든 턴이 공유 |
| turn_index | INTEGER | Y | 대화 내 0부터 시작하는 순번 |
| response_id | VARCHAR(100) | N | 다음 턴의 `previous_response_id`로 사용하는 OpenAI 응답 ID |

`(conversation_id, turn_index)` 인덱스를 생성한다. 기존 행은 migration에서 `conversation_id=public_id`, `turn_index=0`으로 보정하여 기존 히스토리를 독립 대화로 보존한다. `search_history_sources`는 기존처럼 턴별 근거 snapshot이며 `history_id`는 턴의 내부 PK를 가리킨다.

대화 목록은 삭제되지 않은 턴을 `conversation_id`로 그룹화해 첫 질문을 제목, 가장 큰 `turn_index`를 최신 턴으로 사용한다. 대화 삭제는 모든 턴에 `deleted_at`을 기록하는 soft delete이며 source snapshot은 보존한다.

멀티턴 답변의 검색 근거는 매 턴 새로 저장한다. 이전 턴의 source snapshot은 대화 표시용이지 현재 답변의 citation으로 재사용하지 않는다.
## Source provenance invariant

- A document node represents the original PDF/text source and displays its source name.
- Chunk nodes belong to exactly one source. Concept nodes are shared and may be referenced by multiple sources.
- Every `contains`, `mentions`, and concept-to-concept relation edge stores `evidence_chunk_id`.
- Deleting a source removes its file, chunks, source-owned nodes, and only edges evidenced by its chunks.
- A shared concept survives while another ready source still has an active evidence edge. A concept with no active evidence edge is soft-deleted and excluded from graph/search responses.
- Re-ingestion removes old evidence edges before replacing chunks, so obsolete relations cannot survive without current source evidence.

## 10. 탐색형 Agent 저장

Agent 실행은 대화 턴과 분리된 `agent_runs`에 저장하고, 화면에 노출할 수 있는 순서 이벤트는 `agent_events`에 저장한다. 최종 로컬·웹 출처 snapshot은 `agent_references`에 저장한다. 기존 `search_history`와 `search_history_sources`는 legacy 턴 호환 및 대화 source of truth로 유지한다.

- `agent_runs`: public ID, conversation/history 연결, question, status, model/response ID, prompt version, agent turn count, tool call count, termination reason, error, timestamps.
- `agent_events`: run ID, sequence, event type, status, tool name, UI용 display message, 제한된 input/result summary, error, created timestamp. `(run_id, sequence)` unique.
- `agent_references`: run/history 연결, `local|web` source type, rank, document/chunk/offset, URL/title/excerpt/score, provider source ID.

Agent event에는 chain-of-thought·reasoning token·원문 전체 tool output을 저장하지 않는다. `agent_runs.status`는 `queued`, `running`, `waiting_tool`, `completed`, `failed`, `max_turns`, `cancelled`만 허용한다. 이벤트 유형은 `run_started`, `assistant_update`, `llm_call`, `llm_output`, `tool_call`, `tool_result`, `web_search`, `retry`, `final`, `error`, `run_stopped`이며, `llm_*`는 모델 호출·모델의 다음 행동/최종 답변 단계 요약, `assistant_update`는 안전한 내부 단계 요약이다. 각 이벤트는 별도 짧은 transaction으로 저장해 SSE 재접속 시 순서를 복구한다.
