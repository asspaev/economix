from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_settings import UserSettings


async def get_by_user_id(session: AsyncSession, user_id: int) -> UserSettings | None:
    """Возвращает настройки пользователя по идентификатору либо ``None``.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.

    Returns:
        Найденный экземпляр :class:`UserSettings` или ``None``, если запись
        отсутствует.
    """
    return await session.scalar(
        select(UserSettings).where(UserSettings.user_id == user_id),
    )


async def create(
    session: AsyncSession,
    *,
    user_id: int,
    currency: str,
    snapshot_type: str,
) -> UserSettings:
    """Создаёт запись настроек пользователя и фиксирует транзакцию.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя — владельца настроек.
        currency: Код валюты по умолчанию.
        snapshot_type: Тип снапшота (``WEEKLY`` или ``MONTLY``).

    Returns:
        Созданный экземпляр :class:`UserSettings`.
    """
    record = UserSettings(
        user_id=user_id,
        currency=currency,
        snapshot_type=snapshot_type,
    )
    session.add(record)
    await session.flush()
    return record
