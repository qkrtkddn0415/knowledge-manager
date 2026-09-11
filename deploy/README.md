# Second Brain 배포 패키지

이 패키지는 React 프론트엔드와 FastAPI 백엔드를 Docker Compose로 실행한다. 프론트엔드는 Nginx가 제공하고 `/api` 요청은 백엔드로 전달한다. SQLite 데이터베이스와 원문 자료는 `/app/runtime` 볼륨에 보존된다.

## 준비

- Docker Desktop 또는 Docker Engine + Compose v2
- OpenAI 기능을 사용할 경우 OpenAI API 키

PowerShell에서 프로젝트 루트 기준으로 실행한다.

```powershell
Copy-Item deploy\.env.example deploy\.env
notepad deploy\.env
docker compose --env-file deploy/.env up --build -d
```

접속 주소는 `http://localhost:8080`이며, 상태 확인은 다음과 같다.

```powershell
Invoke-WebRequest http://localhost:8080/api/health | Select-Object -ExpandProperty Content
```

최초 실행 시 Alembic 마이그레이션이 자동 적용된다. 기본값은 새 named volume을 사용하므로 기존 로컬 데이터는 자동으로 복사되지 않는다.

## 기존 내부 자료로 배포

현재 프로젝트의 `backend/database.db`와 `backend/data`를 포함하려면 다음 순서로 실행한다.

```powershell
.\deploy\prepare-runtime.ps1
notepad deploy\.env
docker compose --env-file deploy/.env up --build -d
```

이때 `deploy/.env`의 값을 다음처럼 바꾼다.

```text
SECOND_BRAIN_RUNTIME_PATH=./deploy/runtime
```

`deploy/runtime`에는 내부 자료가 포함될 수 있으므로 저장소에 커밋하거나 외부에 공유하지 않는다.

## 운영 명령

```powershell
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env logs -f backend
docker compose --env-file deploy/.env down
```

운영 환경에서는 `FRONTEND_ORIGIN`을 실제 서비스 주소로 변경하고, API 키는 `deploy/.env`에만 입력한다. `deploy/.env`는 이미지에 복사되지 않는다.

## 배포된 MCP 사용

MCP는 STDIO 방식이므로 Codex가 로컬에서 Docker Compose one-shot 컨테이너를 실행하도록 등록한다.

```powershell
codex mcp remove second-brain
codex mcp add second-brain -- docker compose --env-file deploy/.env --profile mcp run --rm -T mcp
codex mcp list
```

MCP 컨테이너는 백엔드와 같은 runtime 볼륨을 읽으며 `search_knowledge`와 `explore_node`를 제공한다.

## 배포 후 OpenAI 키 설정

`OPENAI_API_KEY`는 프론트엔드의 `VITE_API_BASE_URL`과 다른 백엔드 비밀값이다. 두 가지 방법 중 하나로 설정한다.

1. 권장: `deploy/.env`에 `OPENAI_API_KEY=sk-...`를 입력한 뒤 컨테이너를 시작한다.
2. 배포 후: 웹앱의 Settings → OpenAI Connection에서 키를 입력하고 `키 저장`을 누른다.

웹앱에서 저장한 키는 백엔드의 SQLite runtime 볼륨에 보존되며, 다음 재시작에도 다시 로드된다. API 인증이 없는 단일 사용자 배포를 전제로 한 기능이므로, 여러 사용자가 접근하는 서버는 별도 인증·접근제어를 추가한다.
