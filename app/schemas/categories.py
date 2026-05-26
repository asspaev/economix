from typing import Literal

from pydantic import BaseModel, Field

CategoryType = Literal["INCOME", "EXPENSE", "ACCOUNT"]


class CategoryRead(BaseModel):
    """Категория пользователя в ответах API.

    Attributes:
        category_id: Идентификатор категории, уникальный в пределах
            пользователя.
        type: Тип категории.
        name: Отображаемое имя категории.
        initial_capital: Стартовый капитал (применимо к ``ACCOUNT``); для
            доходов и расходов — ``None``.
        is_archived: Признак архивной категории.
    """

    category_id: int
    type: CategoryType
    name: str
    initial_capital: int | None = None
    is_archived: bool

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    """Тело запроса на создание категории.

    Attributes:
        type: Тип создаваемой категории.
        name: Отображаемое имя категории.
        initial_capital: Стартовый капитал. Допускается только для счетов
            (``ACCOUNT``).
    """

    type: CategoryType
    name: str = Field(min_length=1, max_length=120)
    initial_capital: int | None = None


class CategoryUpdate(BaseModel):
    """Тело запроса на частичное обновление категории.

    Все поля необязательны: фронтенд передаёт только то, что меняет.
    """

    name: str | None = Field(default=None, min_length=1, max_length=120)
    initial_capital: int | None = None


class CategoryArchive(BaseModel):
    """Тело запроса на переключение архивного статуса категории.

    Attributes:
        is_archived: Целевое значение флага архивации.
    """

    is_archived: bool
