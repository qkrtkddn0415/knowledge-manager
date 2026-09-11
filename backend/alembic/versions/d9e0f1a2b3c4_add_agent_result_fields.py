"""add final result fields to agent runs

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import Column, Text


revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_runs", Column("final_answer", Text(), nullable=True))
    op.add_column("agent_runs", Column("result_json", Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_runs", "result_json")
    op.drop_column("agent_runs", "final_answer")
