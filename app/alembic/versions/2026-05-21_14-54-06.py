"""empty message

Revision ID: 9923e79a0266
Revises: 99bf3dd7bb9e
Create Date: 2026-05-21 14:54:06.966177+00:00

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "9923e79a0266"
down_revision: Union[str, Sequence[str], None] = "99bf3dd7bb9e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_categories", sa.Column("initial_capital", sa.Integer(), nullable=True))
    op.drop_column("user_settings", "initial_capital")


def downgrade() -> None:
    op.add_column(
        "user_settings",
        sa.Column("initial_capital", postgresql.JSONB(astext_type=sa.Text()), autoincrement=False, nullable=False),
    )
    op.drop_column("user_categories", "initial_capital")
