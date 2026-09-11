# Second Brain Backend

## 실행

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

`backend/.env.example`을 `backend/.env`로 복사한 뒤 `OPENAI_API_KEY`를 입력하면 AI 적재·Vector Store 검색·답변이 활성화된다. 배포 환경에서는 웹앱 Settings 화면에서 키를 입력할 수도 있으며, 키는 백엔드 runtime SQLite에 저장된다. 키가 없으면 로컬 파일 저장·청킹·SQLite FTS5 검색·그래프 기능은 계속 사용할 수 있다. API 키는 프론트엔드로 전달하지 않는다.

주요 경로:

- `POST /api/knowledge/ingestions`: text 또는 txt/md/텍스트형 PDF 업로드, 202 작업 반환
- `GET /api/knowledge/ingestions/{job_id}`: 진행·preview polling
- `POST /api/knowledge/ingestions/{job_id}/confirm`: 분석 결과 확정
- `GET /api/knowledge/graph`: 문서·개념·선택적 청크 그래프
- `GET /api/knowledge/search`: FTS5 통합 검색
- `POST /api/knowledge/ask`: 최대 3개 근거 기반 답변
- `GET /api/health`: DB·저장소·OpenAI 상태
