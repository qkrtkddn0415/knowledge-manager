"""create the modular second brain schema

Revision ID: 7c7c2b5e8d31
Revises: 45d8e6b55231
"""
from typing import Sequence, Union

from alembic import op
from sqlmodel import SQLModel

from app.models import AppSetting, Concept, ConceptAlias, Document, DocumentChunk, GraphEdge, GraphNode, IngestionJob, SearchHistory, SearchHistorySource

revision: str = "7c7c2b5e8d31"
down_revision: Union[str, Sequence[str], None] = "45d8e6b55231"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.create_all(bind=bind, tables=[Document.__table__, DocumentChunk.__table__, Concept.__table__, ConceptAlias.__table__, GraphNode.__table__, GraphEdge.__table__, IngestionJob.__table__, SearchHistory.__table__, SearchHistorySource.__table__, AppSetting.__table__])
    bind.exec_driver_sql("CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, summary, source_name, public_id UNINDEXED)")
    bind.exec_driver_sql("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, public_id UNINDEXED)")
    bind.exec_driver_sql("CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(canonical_name, korean_name, english_name, acronym, description, public_id UNINDEXED)")


def downgrade() -> None:
    bind = op.get_bind()
    for name in ("concepts_fts", "chunks_fts", "documents_fts"):
        bind.exec_driver_sql(f"DROP TABLE IF EXISTS {name}")
    for table in (SearchHistorySource, SearchHistory, IngestionJob, GraphEdge, GraphNode, ConceptAlias, Concept, DocumentChunk, Document, AppSetting):
        table.__table__.drop(bind, checkfirst=True)
