"""Бизнес-логика страницы «Аналитика».

Агрегирует плановые и фактические снапшоты пользователя в объект для
эндпоинта ``GET /api/v1/analytics/overview``: до двух опций переключателя
снапшота, по три ряда «План vs Факт» на каждую опцию и сценарий
накопительного капитала (как на графике страницы «Обзор»).
"""

from __future__ import annotations

import calendar
from datetime import datetime
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import snapshot as snapshot_crud
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.models.snapshot import ActualSnapshot, PlannedSnapshot
from app.models.user_category import UserCategory
from app.schemas.analytics import (
    AnalyticsCategoryRow,
    AnalyticsOverviewResponse,
    AnalyticsPlanVsActualBlock,
    AnalyticsPlanVsActualRow,
    AnalyticsScenario,
    AnalyticsScenarioPoint,
    AnalyticsSnapshotOption,
)
from app.services.auth import ACCOUNT_CATEGORY_TYPE
from app.services.dashboard import (
    CHART_MONTHS,
    _build_capital_chart,
    _net,
    _parse_month_key,
    _shift_month_key,
)
from app.services.onboarding import MAIN_ACCOUNT_NAME, MOSCOW_TZ, build_snapshot_key

RU_MONTHS_GEN: tuple[str, ...] = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
RU_MONTHS_DAT: tuple[str, ...] = (
    "январскому",
    "февральскому",
    "мартовскому",
    "апрельскому",
    "майскому",
    "июньскому",
    "июльскому",
    "августовскому",
    "сентябрьскому",
    "октябрьскому",
    "ноябрьскому",
    "декабрьскому",
)


class _SnapshotLike(Protocol):
    incomes: dict[str, int]
    expenses: dict[str, int]
    savings_deposits: dict[str, int]
    savings_withdrawals: dict[str, int]


def _format_fact_hint(key: str) -> str:
    """Подпись «закрыт 1 {след_месяц_родит} {год}» для опции «факт»."""
    next_key = _shift_month_key(key, 1)
    year, month = _parse_month_key(next_key)
    return f"закрыт 1 {RU_MONTHS_GEN[month - 1]} {year}"


def _format_pending_hint(key: str) -> str:
    """Подпись «до 1 {след_месяц_родит} {год}» для опции «ожидается»."""
    next_key = _shift_month_key(key, 1)
    year, month = _parse_month_key(next_key)
    return f"до 1 {RU_MONTHS_GEN[month - 1]} {year}"


