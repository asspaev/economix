from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.user import UserResponse

CurrencyCode = Literal["RUB", "USD", "EUR"]
SnapshotType = Literal["WEEKLY", "MONTLY"]


class OnboardingInitialSnapshot(BaseModel):
    """Плановый снапшот первого периода, формируемый в онбординге.

    Ключ периода (``snapshot_key``) определяется на сервере по МСК времени
    и не передаётся клиентом.

    Attributes:
        incomes: Плановые доходы в разрезе категорий.
        expenses: Плановые расходы в разрезе категорий.
        savings_deposits: Плановые пополнения сбережений по счетам.
        savings_withdrawals: Плановые расходы сбережений по счетам.
    """

    incomes: dict[str, int] = Field(default_factory=dict)
    expenses: dict[str, int] = Field(default_factory=dict)
    savings_deposits: dict[str, int] = Field(default_factory=dict)
    savings_withdrawals: dict[str, int] = Field(default_factory=dict)


class OnboardingState(BaseModel):
    """Текущее состояние онбординга, хранимое в Redis.

    Каждое поле опционально — на разных шагах часть данных может быть
    не заполнена.

    Attributes:
        currency: Выбранная валюта.
        snapshot_type: Выбранный тип снапшота.
        income_categories: Список категорий доходов.
        expense_categories: Список категорий расходов.
        accounts: Список счетов (включая ``"Основной счёт"``).
        initial_capital: Стартовый капитал по счетам.
        initial_snapshot: Первый плановый снапшот.
    """

    currency: CurrencyCode | None = None
    snapshot_type: SnapshotType | None = None
    income_categories: list[str] | None = None
    expense_categories: list[str] | None = None
    accounts: list[str] | None = None
    initial_capital: dict[str, int] | None = None
    initial_snapshot: OnboardingInitialSnapshot | None = None


class OnboardingStatePatch(BaseModel):
    """Частичное обновление состояния онбординга.

    Содержит произвольное подмножество полей :class:`OnboardingState`,
    которые перезаписывают одноимённые ключи в Redis.
    """

    currency: CurrencyCode | None = None
    snapshot_type: SnapshotType | None = None
    income_categories: list[str] | None = None
    expense_categories: list[str] | None = None
    accounts: list[str] | None = None
    initial_capital: dict[str, int] | None = None
    initial_snapshot: OnboardingInitialSnapshot | None = None


class OnboardingCompleteResponse(BaseModel):
    """Ответ эндпоинта завершения онбординга.

    Attributes:
        access_token: Новый JWT с обновлёнными claim'ами.
        token_type: Тип токена, всегда ``bearer``.
        user: Учётная запись пользователя.
    """

    access_token: str
    token_type: str = "bearer"
    user: UserResponse
