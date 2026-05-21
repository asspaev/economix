from typing import Final

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.config import settings
from app.core.dependencies import RedisDep, SqlSession
from app.core.exceptions import (
    OnboardingAlreadyCompletedError,
    OnboardingIncompleteError,
)
from app.crud import user as user_crud
from app.schemas.onboarding import (
    OnboardingCompleteResponse,
    OnboardingState,
    OnboardingStatePatch,
)
from app.schemas.user import UserResponse
from app.services.onboarding import onboarding_service

ACCESS_TOKEN_COOKIE: Final[str] = "access_token"


router = APIRouter(prefix="/onboarding", tags=["onboarding"])


def _user_id(request: Request) -> int:
    """Извлекает идентификатор пользователя из ``request.state.token_payload``.

    Args:
        request: Входящий HTTP-запрос Starlette.

    Returns:
        Числовой идентификатор пользователя из JWT.

    Raises:
        fastapi.HTTPException: Со статусом 401, если payload отсутствует
            или ``sub`` не приводится к целому.
    """
    payload = getattr(request.state, "token_payload", None)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from exc


def _set_access_token_cookie(response: Response, token: str) -> None:
    """Сохраняет JWT в HttpOnly cookie ответа."""
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=token,
        max_age=settings.jwt.access_token_expire_minutes * 60,
        httponly=True,
        secure=False,
        samesite="lax",
    )


@router.get("/state", response_model=OnboardingState)
async def read_state(request: Request, redis: RedisDep) -> OnboardingState:
    """Возвращает текущее состояние онбординга пользователя из Redis.

    Args:
        request: Входящий запрос (используется для извлечения ``user_id``).
        redis: Менеджер Redis.

    Returns:
        Состояние онбординга; отсутствующие поля представлены как ``None``.
    """
    user_id = _user_id(request)
    state = await onboarding_service.get_state(redis, user_id)
    return OnboardingState.model_validate(state)


@router.patch("/state", response_model=OnboardingState)
async def update_state(
    request: Request,
    patch: OnboardingStatePatch,
    redis: RedisDep,
) -> OnboardingState:
    """Частично обновляет состояние онбординга пользователя в Redis.

    Args:
        request: Входящий запрос.
        patch: Поля для перезаписи.
        redis: Менеджер Redis.

    Returns:
        Полное состояние онбординга после применения изменений.
    """
    user_id = _user_id(request)
    state = await onboarding_service.patch_state(
        redis,
        user_id,
        patch.model_dump(exclude_unset=True),
    )
    return OnboardingState.model_validate(state)


@router.post("/complete", response_model=OnboardingCompleteResponse)
async def complete(
    request: Request,
    response: Response,
    session: SqlSession,
    redis: RedisDep,
) -> OnboardingCompleteResponse:
    """Завершает онбординг: создаёт записи в БД и выпускает новый JWT.

    Args:
        request: Входящий запрос.
        response: Объект ответа, в который добавляется cookie с новым JWT.
        session: Активная сессия SQLAlchemy.
        redis: Менеджер Redis.

    Returns:
        Новый подписанный JWT и публичные данные пользователя.

    Raises:
        fastapi.HTTPException: Со статусом 409, если онбординг уже завершён.
        fastapi.HTTPException: Со статусом 400, если состояние в Redis
            заполнено не полностью.
    """
    user_id = _user_id(request)
    try:
        token = await onboarding_service.complete(session, redis, user_id)
    except OnboardingAlreadyCompletedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Onboarding is already completed",
        ) from exc
    except OnboardingIncompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Onboarding state is incomplete",
                "missing": exc.missing,
            },
        ) from exc

    user = await user_crud.get_by_id(session, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    _set_access_token_cookie(response, token)
    return OnboardingCompleteResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )
