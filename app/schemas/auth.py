from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    """Входные данные эндпоинта регистрации.

    Attributes:
        username: Желаемое имя пользователя.
        password: Пароль пользователя в открытом виде.
    """

    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Входные данные эндпоинта аутентификации.

    Attributes:
        username: Имя пользователя.
        password: Пароль пользователя в открытом виде.
    """

    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=8, max_length=128)