def _format_label(key: str) -> str:
    """Локализованная подпись месяца с заглавной (``"Апрель 2026"``)."""
    year, month = _parse_month_key(key)
    months_nom = (
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
    return f"{months_nom[month - 1]} {year}"


def _format_fact_note(key: str) -> str:
    """Подпись под цифрой для опции «факт»: ``"к мартовскому снапшоту"``."""
    prev_key = _shift_month_key(key, -1)
    _, month = _parse_month_key(prev_key)
    return f"к {RU_MONTHS_DAT[month - 1]} снапшоту"


def _format_pending_note(key: str, now: datetime) -> str:
    """Подпись для опции «ожидается»: ``"11 из 31 дней · прогноз к 1 июня"``."""
    year, month = _parse_month_key(key)
    total_days = calendar.monthrange(year, month)[1]
    if now.year == year and now.month == month:
        passed = now.day
    elif (now.year, now.month) > (year, month):
        passed = total_days
    else:
        passed = 0
    passed = max(1, min(passed, total_days))
    next_key = _shift_month_key(key, 1)
    _, next_month = _parse_month_key(next_key)
    return (
        f"{passed} из {total_days} дней · "
        f"прогноз к 1 {RU_MONTHS_GEN[next_month - 1]}"
    )


def _sum_bucket(bucket: dict[str, int] | None) -> int:
    if not bucket:
        return 0
    return sum(bucket.values())


def _category_subs(
    plan: _SnapshotLike | None,
    actual: _SnapshotLike | None,
    *,
    attr: str,
) -> list[AnalyticsCategoryRow]:
    """Строки разбивки по категориям для income/expense.

    Объединяет ключи плана и факта; архивированные категории попадают, если
    в них есть данные (то есть имя присутствует хотя бы в одной из карт).
    """
    plan_bucket = getattr(plan, attr) if plan is not None else {}
    actual_bucket = getattr(actual, attr) if actual is not None else {}
    names = list(plan_bucket.keys())
    for name in actual_bucket.keys():
        if name not in plan_bucket:
            names.append(name)
    rows = [
        AnalyticsCategoryRow(
            name=name,
            plan=int(plan_bucket.get(name, 0)),
            actual=int(actual_bucket.get(name, 0)),
        )
        for name in names
    ]
    return rows


def _capital_subs(
    plan: _SnapshotLike | None,
    actual: _SnapshotLike | None,
    accounts: list[UserCategory],
) -> list[AnalyticsCategoryRow]:
    """Строки разбивки по счетам, включая основной счёт.

    Для не-главных счетов значение — ``deposits − withdrawals`` из соответствующего
    снапшота. Для основного — ``net(snap) − Σ(остальные deposits) + Σ(остальные withdrawals)``
    (зеркалит ``computeMainAccount`` из фронтенда).
    """

    def _per_account(snap: _SnapshotLike | None, name: str) -> int:
        if snap is None:
            return 0
        dep = snap.savings_deposits.get(name, 0)
        wd = snap.savings_withdrawals.get(name, 0)
        return int(dep) - int(wd)

    def _main_value(snap: _SnapshotLike | None) -> int:
        if snap is None:
            return 0
        net_val = _net(snap)
        others_net = 0
        for account in accounts:
            if account.name == MAIN_ACCOUNT_NAME:
                continue
            others_net += _per_account(snap, account.name)
        return net_val - others_net

    rows: list[AnalyticsCategoryRow] = []
    has_main = any(a.name == MAIN_ACCOUNT_NAME for a in accounts)
    if has_main:
        rows.append(
            AnalyticsCategoryRow(
                name=MAIN_ACCOUNT_NAME,
                plan=_main_value(plan),
                actual=_main_value(actual),
            ),
        )
    for account in accounts:
        if account.name == MAIN_ACCOUNT_NAME:
            continue
        rows.append(
            AnalyticsCategoryRow(
                name=account.name,
                plan=_per_account(plan, account.name),
                actual=_per_account(actual, account.name),
            ),
        )
    return rows


def _spark_for_income_expense(
    end_key: str,
    by_key_actual: dict[str, ActualSnapshot],
    by_key_plan: dict[str, PlannedSnapshot],
    *,
    attr: str,
) -> list[int]:
    """12-месячный ряд для Sparkline по income/expense.

    Для каждого месяца берём факт, если есть, иначе план; пропуски
    заполняем последним известным значением, чтобы избежать «дыр».
    """
    keys = [
        _shift_month_key(end_key, delta)
        for delta in range(-(CHART_MONTHS - 1), 1)
    ]
    values: list[int] = []
    last = 0
    for key in keys:
        actual = by_key_actual.get(key)
        plan = by_key_plan.get(key)
        if actual is not None:
            last = _sum_bucket(getattr(actual, attr))
        elif plan is not None:
            last = _sum_bucket(getattr(plan, attr))
        values.append(last)
    return values


def _spark_for_capital(
    end_key: str,
    by_key_actual: dict[str, ActualSnapshot],
    by_key_plan: dict[str, PlannedSnapshot],
) -> list[int]:
    """12-месячный накопительный ряд капитала.

    На каждом месяце прибавляем ``_net()`` соответствующего снапшота
    (приоритет — факт, иначе план); если данных нет, повторяем
    накопленное значение.
    """
    keys = [
        _shift_month_key(end_key, delta)
        for delta in range(-(CHART_MONTHS - 1), 1)
    ]
    values: list[int] = []
    cum = 0
    for key in keys:
        actual = by_key_actual.get(key)
        plan = by_key_plan.get(key)
        if actual is not None:
            cum += _net(actual)
        elif plan is not None:
            cum += _net(plan)
        values.append(cum)
    return values


def _row_note(
    *,
    kind: str,
    snapshot_key: str,
    now: datetime,
) -> str:
    """Подпись под цифрой для одного ряда блока «План vs Факт»."""
    if kind == "fact":
        return _format_fact_note(snapshot_key)
    return _format_pending_note(snapshot_key, now)


def _build_block(
    *,
    snapshot_key: str,
    option_kind: str,
    plan: PlannedSnapshot | None,
    actual: ActualSnapshot | None,
    accounts: list[UserCategory],
    plans_by_key: dict[str, PlannedSnapshot],
    actuals_by_key: dict[str, ActualSnapshot],
    now: datetime,
) -> AnalyticsPlanVsActualBlock:
    """Тройка рядов ``PlanVsActualRow`` для одного снапшота."""
    note = _row_note(kind=option_kind, snapshot_key=snapshot_key, now=now)

    income_plan = _sum_bucket(plan.incomes) if plan is not None else 0
    income_actual = _sum_bucket(actual.incomes) if actual is not None else 0
    expense_plan = _sum_bucket(plan.expenses) if plan is not None else 0
    expense_actual = _sum_bucket(actual.expenses) if actual is not None else 0
    capital_plan = _net(plan) if plan is not None else 0
    capital_actual = _net(actual) if actual is not None else 0

    income_row = AnalyticsPlanVsActualRow(
        kind="income",
        name="Доходы",
        plan=income_plan,
        actual=income_actual,
        spark=_spark_for_income_expense(
            snapshot_key, actuals_by_key, plans_by_key, attr="incomes",
        ),
        note=note,
        subs=_category_subs(plan, actual, attr="incomes"),
    )
    expense_row = AnalyticsPlanVsActualRow(
        kind="expense",
        name="Расходы",
        plan=expense_plan,
        actual=expense_actual,
        spark=_spark_for_income_expense(
            snapshot_key, actuals_by_key, plans_by_key, attr="expenses",
        ),
        note=note,
        subs=_category_subs(plan, actual, attr="expenses"),
    )
    capital_row = AnalyticsPlanVsActualRow(
        kind="capital",
        name="Капитал",
        plan=capital_plan,
        actual=capital_actual,
        spark=_spark_for_capital(snapshot_key, actuals_by_key, plans_by_key),
        note=note,
        subs=_capital_subs(plan, actual, accounts),
    )
    return AnalyticsPlanVsActualBlock(
        income=income_row, expense=expense_row, capital=capital_row,
    )


def _build_scenario(
    *,
    current_key: str,
    plans_by_key: dict[str, PlannedSnapshot],
    actuals_by_key: dict[str, ActualSnapshot],
) -> AnalyticsScenario:
    """Накопительный сценарий «План vs Факт» за 12 месяцев."""
    chart = _build_capital_chart(
        current_key=current_key,
        plans_by_key=plans_by_key,
        actuals_by_key=actuals_by_key,
    )
    points = [
        AnalyticsScenarioPoint(
            month_key=p.month_key,
            label=p.label,
            plan=p.plan,
            actual=p.actual,
        )
        for p in chart
    ]
    plan_total = points[-1].plan if points else 0
    actual_total = 0
    for p in points:
        if p.actual is not None:
            actual_total = p.actual
    gap = actual_total - plan_total
    ahead = gap >= 0

    cross_label: str | None = None
    n = len(points)
    for i, point in enumerate(points):
        if point.actual is None:
            continue
        ok = True
        for j in range(i, n):
            other = points[j]
            if other.actual is None or (other.actual - other.plan) < 0:
                ok = False
                break
        if ok:
            cross_label = point.label
            break

    return AnalyticsScenario(
        points=points,
        plan_total=plan_total,
        actual_total=actual_total,
        gap=gap,
        ahead=ahead,
        cross_month_label=cross_label,
    )


def _build_snapshot_options(
    *,
    current_key: str,
    plans_by_key: dict[str, PlannedSnapshot],
    actuals_by_key: dict[str, ActualSnapshot],
) -> list[tuple[AnalyticsSnapshotOption, PlannedSnapshot | None, ActualSnapshot | None]]:
    """Список опций переключателя со связкой ``(option, plan, actual)``."""
    closed_keys = [k for k in actuals_by_key if k < current_key]
    last_closed_key = max(closed_keys) if closed_keys else None

    options: list[
        tuple[AnalyticsSnapshotOption, PlannedSnapshot | None, ActualSnapshot | None]
    ] = []
    if last_closed_key is not None:
        options.append(
            (
                AnalyticsSnapshotOption(
                    snapshot_key=last_closed_key,
                    label=_format_label(last_closed_key),
                    kind="fact",
                    hint=_format_fact_hint(last_closed_key),
                    state_label="Факт",
                ),
                plans_by_key.get(last_closed_key),
                actuals_by_key.get(last_closed_key),
            ),
        )
    current_plan = plans_by_key.get(current_key)
    if current_plan is not None:
        options.append(
            (
                AnalyticsSnapshotOption(
                    snapshot_key=current_key,
                    label=_format_label(current_key),
                    kind="pending",
                    hint=_format_pending_hint(current_key),
                    state_label="Ожидается",
                ),
                current_plan,
                actuals_by_key.get(current_key),
            ),
        )
    return options


class AnalyticsService:
    """Сервис формирования агрегированного ответа страницы «Аналитика»."""

    async def get_overview(
        self,
        session: AsyncSession,
        user_id: int,
        *,
        now: datetime | None = None,
    ) -> AnalyticsOverviewResponse:
        """Возвращает агрегированные данные для страницы «Аналитика».

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            now: Опциональное текущее время (для тестов); по умолчанию —
                ``datetime.now`` в часовом поясе МСК.
        """
        moment = now or datetime.now(MOSCOW_TZ)

        settings = await user_settings_crud.get_by_user_id(session, user_id)
        snapshot_type = settings.snapshot_type if settings is not None else "MONTLY"
        currency = settings.currency if settings is not None else "USD"
        current_key = build_snapshot_key(snapshot_type, now=moment)

        plans = await snapshot_crud.list_planned(session, user_id)
        actuals = await snapshot_crud.list_actual(session, user_id)
        plans_by_key: dict[str, PlannedSnapshot] = {p.snapshot_key: p for p in plans}
        actuals_by_key: dict[str, ActualSnapshot] = {a.snapshot_key: a for a in actuals}

        accounts = await user_category_crud.list_by_user(
            session,
            user_id,
            type_=ACCOUNT_CATEGORY_TYPE,
        )

        has_any = bool(plans or actuals)
        options_with_data = _build_snapshot_options(
            current_key=current_key,
            plans_by_key=plans_by_key,
            actuals_by_key=actuals_by_key,
        )

        snapshot_options: list[AnalyticsSnapshotOption] = []
        plan_vs_actual: dict[str, AnalyticsPlanVsActualBlock] = {}
        for option, plan, actual in options_with_data:
            snapshot_options.append(option)
            plan_vs_actual[option.snapshot_key] = _build_block(
                snapshot_key=option.snapshot_key,
                option_kind=option.kind,
                plan=plan,
                actual=actual,
                accounts=accounts,
                plans_by_key=plans_by_key,
                actuals_by_key=actuals_by_key,
                now=moment,
            )

        scenario = _build_scenario(
            current_key=current_key,
            plans_by_key=plans_by_key,
            actuals_by_key=actuals_by_key,
        )

        return AnalyticsOverviewResponse(
            currency=currency,
            has_any_snapshot=has_any,
            snapshot_options=snapshot_options,
            plan_vs_actual=plan_vs_actual,
            scenario=scenario,
        )


analytics_service = AnalyticsService()
