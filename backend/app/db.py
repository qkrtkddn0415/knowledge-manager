import json
from collections.abc import Generator

from sqlalchemy import event, text
from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings
from app.models import (  # noqa: F401
    AgentEvent, AgentReference, AgentRun, AppSetting, Concept, ConceptAlias, Document,
    DocumentChunk, GraphEdge, GraphNode, IngestionJob, Item, SearchHistory,
    SearchHistorySource,
)

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)


@event.listens_for(engine, "connect")
def set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def ensure_fts(connection) -> None:
    connection.exec_driver_sql("CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, summary, source_name, public_id UNINDEXED)")
    connection.exec_driver_sql("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, public_id UNINDEXED)")
    connection.exec_driver_sql("CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(canonical_name, korean_name, english_name, acronym, description, public_id UNINDEXED)")


def create_db_and_tables() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.originals_dir.mkdir(parents=True, exist_ok=True)
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    settings.exports_dir.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    with engine.begin() as connection:
        ensure_fts(connection)
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_active_content_hash ON documents(content_hash) WHERE deleted_at IS NULL")
        connection.execute(text("UPDATE ingestion_jobs SET status='failed', error_code='SERVER_RESTARTED', error_message='서버 재시작으로 작업이 중단되었습니다.' WHERE status='running'"))


def load_persisted_settings() -> None:
    """Load settings entered from the deployment UI after the database exists."""
    if settings.openai_api_key:
        return
    with Session(engine) as session:
        setting = session.get(AppSetting, "openai_api_key")
        if not setting:
            return
        try:
            value = json.loads(setting.value_json)
        except json.JSONDecodeError:
            return
        if isinstance(value, str) and value.strip():
            settings.openai_api_key = value.strip()
