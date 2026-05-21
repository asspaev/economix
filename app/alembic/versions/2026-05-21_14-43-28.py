"""empty message

Revision ID: 99bf3dd7bb9e
Revises: be064aa4f49a
Create Date: 2026-05-21 14:43:28.803067+00:00

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "99bf3dd7bb9e"
down_revision: Union[str, Sequence[str], None] = "be064aa4f49a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("user_settings", "income_categories")
    op.drop_column("user_settings", "expense_categories")
    op.drop_column("user_settings", "accounts")


def downgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("accounts", postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False),
    )
    op.add_column(
        "user_settings",
        sa.Column("expense_categories", postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False),
    )
    op.add_column(
        "user_settings",
        sa.Column("income_categories", postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False),
    )
