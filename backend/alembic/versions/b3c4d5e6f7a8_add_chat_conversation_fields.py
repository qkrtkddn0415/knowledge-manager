"""group search history rows into multi-turn conversations"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import Column, Integer, String


revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    columns = {row[1] for row in bind.exec_driver_sql("PRAGMA table_info(search_history)").fetchall()}
    if "conversation_id" not in columns:
        op.add_column("search_history", Column("conversation_id", String(length=36), nullable=True))
    if "turn_index" not in columns:
        op.add_column("search_history", Column("turn_index", Integer(), nullable=False, server_default="0"))
    bind.exec_driver_sql("UPDATE search_history SET conversation_id = public_id WHERE conversation_id IS NULL")
    bind.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_search_history_conversation_id ON search_history (conversation_id)")
    bind.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_search_history_turn_index ON search_history (turn_index)")
    bind.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_search_history_conversation_turn ON search_history (conversation_id, turn_index)")


def downgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("DROP INDEX IF EXISTS ix_search_history_conversation_turn")
    bind.exec_driver_sql("DROP INDEX IF EXISTS ix_search_history_turn_index")
    bind.exec_driver_sql("DROP INDEX IF EXISTS ix_search_history_conversation_id")
