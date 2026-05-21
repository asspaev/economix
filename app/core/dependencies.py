from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import RedisManager, redis_manager
from app.core.sql import sql_session_manager
from app.services.jwt import jwt_service


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


async def get_redis() -> RedisManager:
    """Поставляет менеджер Redis в обработчики FastAPI.

    Returns:
        Глобальный экземпляр :class:`RedisManager`, разделяемый между
        всеми обработчиками приложения.
    """
    return redis_manager


RedisDep = Annotated[RedisManager, Depends(get_redis)]
"""Алиас типа для внедрения менеджера Redis в обработчики FastAPI.

Пример::

    @router.get("/state")
    async def read_state(redis: RedisDep) -> dict[str, Any]:
        ...
"""


bearer_scheme = HTTPBearer(auto_error=True, description="JWT access token")


async def get_token_payload(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> dict[str, Any]:
    """Декодирует JWT из заголовка ``Authorization: Bearer <token>``.

    Используется как зависимость в защищённых эндпоинтах для извлечения
    полезной нагрузки токена. При невалидном или просроченном токене
    возбуждает HTTP 401 с заголовком ``WWW-Authenticate: Bearer``.

    Args:
        credentials: Учётные данные схемы Bearer, извлечённые FastAPI
            из заголовка ``Authorization``.

    Returns:
        Словарь с полями payload JWT (включая ``sub``, ``iat``, ``exp``).

    Raises:
        fastapi.HTTPException: Со статусом 401, если токен невалиден.
    """
    try:
        return jwt_service.decode_token(credentials.credentials)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


TokenPayload = Annotated[dict[str, Any], Depends(get_token_payload)]
"""Алиас типа для внедрения payload JWT в обработчики FastAPI.

Пример::

    @router.get("/me")
    async def read_me(payload: TokenPayload) -> dict[str, Any]:
        return {"user_id": payload["sub"]}
"""
