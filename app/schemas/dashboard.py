from typing import Literal

from pydantic import BaseModel, Field


SnapshotStatus = Literal["closed", "current", "planned", "unplanned"]


class NowExpected(BaseModel):
    """Пара «сейчас / ожидается» для агрегированного показателя капитала.

    Attributes:
        now: Сумма по закрытым фактическим снапшотам на сегодня.
        expected: Прогноз с учётом плановых значений текущего периода.
    """

    now: int
    expected: int


class AccountSummary(BaseModel):
    """Сводка по счёту: текущий и ожидаемый остатки.

    Attributes:
        name: Отображаемое название счёта.
        now: Сумма закрытых фактов плюс стартовый капитал счёта.
        expected: ``now`` плюс плановые движения текущего периода.
    """

    name: str
    now: int
    expected: int


class CapitalSummary(BaseModel):
    """Капитал в разрезе блоков ``OverviewCapital``.

    Attributes:
        net_capital: Чистый капитал (доходы − расходы) накопительно.
        main_account: Остаток основного счёта (``"Основной счёт"``).
        savings_accounts: Остатки остальных счетов (сбережения).
    """

    net_capital: NowExpected
    main_account: AccountSummary
    savings_accounts: list[AccountSummary] = Field(default_factory=list)


class CategoryAmount(BaseModel):
    """Сумма по категории внутри блоков ожидаемых доходов и расходов.

    Attributes:
        name: Название категории.
        value: Запланированная сумма за период.
    """

    name: str
    value: int


class ExpectedBlock(BaseModel):
    """Блок ожидаемых доходов или расходов на текущий период.

    Attributes:
        total: Итоговая сумма за период.
        subs: Разбивка по категориям.
    """

    total: int
    subs: list[CategoryAmount] = Field(default_factory=list)


class CapitalChartPoint(BaseModel):
    """Точка ряда на графике «План vs Факт».

    Attributes:
        month_key: Ключ месяца в формате ``YYYY-MM``.
        label: Короткая локализованная подпись месяца (например, ``"Май"``).
        plan: Накопительный плановый капитал на конец месяца.
        actual: Накопительный фактический капитал или ``None``, если факта
            ещё нет (месяц не закрыт).
    """

    month_key: str
    label: str
    plan: int
    actual: int | None = None


class RecentSnapshot(BaseModel):
    """Запись о снапшоте для блока ``RecentSnapshotsCalendar``.

    Attributes:
        snapshot_key: Ключ периода в формате ``YYYY-MM``.
        year: Календарный год.
        month: Календарный месяц (1—12).
        month_name: Локализованное название месяца без года (``"Май"``).
        label: Локализованное название периода (``"Май 2026"``).
        status: Статус снапшота: закрыт / текущий / спланирован / без плана.
        has_plan: Существует ли плановый снапшот за период.
        has_actual: Существует ли фактический снапшот за период (закрыт).
        planned_income: Итог запланированных доходов за период.
        planned_expense: Итог запланированных расходов за период.
        planned_capital: Накопительный плановый капитал на конец месяца.
        actual_income: Итог фактических доходов за период (``None`` —
            если факт не зафиксирован).
        actual_expense: Итог фактических расходов за период.
        actual_capital: Накопительный фактический капитал на конец месяца.
    """

    snapshot_key: str
    year: int
    month: int
    month_name: str
    label: str
    status: SnapshotStatus
    has_plan: bool
    has_actual: bool
    planned_income: int
    planned_expense: int
    planned_capital: int
    actual_income: int | None = None
    actual_expense: int | None = None
    actual_capital: int | None = None


class DashboardOverviewResponse(BaseModel):
    """Ответ эндпоинта ``GET /api/v1/dashboard/overview``.

    Содержит уже посчитанные суммы и доли под все блоки страницы «Обзор»,
    чтобы фронтенд не выполнял агрегаций. Если у пользователя нет ни
    одного снапшота, поле ``has_any_snapshot`` равно ``False`` — фронтенд
    показывает CTA «Создать первый снапшот» вместо блоков.

    Attributes:
        has_any_snapshot: Есть ли хотя бы один снапшот (план или факт).
        has_current_plan: Есть ли плановый снапшот на текущий период.
        current_snapshot_key: Ключ текущего периода (``YYYY-MM`` для
            месячного снапшота).
        current_month_label: Локализованное название текущего месяца
            (например, ``"Май 2026"``).
        currency: Код валюты пользователя из ``UserSettings`` (``"RUB"`` /
            ``"USD"`` / ``"EUR"``). При отсутствии настроек — ``"USD"``.
        capital: Сводка капитала и остатков по счетам.
        capital_chart: Месячные ряды плана и факта для графика капитала.
        expected_income: Ожидаемые доходы за текущий период.
        expected_expense: Ожидаемые расходы за текущий период.
        recent_snapshots: Последние снапшоты пользователя (для календаря).
    """

    has_any_snapshot: bool
    has_current_plan: bool
    current_snapshot_key: str
    current_month_label: str
    currency: str
    capital: CapitalSummary
    capital_chart: list[CapitalChartPoint] = Field(default_factory=list)
    expected_income: ExpectedBlock
    expected_expense: ExpectedBlock
    recent_snapshots: list[RecentSnapshot] = Field(default_factory=list)
