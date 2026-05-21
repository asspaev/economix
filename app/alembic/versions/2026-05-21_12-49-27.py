"""empty message

Revision ID: be064aa4f49a
Revises: fffbf3a4264c
Create Date: 2026-05-21 12:49:27.755658+00:00

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "be064aa4f49a"
down_revision: Union[str, Sequence[str], None] = "fffbf3a4264c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "actual_snapshots",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_key", sa.Text(), nullable=False),
        sa.Column("incomes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expenses", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("savings_deposits", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("savings_withdrawals", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "snapshot_key"),
    )
    op.create_table(
        "planned_snapshots",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("snapshot_key", sa.Text(), nullable=False),
        sa.Column("incomes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expenses", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("savings_deposits", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("savings_withdrawals", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "snapshot_key"),
    )
    op.create_table(
        "user_categories",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "category_id"),
    )
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False),
        sa.Column("snapshot_type", sa.Text(), nullable=False),
        sa.Column("income_categories", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expense_categories", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("accounts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("initial_capital", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
    op.drop_table("user_categories")
    op.drop_table("planned_snapshots")
    op.drop_table("actual_snapshots")
