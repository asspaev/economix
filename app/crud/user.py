from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def get_by_username(session: AsyncSession, username: str) -> User | None:
    """Возвращает пользователя по имени, либо ``None``.

    Args:
        session: Активная сессия SQLAlchemy.
        username: Имя пользователя для поиска.

    Returns:
        Найденный экземпляр :class:`User` или ``None``, если запись
        с указанным именем отсутствует.
    """
    return await session.scalar(select(User).where(User.username == username))


async def create(
    session: AsyncSession,
    *,
    username: str,
    password_hash: str,
) -> User:
    """Создаёт нового пользователя и фиксирует транзакцию.

    Args:
        session: Активная сессия SQLAlchemy.
        username: Имя нового пользователя.
        password_hash: Bcrypt-хэш пароля, рассчитанный на уровне сервиса.

    Returns:
        Созданная учётная запись с заполненным ``user_id`` и полями аудита.
    """
    user = User(username=username, password_hash=password_hash)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user
