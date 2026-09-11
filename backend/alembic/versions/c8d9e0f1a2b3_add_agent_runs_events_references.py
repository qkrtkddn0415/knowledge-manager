"""add exploration agent runs, events, and references

Revision ID: c8d9e0f1a2b3
Revises: b3c4d5e6f7a8
"""

from typing import Sequence, Union

from alembic import op
from sqlmodel import SQLModel

from app.models import AgentEvent, AgentReference, AgentRun


revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    SQLModel.metadata.create_all(
        bind=bind,
        tables=[AgentRun.__table__, AgentEvent.__table__, AgentReference.__table__],
    )


def downgrade() -> None:
    bind = op.get_bind()
    for table in (AgentReference, AgentEvent, AgentRun):
        table.__table__.drop(bind, checkfirst=True)
