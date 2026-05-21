from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class _SnapshotMixin:
    """Общий набор полей плановых и фактических снапшотов.

    Поля выделены в миксин, чтобы гарантировать единообразие схем
    плановых и фактических снапшотов на уровне типов и ограничений.
    Первичный ключ — составной из ``user_id`` и ``snapshot_key``:
    у одного пользователя ключ снапшота уникален, но один и тот же
    ключ могут использовать разные пользователи.

    Attributes:
        user_id: Идентификатор пользователя — владельца снапшота,
            ссылается на :class:`User` и каскадно удаляется вместе с ним.
        snapshot_key: Уникальный в пределах пользователя ключ снапшота
            (например, ``"2026-05"`` для месячного среза).
        incomes: Доходы за период в разрезе категорий
            ``{категория: сумма}``.
        expenses: Расходы за период в разрезе категорий
            ``{категория: сумма}``.
        savings_deposits: Пополнения сбережений по счетам
            ``{счёт: сумма}``.
        savings_withdrawals: Расходы сбережений по счетам
            ``{счёт: сумма}``.
    """

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    snapshot_key: Mapped[str] = mapped_column(Text, primary_key=True)
    incomes: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)
    expenses: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)
    savings_deposits: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)
    savings_withdrawals: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)


class PlannedSnapshot(_SnapshotMixin, Base):
    """Плановый финансовый снапшот пользователя.

    Хранит запланированные на период показатели доходов, расходов и
    операций со сбережениями. Период идентифицируется ключом
    ``snapshot_key``, уникальным в пределах пользователя.
    """

    __tablename__ = "planned_snapshots"


class ActualSnapshot(_SnapshotMixin, Base):
    """Зафиксированный (фактический) финансовый снапшот пользователя.

    Хранит фактические значения доходов, расходов и операций со
    сбережениями за период, идентифицируемый ключом ``snapshot_key``,
    уникальным в пределах пользователя.
    """

    __tablename__ = "actual_snapshots"
