# Second Brain 로컬 MCP Server

## 제공 기능

`backend/app/mcp/server.py`가 Python MCP SDK의 STDIO transport로 실행되며, 기존 Agent tool 로직을 그대로 호출한다.

- `search_knowledge`: 최대 3개 근거 청크, 원본 문서, 연결 개념 검색
- `explore_node`: 노드 관계, 연결 청크, 별칭 언급 문맥 탐색

두 도구 모두 SQLite와 OpenAI Vector Store를 읽고 결과를 반환하는 읽기 전용 도구다. MCP adapter에서 검색·그래프 로직을 재구현하지 않는다.

## 의존성 설치

Backend 가상환경에서 실행한다.

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

현재 Python MCP SDK `mcp[cli]==2.2.0`을 사용한다. 공식 SDK는 STDIO를 MCP 호스트가 서버를 subprocess로 실행하고 stdin/stdout으로 통신하는 transport로 제공한다.

## 단독 실행

MCP host가 실행할 때 다음 명령을 사용한다.

```powershell
backend\.venv\Scripts\python.exe backend\app\mcp\server.py
```

서버는 `backend/.env`와 `backend/database.db`를 자동으로 기준 삼는다. STDIO 프로토콜을 오염시키지 않도록 서버에서 stdout 로그를 출력하지 않는다.

## Codex 등록

PowerShell에서 workspace 루트 기준으로 실행한다. 기존 `second-brain`이 있으면 현재 프로젝트 경로로 교체한다.

```powershell
codex mcp remove second-brain
codex mcp add second-brain -- "C:\Users\KHP-17\Desktop\TEST\backend\.venv\Scripts\python.exe" "C:\Users\KHP-17\Desktop\TEST\backend\app\mcp\server.py"
codex mcp list
```

목록에서 `second-brain`의 command가 현재 `TEST\backend` 경로이고 상태가 `enabled`인지 확인한다. `remove`는 Codex 설정만 교체하며 DB와 원본 자료를 삭제하지 않는다.

## 재등록·문제 해결

코드나 가상환경 경로를 변경했으면 다음을 반복한다.

```powershell
codex mcp remove second-brain
codex mcp add second-brain -- "C:\Users\KHP-17\Desktop\TEST\backend\.venv\Scripts\python.exe" "C:\Users\KHP-17\Desktop\TEST\backend\app\mcp\server.py"
codex mcp list
```

도구가 보이지 않으면 먼저 다음을 확인한다.

1. `backend\.venv\Scripts\python.exe -c "from app.mcp.server import mcp; print(mcp.name)"`
2. `backend\.env`와 `backend\database.db` 존재 여부
3. `codex mcp list`의 command 경로와 현재 workspace 일치 여부

공식 참고: [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/index.md)
