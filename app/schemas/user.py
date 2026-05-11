from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    """Публичное представление учётной записи пользователя.

    Используется как ``response_model`` в обработчиках, возвращающих данные
    пользователя без чувствительных полей (например, ``password_hash``).

    Attributes:
        user_id: Уникальный идентификатор пользователя.
        username: Отображаемое имя пользователя.
    """

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    username: str
