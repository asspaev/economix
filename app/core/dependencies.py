from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql import sql_session_manager


async def get_sql_session() -> AsyncIterator[AsyncSession]:
    """Поставляет асинхронную сессию SQLAlchemy в обработчики FastAPI.

    Используется как зависимость через :func:`fastapi.Depends`. Гарантирует
    закрытие сессии и откат транзакции при возникновении исключения внутри
    обработчика запроса.

    Yields:
        AsyncSession: Активная сессия SQLAlchemy, связанная с пулом
        соединений приложения.
    """
    async with sql_session_manager.session() as session:
        yield session


SqlSession = Annotated[AsyncSession, Depends(get_sql_session)]
"""Алиас типа для внедрения сессии SQLAlchemy в обработчики FastAPI.

Пример::

    @router.get("/items")
    async def list_items(session: SqlSession) -> list[Item]:
        ...
"""
