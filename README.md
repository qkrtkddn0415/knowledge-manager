# Full-stack starter

Python 3.12 + FastAPI + SQLModel + Alembic 백엔드와 React + TypeScript + Vite 프론트엔드로 만든 개인용 세컨드 브레인입니다.

## 실행

터미널 1:

    cd backend
    .\.venv\Scripts\Activate.ps1
    uvicorn app.main:app --reload

PowerShell 실행 정책으로 활성화가 막히는 경우:

    cmd /d /c ".\.venv\Scripts\activate.bat && uvicorn app.main:app --reload"

터미널 2:

    cd frontend
    npm run dev

프론트엔드는 /api 요청을 http://localhost:8000으로 프록시합니다. 브라우저에서 http://localhost:5173을 열고, API 문서는 http://localhost:8000/docs에서 확인할 수 있습니다.

## 데이터베이스

모델 변경 후 마이그레이션을 생성하고 적용합니다.

    cd backend
    alembic revision --autogenerate -m "describe_change"
    alembic upgrade head

초기 Item 및 지식 그래프 테이블 마이그레이션은 이미 생성되어 있습니다.

## 지식 API

    POST /api/knowledge/documents/upload   # .txt, .md, 텍스트형 .pdf 업로드·분석·그래프 적재
    GET  /api/knowledge/documents          # 저장 문서 목록
    GET  /api/knowledge/documents/{id}     # 원문 조회
    GET  /api/knowledge/graph              # 3D 그래프용 노드·연결
    GET  /api/knowledge/search?q=...       # 키워드/의미 검색
    POST /api/knowledge/ask                # 관련 문서 3개 기반 답변

OpenAI 기능을 사용하려면 backend/.env 파일에 OPENAI_API_KEY를 설정합니다. 기본 모델은 gpt-5-mini, 임베딩 모델은 text-embedding-3-small입니다. 키가 없으면 로컬 키워드 분석과 검색 fallback이 동작합니다.

## 테스트 및 빌드

    cd backend
    pytest

    cd ..\frontend
    npm run build
    npm run lint

## 구조

    backend/
    ├─ app/
    │  ├─ api/routes/       # HTTP 라우터
    │  ├─ core/             # 환경설정
    │  ├─ models/           # SQLModel 테이블과 API 스키마
    │  ├─ services/         # 분석·임베딩·검색·질의응답
    │  ├─ db.py             # 엔진과 요청별 세션
    │  └─ main.py           # FastAPI 앱 조립
    ├─ alembic/             # DB 마이그레이션
    ├─ tests/
    ├─ pyproject.toml
    └─ requirements.txt

    frontend/
    ├─ src/api/             # 백엔드 API 클라이언트와 타입
    ├─ src/App.tsx
    ├─ src/App.css
    ├─ vite.config.ts       # /api 개발 프록시
    └─ package.json

## Docker 배포

Docker Compose 기반 배포 구성은 [deploy/README.md](deploy/README.md)를 참고한다. 프론트엔드, 백엔드, SQLite runtime 볼륨, 배포용 MCP 실행 구성을 포함한다.
