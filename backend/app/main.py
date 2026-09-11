import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.response import failure
from app.api.routes import agent, health, items, knowledge, settings as settings_routes, transfer
from app.core.config import settings
from app.core.errors import DomainError
from app.db import create_db_and_tables, load_persisted_settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_db_and_tables()
    load_persisted_settings()
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin, "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = f"req_{uuid.uuid4().hex}"
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content=failure(request, exc.code, exc.message, exc.retryable, exc.details))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=422, content=failure(request, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다."))


app.include_router(health.router, prefix="/api")
app.include_router(items.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(agent.router, prefix="/api")
app.include_router(settings_routes.router, prefix="/api")
app.include_router(transfer.router, prefix="/api")


@app.get("/", tags=["root"])
def read_root():
    return {"message": settings.app_name}
