"""Бизнес-логика страницы «Обзор».

Агрегирует плановые и фактические снапшоты пользователя в единый объект
ответа для эндпоинта ``GET /api/v1/dashboard/overview``. Слой API
ограничен формированием HTTP-ответа: вся арифметика выполняется здесь.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import snapshot as snapshot_crud
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.models.snapshot import ActualSnapshot, PlannedSnapshot
from app.models.user_category import UserCategory
from app.schemas.dashboard import (
    AccountSummary,
    CapitalChartPoint,
    CapitalSummary,
    CategoryAmount,
    DashboardOverviewResponse,
    ExpectedBlock,
    NowExpected,
    RecentSnapshot,
    SnapshotStatus,
)
from app.services.auth import ACCOUNT_CATEGORY_TYPE
from app.services.onboarding import MAIN_ACCOUNT_NAME, build_snapshot_key

MONTH_LABELS_RU: tuple[str, ...] = (
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
)
MONTH_LABELS_SHORT_RU: tuple[str, ...] = (
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
)
CHART_MONTHS: int = 12
RECENT_PAST_MONTHS: int = 2
RECENT_FUTURE_MONTHS: int = 1


class _SnapshotLike(Protocol):
    incomes: dict[str, int]
    expenses: dict[str, int]
    savings_deposits: dict[str, int]
    savings_withdrawals: dict[str, int]


def _sum_values(d: dict[str, int]) -> int:
    """Возвращает сумму значений JSONB-словаря снапшота."""
    return sum(d.values())


def _net(snap: _SnapshotLike) -> int:
    """Чистое изменение капитала за период: ``incomes − expenses``."""
    return _sum_values(snap.incomes) - _sum_values(snap.expenses)


def _shift_month_key(key: str, delta: int) -> str:
    """Сдвигает ключ месяца на ``delta`` месяцев (отрицательное — назад).

    Args:
        key: Ключ месяца в формате ``YYYY-MM``.
        delta: Сдвиг в месяцах.

    Returns:
        Новый ключ месяца того же формата.
    """
    year_str, month_str = key.split("-")
    y, m = int(year_str), int(month_str) + delta
    while m <= 0:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    return f"{y}-{m:02d}"


def _parse_month_key(key: str) -> tuple[int, int]:
    """Возвращает пару ``(year, month)`` из ключа ``YYYY-MM``."""
    year_str, month_str = key.split("-")
    return int(year_str), int(month_str)


def _format_long_month(key: str) -> str:
    """Локализованное полное название месяца с годом (``"Май 2026"``)."""
    year, month = _parse_month_key(key)
    return f"{MONTH_LABELS_RU[month - 1]} {year}"


def _format_short_month(key: str) -> str:
    """Короткое локализованное название месяца (``"Май"``)."""
    _, month = _parse_month_key(key)
    return MONTH_LABELS_SHORT_RU[month - 1]


def _account_status(
    has_plan: bool,
    has_actual: bool,
    is_current: bool,
) -> SnapshotStatus:
    """Определяет статус снапшота по наличию плана и факта.

    Args:
        has_plan: Существует ли плановый снапшот за период.
        has_actual: Существует ли фактический снапшот за период.
        is_current: Период совпадает с текущим месяцем пользователя.

    Returns:
        Один из статусов ``closed`` / ``current`` / ``planned`` / ``unplanned``.
    """
    if has_actual:
        return "closed"
    if is_current:
        return "current"
    if has_plan:
        return "planned"
    return "unplanned"


def _initial_capital(accounts: Iterable[UserCategory]) -> dict[str, int]:
    """Стартовые балансы счетов пользователя в виде ``{имя: сумма}``."""
    return {
        a.name: a.initial_capital
        for a in accounts
        if a.initial_capital is not None
    }


class DashboardService:
    """Сервис формирования агрегированного ответа страницы «Обзор»."""

    async def get_overview(
        self,
        session: AsyncSession,
        user_id: int,
        *,
        now: datetime | None = None,
    ) -> DashboardOverviewResponse:
        """Возвращает агрегированные данные для страницы «Обзор».

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            now: Опциональное текущее время (для тестов). По умолчанию —
                реальное время по МСК, как и в онбординге.

        Returns:
            Ответ эндпоинта ``GET /api/v1/dashboard/overview``.
        """
        settings = await user_settings_crud.get_by_user_id(session, user_id)
        snapshot_type = settings.snapshot_type if settings is not None else "MONTLY"
        currency = settings.currency if settings is not None else "USD"
        current_key = build_snapshot_key(snapshot_type, now=now)

        plans = await snapshot_crud.list_planned(session, user_id)
        actuals = await snapshot_crud.list_actual(session, user_id)
        plans_by_key: dict[str, PlannedSnapshot] = {p.snapshot_key: p for p in plans}
        actuals_by_key: dict[str, ActualSnapshot] = {a.snapshot_key: a for a in actuals}

        accounts = await user_category_crud.list_by_user(
            session,
            user_id,
            type_=ACCOUNT_CATEGORY_TYPE,
        )
        initial_capital = _initial_capital(accounts)

        has_any = bool(plans or actuals)
        current_plan = plans_by_key.get(current_key)

        capital = _build_capital(
            accounts=accounts,
            initial_capital=initial_capital,
            actuals=actuals,
            current_key=current_key,
            current_plan=current_plan,
        )
        chart = _build_capital_chart(
            current_key=current_key,
            plans_by_key=plans_by_key,
            actuals_by_key=actuals_by_key,
        )
        expected_income = _build_expected_block(
            current_plan,
            attr="incomes",
        )
        expected_expense = _build_expected_block(
            current_plan,
            attr="expenses",
        )
        recent_snapshots = _build_recent_snapshots(
            current_key=current_key,
            plans_by_key=plans_by_key,
            actuals_by_key=actuals_by_key,
            initial_capital_total=sum(initial_capital.values()),
        )

        return DashboardOverviewResponse(
            has_any_snapshot=has_any,
            has_current_plan=current_plan is not None,
            current_snapshot_key=current_key,
            current_month_label=_format_long_month(current_key),
            currency=currency,
            capital=capital,
            capital_chart=chart,
            expected_income=expected_income,
            expected_expense=expected_expense,
            recent_snapshots=recent_snapshots,
        )


def _build_capital(
    *,
    accounts: list[UserCategory],
    initial_capital: dict[str, int],
    actuals: list[ActualSnapshot],
    current_key: str,
    current_plan: PlannedSnapshot | None,
) -> CapitalSummary:
    """Сводка капитала на основании закрытых фактов и текущего плана.

    «Сейчас» — это сумма закрытых фактических снапшотов на сегодня, плюс
    стартовые балансы. «Ожидается» — то же плюс плановые значения текущего
    месяца. Чистый капитал не зависит от перемещений между счетами:
    ``savings_deposits``/``savings_withdrawals`` — это внутренние переводы.
    """
    closed_actuals = [a for a in actuals if a.snapshot_key < current_key]

    total_initial = sum(initial_capital.values())
    closed_net = sum(_net(a) for a in closed_actuals)
    net_now = total_initial + closed_net
    net_delta_plan = _net(current_plan) if current_plan is not None else 0
    net_expected = net_now + net_delta_plan

    main_initial = initial_capital.get(MAIN_ACCOUNT_NAME, 0)
    main_now = main_initial + closed_net
    for actual in closed_actuals:
        main_now -= _sum_values(actual.savings_deposits)
        main_now += _sum_values(actual.savings_withdrawals)
    main_expected = main_now + net_delta_plan
    if current_plan is not None:
        main_expected -= _sum_values(current_plan.savings_deposits)
        main_expected += _sum_values(current_plan.savings_withdrawals)

    savings_accounts: list[AccountSummary] = []
    for account in accounts:
        if account.name == MAIN_ACCOUNT_NAME:
            continue
        start = initial_capital.get(account.name, 0)
        now_value = start
        for actual in closed_actuals:
            now_value += actual.savings_deposits.get(account.name, 0)
            now_value -= actual.savings_withdrawals.get(account.name, 0)
        expected_value = now_value
        if current_plan is not None:
            expected_value += current_plan.savings_deposits.get(account.name, 0)
            expected_value -= current_plan.savings_withdrawals.get(account.name, 0)
        savings_accounts.append(
            AccountSummary(name=account.name, now=now_value, expected=expected_value)
        )

    return CapitalSummary(
        net_capital=NowExpected(now=net_now, expected=net_expected),
        main_account=AccountSummary(
            name=MAIN_ACCOUNT_NAME,
            now=main_now,
            expected=main_expected,
        ),
        savings_accounts=savings_accounts,
    )


def _build_capital_chart(
    *,
    current_key: str,
    plans_by_key: dict[str, PlannedSnapshot],
    actuals_by_key: dict[str, ActualSnapshot],
) -> list[CapitalChartPoint]:
    """Накопительные ряды плана и факта за последние 12 месяцев.

    Для каждого месяца в диапазоне план — накопительная сумма ``net`` по
    плановым снапшотам на конец месяца, факт — то же по фактическим
    (если для месяца факта нет, ``actual`` равен ``None``).
    """
    keys = [
        _shift_month_key(current_key, delta)
        for delta in range(-(CHART_MONTHS - 1), 1)
    ]

    plan_cum = 0
    actual_cum = 0
    has_actual = False
    points: list[CapitalChartPoint] = []
    for key in keys:
        plan = plans_by_key.get(key)
        actual = actuals_by_key.get(key)
        if plan is not None:
            plan_cum += _net(plan)
        if actual is not None:
            actual_cum += _net(actual)
            has_actual = True
        points.append(
            CapitalChartPoint(
                month_key=key,
                label=_format_short_month(key),
                plan=plan_cum,
                actual=actual_cum if has_actual else None,
            )
        )
    return points


def _build_expected_block(
    plan: PlannedSnapshot | None,
    *,
    attr: str,
) -> ExpectedBlock:
    """Блок «ожидаемые доходы/расходы» из планового снапшота текущего месяца.

    Args:
        plan: Плановый снапшот текущего месяца (или ``None``).
        attr: Имя поля снапшота с разбивкой по категориям
            (``"incomes"`` или ``"expenses"``).

    Returns:
        Заполненный блок ``ExpectedBlock`` с суммой и сортировкой
        категорий по убыванию значения; для отсутствующего плана —
        пустой блок (``total=0``, ``subs=[]``).
    """
    if plan is None:
        return ExpectedBlock(total=0, subs=[])
    bucket: dict[str, int] = getattr(plan, attr)
    subs = sorted(
        (CategoryAmount(name=name, value=value) for name, value in bucket.items()),
        key=lambda c: c.value,
        reverse=True,
    )
    return ExpectedBlock(total=sum(bucket.values()), subs=subs)


def _build_recent_snapshots(
    *,
    current_key: str,
    plans_by_key: dict[str, PlannedSnapshot],
    actuals_by_key: dict[str, ActualSnapshot],
    initial_capital_total: int,
) -> list[RecentSnapshot]:
    """Список «последних» снапшотов вокруг текущего месяца.

    В выборку попадают ``RECENT_PAST_MONTHS`` предыдущих месяцев, текущий
    и ``RECENT_FUTURE_MONTHS`` будущих — всего 4 элемента.

    Для каждого месяца рассчитываются накопительные капиталы (план и
    факт) — это сумма стартового капитала пользователя и чистых
    изменений (``incomes − expenses``) по плановым / фактическим
    снапшотам всех месяцев до этого включительно.
    """
    keys = [
        _shift_month_key(current_key, delta)
        for delta in range(-RECENT_PAST_MONTHS, RECENT_FUTURE_MONTHS + 1)
    ]

    items: list[RecentSnapshot] = []
    for key in keys:
        year, month = _parse_month_key(key)
        plan = plans_by_key.get(key)
        actual = actuals_by_key.get(key)
        status = _account_status(
            has_plan=plan is not None,
            has_actual=actual is not None,
            is_current=(key == current_key),
        )
        planned_income = _sum_values(plan.incomes) if plan is not None else 0
        planned_expense = _sum_values(plan.expenses) if plan is not None else 0
        actual_income = _sum_values(actual.incomes) if actual is not None else None
        actual_expense = _sum_values(actual.expenses) if actual is not None else None

        planned_capital = initial_capital_total + sum(
            _net(p)
            for k, p in plans_by_key.items()
            if k <= key
        )
        actual_capital: int | None
        if actual is not None:
            actual_capital = initial_capital_total + sum(
                _net(a)
                for k, a in actuals_by_key.items()
                if k <= key
            )
        else:
            actual_capital = None

        items.append(
            RecentSnapshot(
                snapshot_key=key,
                year=year,
                month=month,
                month_name=MONTH_LABELS_RU[month - 1],
                label=_format_long_month(key),
                status=status,
                has_plan=plan is not None,
                has_actual=actual is not None,
                planned_income=planned_income,
                planned_expense=planned_expense,
                planned_capital=planned_capital,
                actual_income=actual_income,
                actual_expense=actual_expense,
                actual_capital=actual_capital,
            )
        )
    return items


dashboard_service = DashboardService()
