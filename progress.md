# Second Brain 진행 기록

## 현재 상태

- 상태: 배포 패키징 완료, Docker 실환경 검증 대기
- 기준일: 2026-09-11

## 완료된 작업

- Docker Compose 배포 구성 추가
  - FastAPI 백엔드
  - Nginx 기반 React 프론트엔드
  - SQLite 및 원문자료 영속 볼륨
  - 백엔드 자동 Alembic 마이그레이션
- 배포용 환경변수 템플릿 추가: `deploy/.env.example`
- 기존 DB·원문자료를 배포 runtime으로 복사하는 스크립트 추가
- Docker Compose 기반 MCP STDIO 실행 프로파일 추가
- 배포 문서 추가: `deploy/README.md`
- 기본 배포 환경에서 외부 웹 검색 비활성화

## 검증 결과

- Backend pytest: 8개 통과
- Frontend production build: 통과
- Frontend lint: 통과, 기존 경고 1건
- Backend compileall: 통과
- Docker Compose YAML 구문: 통과
- Alembic 현재 revision: `d9e0f1a2b3c4 (head)`

## 남은 작업

- Docker Desktop 또는 Docker Engine 설치 후 실제 이미지 빌드
- `docker compose up --build -d` 기동 및 `/api/health` 확인
- 배포 대상 도메인에 맞춘 `FRONTEND_ORIGIN` 설정
- 필요 시 기존 내부 자료를 `deploy/runtime`으로 준비

## 배포 시작점

자세한 명령은 `deploy/README.md`를 참고한다.
