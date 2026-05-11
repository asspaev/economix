from typing import Final

from fastapi import APIRouter, HTTPException, Response, status

from app.config import settings
from app.core.dependencies import SqlSession
from app.core.exceptions import InvalidCredentialsError, UsernameAlreadyTakenError
from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.user import UserResponse
from app.services.auth import auth_service

ACCESS_TOKEN_COOKIE: Final[str] = "access_token"


router = APIRouter(prefix="/auth", tags=["auth"])


def _set_access_token_cookie(response: Response, token: str) -> None:
    """Сохраняет JWT в HttpOnly cookie ответа.

    Срок жизни cookie совпадает со сроком жизни JWT, заданным
    в :attr:`JwtConfig.access_token_expire_minutes`.

    Args:
        response: Объект ответа FastAPI, к которому добавляется cookie.
        token: Закодированный JWT, выпущенный сервисом аутентификации.
    """
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=token,
        max_age=settings.jwt.access_token_expire_minutes * 60,
        httponly=True,
        secure=False,
        samesite="lax",
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    session: SqlSession,
    response: Response,
):
    """Регистрирует нового пользователя и сохраняет JWT в cookie.

    Args:
        payload: Имя пользователя и пароль для создания учётной записи.
        session: Активная сессия SQLAlchemy.
        response: Объект ответа, в который добавляется cookie с JWT.

    Returns:
        Созданная учётная запись пользователя.

    Raises:
        fastapi.HTTPException: Со статусом 409, если ``username`` уже занят.
    """
    try:
        user, token = await auth_service.register(
            session,
            payload.username,
            payload.password,
        )
    except UsernameAlreadyTakenError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username is already taken",
        ) from exc
    _set_access_token_cookie(response, token)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    session: SqlSession,
    response: Response,
):
    """Аутентифицирует пользователя и сохраняет JWT в cookie.

    Args:
        payload: Имя пользователя и пароль.
        session: Активная сессия SQLAlchemy.
        response: Объект ответа, в который добавляется cookie с JWT.

    Returns:
        Учётная запись аутентифицированного пользователя.

    Raises:
        fastapi.HTTPException: Со статусом 401, если пара логин/пароль
            неверна.
    """
    try:
        user, token = await auth_service.login(
            session,
            payload.username,
            payload.password,
        )
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        ) from exc
    _set_access_token_cookie(response, token)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    """Завершает сессию, удаляя cookie с JWT на стороне клиента.

    Args:
        response: Объект ответа, из которого удаляется cookie с JWT.
    """
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE,
        httponly=True,
        secure=False,
        samesite="lax",
    )
