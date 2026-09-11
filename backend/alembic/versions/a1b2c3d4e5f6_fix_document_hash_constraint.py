"""allow re-importing content after a document is deleted"""

from typing import Sequence, Union

from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "7c7c2b5e8d31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    table_sql = bind.exec_driver_sql("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'").scalar()
    if not table_sql or "UNIQUE (content_hash)" not in table_sql:
        return
    bind.exec_driver_sql("PRAGMA foreign_keys=OFF")
    bind.exec_driver_sql("""
        CREATE TABLE documents_new (
            id INTEGER NOT NULL PRIMARY KEY,
            public_id VARCHAR(36) NOT NULL,
            title VARCHAR(200) NOT NULL,
            source_name VARCHAR(300) NOT NULL,
            source_format VARCHAR(10) NOT NULL,
            original_path VARCHAR(500) NOT NULL,
            content TEXT NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            content_chars INTEGER NOT NULL,
            summary TEXT,
            analysis_json TEXT,
            ingest_status VARCHAR(30) NOT NULL,
            ingest_error_code VARCHAR(80),
            ingest_error_message VARCHAR(500),
            openai_file_id VARCHAR(100),
            vector_store_id VARCHAR(100),
            vector_store_file_id VARCHAR(100),
            vector_store_file_status VARCHAR(30),
            vector_store_last_error VARCHAR(500),
            deleted_at DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    """)
    columns = "id, public_id, title, source_name, source_format, original_path, content, content_hash, content_chars, summary, analysis_json, ingest_status, ingest_error_code, ingest_error_message, openai_file_id, vector_store_id, vector_store_file_id, vector_store_file_status, vector_store_last_error, deleted_at, created_at, updated_at"
    bind.exec_driver_sql(f"INSERT INTO documents_new ({columns}) SELECT {columns} FROM documents")
    bind.exec_driver_sql("DROP TABLE documents")
    bind.exec_driver_sql("ALTER TABLE documents_new RENAME TO documents")
    for name, column in (
        ("ix_documents_public_id", "public_id"),
        ("ix_documents_title", "title"),
        ("ix_documents_content_hash", "content_hash"),
        ("ix_documents_ingest_status", "ingest_status"),
        ("ix_documents_deleted_at", "deleted_at"),
        ("ix_documents_updated_at", "updated_at"),
    ):
        bind.exec_driver_sql(f"CREATE INDEX IF NOT EXISTS {name} ON documents({column})")
    bind.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_active_content_hash ON documents(content_hash) WHERE deleted_at IS NULL")
    bind.exec_driver_sql("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    pass
