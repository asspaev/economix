from typing import Literal

from pydantic import BaseModel, Field

AnalyticsSnapshotKind = Literal["fact", "pending"]
AnalyticsRowKind = Literal["income", "expense", "capital"]


class AnalyticsSnapshotOption(BaseModel):
    """Опция переключателя снапшота на странице «Аналитика».

    Attributes:
        snapshot_key: Ключ периода (``YYYY-MM``).
        label: Локализованная подпись (например, ``"Апрель 2026"``).
        kind: ``fact`` — есть закрытый факт; ``pending`` — только план.
        hint: Локализованная подсказка (``"закрыт 1 мая 2026"`` или
            ``"до 1 июня 2026"``).
        state_label: Короткая подпись ``"Факт"`` / ``"Ожидается"``.
    """

    snapshot_key: str
    label: str
    kind: AnalyticsSnapshotKind
    hint: str
    state_label: str


class AnalyticsCategoryRow(BaseModel):
    """Строка разбивки внутри блока ``PlanVsActualRow``.

    Attributes:
        name: Имя категории/счёта.
        plan: Плановая сумма за период.
        actual: Фактическая сумма (0, если факт не известен).
    """

    name: str
    plan: int
    actual: int


class AnalyticsPlanVsActualRow(BaseModel):
    """Один из трёх рядов карточки «План vs Факт» (доход / расход / капитал).

    Attributes:
        kind: Тип ряда (``income`` / ``expense`` / ``capital``).
        name: Локализованное название (``"Доходы"`` и т. п.).
        plan: Плановая сумма за период.
        actual: Фактическая сумма за период.
        spark: 12 значений для Sparkline (последние 12 месяцев).
        note: Текстовая подпись под цифрой.
        subs: Разбивка по категориям/счетам.
    """

    kind: AnalyticsRowKind
    name: str
    plan: int
    actual: int
    spark: list[int] = Field(default_factory=list)
    note: str
    subs: list[AnalyticsCategoryRow] = Field(default_factory=list)


class AnalyticsPlanVsActualBlock(BaseModel):
    """Тройка строк ``PlanVsActualRow`` для выбранного снапшота."""

    income: AnalyticsPlanVsActualRow
    expense: AnalyticsPlanVsActualRow
    capital: AnalyticsPlanVsActualRow


class AnalyticsScenarioPoint(BaseModel):
    """Точка сценария «Если бы план был исполнен».

    Attributes:
        month_key: Ключ месяца ``YYYY-MM``.
        label: Короткое название месяца (``"Май"``).
        plan: Накопительный плановый капитал на конец месяца.
        actual: Накопительный фактический капитал или ``None``.
    """

    month_key: str
    label: str
    plan: int
    actual: int | None = None


class AnalyticsScenario(BaseModel):
    """Данные нижнего блока «Сценарий · план исполнен».

    Attributes:
        points: 12 точек, по одной на месяц, как в графике обзора.
        plan_total: Итоговое плановое значение (``points[-1].plan``).
        actual_total: Последнее доступное фактическое значение (или 0).
        gap: ``actual_total − plan_total``.
        ahead: ``True``, если факт опережает план.
        cross_month_label: Месяц, с которого факт стабильно ≥ плана; ``None``,
            если факт не догнал план.
    """

    points: list[AnalyticsScenarioPoint] = Field(default_factory=list)
    plan_total: int
    actual_total: int
    gap: int
    ahead: bool
    cross_month_label: str | None = None


class AnalyticsOverviewResponse(BaseModel):
    """Ответ эндпоинта ``GET /api/v1/analytics/overview``.

    Attributes:
        currency: Код валюты пользователя.
        has_any_snapshot: Есть ли хотя бы один план или факт.
        snapshot_options: До двух опций переключателя (``fact`` / ``pending``).
        plan_vs_actual: Карта ``snapshot_key → PlanVsActualBlock``.
        scenario: Данные блока «План исполнен».
    """

    currency: str
    has_any_snapshot: bool
    snapshot_options: list[AnalyticsSnapshotOption] = Field(default_factory=list)
    plan_vs_actual: dict[str, AnalyticsPlanVsActualBlock] = Field(default_factory=dict)
    scenario: AnalyticsScenario
