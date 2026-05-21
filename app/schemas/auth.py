from pydantic import BaseModel, Field

from app.schemas.user import UserResponse


class RegisterRequest(BaseModel):
    """Входные данные эндпоинта регистрации.

    Attributes:
        username: Желаемое имя пользователя.
        password: Пароль пользователя в открытом виде.
    """

    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    """Входные данные эндпоинта аутентификации.

    Attributes:
        username: Имя пользователя.
        password: Пароль пользователя в открытом виде.
    """

    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=6, max_length=128)


class AuthResponse(BaseModel):
    """Ответ эндпоинтов входа и регистрации.

    Содержит подписанный JWT, который клиент сохраняет в собственный
    кеш (например, ``localStorage``), и данные о созданной или
    аутентифицированной учётной записи.

    Attributes:
        access_token: Закодированный JWT для последующих запросов.
        token_type: Тип токена, всегда ``bearer``.
        user: Публичные данные пользователя.
    """

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
