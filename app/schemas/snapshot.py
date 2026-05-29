from pydantic import BaseModel, Field


class SnapshotPayload(BaseModel):
    """Тело снапшота: суммы по категориям и счетам за период.

    Ключи всех словарей — имена категорий пользователя; значения — суммы
    в основной валюте. Категории доходов и расходов используют типы
    ``INCOME`` и ``EXPENSE`` соответственно, счета сбережений —
    ``ACCOUNT``.

    Attributes:
        incomes: Доходы за период в разрезе категорий ``INCOME``.
        expenses: Расходы за период в разрезе категорий ``EXPENSE``.
        savings_deposits: Пополнения сбережений по счетам ``ACCOUNT``.
        savings_withdrawals: Расходы сбережений по счетам ``ACCOUNT``.
    """

    incomes: dict[str, int] = Field(default_factory=dict)
    expenses: dict[str, int] = Field(default_factory=dict)
    savings_deposits: dict[str, int] = Field(default_factory=dict)
    savings_withdrawals: dict[str, int] = Field(default_factory=dict)


class SnapshotRead(SnapshotPayload):
    """Снапшот в ответе API с привязкой к ключу периода.

    Attributes:
        snapshot_key: Ключ периода в формате ``YYYY-MM``.
    """

    snapshot_key: str


class SnapshotsList(BaseModel):
    """Полная коллекция снапшотов пользователя.

    Attributes:
        planned: Все плановые снапшоты пользователя, упорядоченные по
            возрастанию ``snapshot_key``.
        actual: Все фактические снапшоты пользователя, упорядоченные по
            возрастанию ``snapshot_key``.
        currency: Код валюты пользователя для отображения сумм
            (например, ``RUB``, ``USD``, ``EUR``).
    """

    planned: list[SnapshotRead]
    actual: list[SnapshotRead]
    currency: str
