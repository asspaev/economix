from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.snapshot import ActualSnapshot, PlannedSnapshot


async def create_planned(
    session: AsyncSession,
    *,
    user_id: int,
    snapshot_key: str,
    incomes: dict[str, int],
    expenses: dict[str, int],
    savings_deposits: dict[str, int],
    savings_withdrawals: dict[str, int],
) -> PlannedSnapshot:
    """Создаёт плановый снапшот пользователя.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя — владельца снапшота.
        snapshot_key: Ключ периода (например, ``"2026-06"``).
        incomes: Плановые доходы в разрезе категорий.
        expenses: Плановые расходы в разрезе категорий.
        savings_deposits: Плановые пополнения сбережений по счетам.
        savings_withdrawals: Плановые расходы сбережений по счетам.

    Returns:
        Созданный экземпляр :class:`PlannedSnapshot`.
    """
    record = PlannedSnapshot(
        user_id=user_id,
        snapshot_key=snapshot_key,
        incomes=incomes,
        expenses=expenses,
        savings_deposits=savings_deposits,
        savings_withdrawals=savings_withdrawals,
    )
    session.add(record)
    await session.flush()
    return record


async def get_planned(
    session: AsyncSession,
    user_id: int,
    snapshot_key: str,
) -> PlannedSnapshot | None:
    """Возвращает плановый снапшот пользователя по ключу периода.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.
        snapshot_key: Ключ периода.

    Returns:
        Найденный экземпляр :class:`PlannedSnapshot` или ``None``.
    """
    return await session.scalar(
        select(PlannedSnapshot).where(
            PlannedSnapshot.user_id == user_id,
            PlannedSnapshot.snapshot_key == snapshot_key,
        )
    )


async def list_planned(
    session: AsyncSession,
    user_id: int,
    *,
    keys: Iterable[str] | None = None,
) -> list[PlannedSnapshot]:
    """Возвращает плановые снапшоты пользователя, упорядоченные по ключу.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.
        keys: Опциональное множество ключей для фильтрации. ``None`` —
            все снапшоты пользователя.

    Returns:
        Список снапшотов, упорядоченный по возрастанию ``snapshot_key``.
    """
    stmt = select(PlannedSnapshot).where(PlannedSnapshot.user_id == user_id)
    if keys is not None:
        stmt = stmt.where(PlannedSnapshot.snapshot_key.in_(list(keys)))
    stmt = stmt.order_by(PlannedSnapshot.snapshot_key)
    result = await session.scalars(stmt)
    return list(result.all())


async def list_actual(
    session: AsyncSession,
    user_id: int,
    *,
    keys: Iterable[str] | None = None,
) -> list[ActualSnapshot]:
    """Возвращает фактические снапшоты пользователя, упорядоченные по ключу.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.
        keys: Опциональное множество ключей для фильтрации. ``None`` —
            все снапшоты пользователя.

    Returns:
        Список снапшотов, упорядоченный по возрастанию ``snapshot_key``.
    """
    stmt = select(ActualSnapshot).where(ActualSnapshot.user_id == user_id)
    if keys is not None:
        stmt = stmt.where(ActualSnapshot.snapshot_key.in_(list(keys)))
    stmt = stmt.order_by(ActualSnapshot.snapshot_key)
    result = await session.scalars(stmt)
    return list(result.all())
