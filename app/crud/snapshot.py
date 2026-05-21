from sqlalchemy.ext.asyncio import AsyncSession

from app.models.snapshot import PlannedSnapshot


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
