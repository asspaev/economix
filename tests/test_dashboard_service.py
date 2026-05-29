"""Тесты сервиса страницы «Обзор».

Покрывают агрегацию плановых и фактических снапшотов: happy-path с
закрытыми фактами и текущим планом, пустого пользователя (нет ни одного
снапшота), только план без факта и только факт без плана. Сессия БД и
CRUD-зависимости полностью заменены заглушками — реального обращения к
БД не происходит.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import pytest

from app.models.snapshot import ActualSnapshot, PlannedSnapshot
from app.models.user_category import UserCategory
from app.models.user_settings import UserSettings
from app.services import dashboard as dashboard_module
from app.services.dashboard import (
    CHART_FUTURE_BUFFER,
    CHART_PAST_MONTHS,
    DashboardService,
    _shift_month_key,
)
from app.services.onboarding import MAIN_ACCOUNT_NAME


NOW = datetime(2026, 5, 15, 12, 0)
CURRENT_KEY = "2026-05"


def _account(name: str, *, initial: int | None) -> UserCategory:
    return UserCategory(
        user_id=1,
        category_id=hash(name) & 0xFFFF,
        type="ACCOUNT",
        name=name,
        initial_capital=initial,
        is_archived=False,
    )


def _plan(
    key: str,
    *,
    incomes: dict[str, int] | None = None,
    expenses: dict[str, int] | None = None,
    deposits: dict[str, int] | None = None,
    withdrawals: dict[str, int] | None = None,
) -> PlannedSnapshot:
    return PlannedSnapshot(
        user_id=1,
        snapshot_key=key,
        incomes=incomes or {},
        expenses=expenses or {},
        savings_deposits=deposits or {},
        savings_withdrawals=withdrawals or {},
    )


def _actual(
    key: str,
    *,
    incomes: dict[str, int] | None = None,
    expenses: dict[str, int] | None = None,
    deposits: dict[str, int] | None = None,
    withdrawals: dict[str, int] | None = None,
) -> ActualSnapshot:
    return ActualSnapshot(
        user_id=1,
        snapshot_key=key,
        incomes=incomes or {},
        expenses=expenses or {},
        savings_deposits=deposits or {},
        savings_withdrawals=withdrawals or {},
    )


@pytest.fixture
def patch_crud(monkeypatch: pytest.MonkeyPatch):
    """Подменяет CRUD-функции, используемые сервисом, на заглушки."""

    def _apply(
        *,
        settings: UserSettings | None,
        plans: list[PlannedSnapshot],
        actuals: list[ActualSnapshot],
        accounts: list[UserCategory],
    ) -> None:
        async def _list_planned(session: Any, user_id: int, **_: Any) -> list[PlannedSnapshot]:
            return list(plans)

        async def _list_actual(session: Any, user_id: int, **_: Any) -> list[ActualSnapshot]:
            return list(actuals)

        async def _list_by_user(session: Any, user_id: int, **_: Any) -> list[UserCategory]:
            return list(accounts)

        async def _get_settings(session: Any, user_id: int) -> UserSettings | None:
            return settings

        monkeypatch.setattr(dashboard_module.snapshot_crud, "list_planned", _list_planned)
        monkeypatch.setattr(dashboard_module.snapshot_crud, "list_actual", _list_actual)
        monkeypatch.setattr(
            dashboard_module.user_category_crud,
            "list_by_user",
            _list_by_user,
        )
        monkeypatch.setattr(
            dashboard_module.user_settings_crud,
            "get_by_user_id",
            _get_settings,
        )

    return _apply


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_empty_user_returns_no_snapshot_flag(patch_crud) -> None:
    patch_crud(settings=None, plans=[], actuals=[], accounts=[])
    service = DashboardService()

    result = _run(service.get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is False
    assert result.has_current_plan is False
    assert result.current_snapshot_key == CURRENT_KEY
    assert result.current_month_label == "Май 2026"
    assert result.currency == "USD"
    assert result.capital.net_capital.now == 0
    assert result.capital.net_capital.expected == 0
    assert result.capital.main_account.now == 0
    assert result.capital.savings_accounts == []
    assert result.expected_income.total == 0
    assert result.expected_income.subs == []
    assert result.expected_expense.total == 0
    # Без планов хвост прогноза вырождается до буфера в 6 месяцев.
    assert len(result.capital_chart) == CHART_PAST_MONTHS + CHART_FUTURE_BUFFER
    assert all(point.actual is None for point in result.capital_chart)
    assert all(point.plan == 0 for point in result.capital_chart)
    assert result.capital_chart[CHART_PAST_MONTHS - 1].month_key == CURRENT_KEY
    assert result.capital_chart[0].month_key == _shift_month_key(
        CURRENT_KEY, -(CHART_PAST_MONTHS - 1)
    )
    assert result.capital_chart[-1].month_key == _shift_month_key(
        CURRENT_KEY, CHART_FUTURE_BUFFER
    )
    assert all(point.year >= 2025 for point in result.capital_chart)
    assert len(result.recent_snapshots) == 4
    assert {s.status for s in result.recent_snapshots} == {"unplanned", "current"}
    assert all(s.has_actual is False for s in result.recent_snapshots)


def test_happy_path_aggregates_closed_and_current_plan(patch_crud) -> None:
    accounts = [
        _account(MAIN_ACCOUNT_NAME, initial=10_000),
        _account("Накопительный", initial=5_000),
    ]
    actuals = [
        _actual(
            "2026-03",
            incomes={"Зарплата": 5_000},
            expenses={"Аренда": 2_000},
            deposits={"Накопительный": 500},
        ),
        _actual(
            "2026-04",
            incomes={"Зарплата": 5_200},
            expenses={"Аренда": 2_100},
            deposits={"Накопительный": 600},
        ),
    ]
    plans = [
        _plan(
            "2026-05",
            incomes={"Зарплата": 5_300, "Фриланс": 700},
            expenses={"Аренда": 2_150, "Продукты": 800},
            deposits={"Накопительный": 700},
        ),
    ]
    patch_crud(
        settings=UserSettings(user_id=1, currency="RUB", snapshot_type="MONTLY"),
        plans=plans,
        actuals=actuals,
        accounts=accounts,
    )
    service = DashboardService()

    result = _run(service.get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is True
    assert result.has_current_plan is True
    assert result.current_snapshot_key == CURRENT_KEY

    # Капитал: начальный (15 000) + чистые факты за март/апрель.
    closed_net = (5_000 - 2_000) + (5_200 - 2_100)
    plan_net = (5_300 + 700) - (2_150 + 800)
    assert result.capital.net_capital.now == 15_000 + closed_net
    assert result.capital.net_capital.expected == 15_000 + closed_net + plan_net

    # Основной: стартовый + чистые факты − депозиты в сбережения.
    main_now = 10_000 + closed_net - (500 + 600)
    main_expected = main_now + plan_net - 700
    assert result.capital.main_account.now == main_now
    assert result.capital.main_account.expected == main_expected

    # Сбережения: стартовый + сумма депозитов на счёт по всем закрытым фактам.
    savings = result.capital.savings_accounts[0]
    assert savings.name == "Накопительный"
    assert savings.now == 5_000 + 500 + 600
    assert savings.expected == savings.now + 700

    # Ожидаемые доходы/расходы — из планового снапшота.
    assert result.expected_income.total == 6_000
    assert [s.name for s in result.expected_income.subs] == ["Зарплата", "Фриланс"]
    assert result.expected_expense.total == 2_950
    assert [s.name for s in result.expected_expense.subs] == ["Аренда", "Продукты"]

    # График: последний план — текущий май, поэтому хвост ровно
    # CHART_FUTURE_BUFFER = 6 месяцев вперёд.
    assert len(result.capital_chart) == CHART_PAST_MONTHS + CHART_FUTURE_BUFFER
    march_point = next(p for p in result.capital_chart if p.month_key == "2026-03")
    april_point = next(p for p in result.capital_chart if p.month_key == "2026-04")
    may_point = next(p for p in result.capital_chart if p.month_key == "2026-05")
    assert march_point.actual == 5_000 - 2_000
    assert march_point.year == 2026
    assert april_point.actual == closed_net
    # Май пока не закрыт — факт замораживается на накопленном уровне.
    assert may_point.actual == closed_net
    # План в мае включает чистое плановое значение.
    assert may_point.plan == plan_net
    # Будущие месяцы — плана для них нет, plan_cum переносится с мая, факт None.
    future_points = [p for p in result.capital_chart if p.month_key > CURRENT_KEY]
    assert len(future_points) == CHART_FUTURE_BUFFER
    assert all(p.actual is None for p in future_points)
    assert all(p.plan == plan_net for p in future_points)

    # Recent: 4 элемента, для текущего — current, для предыдущих с фактами — closed.
    by_key = {s.snapshot_key: s for s in result.recent_snapshots}
    assert by_key["2026-05"].status == "current"
    assert by_key["2026-04"].status == "closed"
    assert by_key["2026-03"].status == "closed"
    assert by_key[_shift_month_key(CURRENT_KEY, 1)].status == "unplanned"
    # Закрытые месяцы несут факты и накопительный фактический капитал.
    march = by_key["2026-03"]
    assert march.has_actual is True
    assert march.actual_income == 5_000
    assert march.actual_expense == 2_000
    assert march.actual_capital == 15_000 + (5_000 - 2_000)
    april = by_key["2026-04"]
    assert april.actual_capital == 15_000 + closed_net
    # Май — текущий: плановый капитал = initial + plan_net (нет более ранних планов).
    may_recent = by_key["2026-05"]
    assert may_recent.has_actual is False
    assert may_recent.planned_capital == 15_000 + plan_net
    assert may_recent.actual_capital is None
    assert may_recent.month_name == "Май"


def test_plan_only_without_actuals(patch_crud) -> None:
    accounts = [_account(MAIN_ACCOUNT_NAME, initial=1_000)]
    plans = [_plan("2026-05", incomes={"Зарплата": 3_000}, expenses={"Аренда": 1_500})]
    patch_crud(
        settings=UserSettings(user_id=1, currency="RUB", snapshot_type="MONTLY"),
        plans=plans,
        actuals=[],
        accounts=accounts,
    )

    result = _run(DashboardService().get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is True
    assert result.has_current_plan is True
    assert result.capital.net_capital.now == 1_000
    assert result.capital.net_capital.expected == 1_000 + (3_000 - 1_500)
    assert all(point.actual is None for point in result.capital_chart)
    may_point = next(p for p in result.capital_chart if p.month_key == "2026-05")
    assert may_point.plan == 3_000 - 1_500
    assert result.expected_income.total == 3_000


def test_actual_only_without_current_plan(patch_crud) -> None:
    accounts = [_account(MAIN_ACCOUNT_NAME, initial=2_000)]
    actuals = [_actual("2026-04", incomes={"Зарплата": 4_000}, expenses={"Аренда": 1_000})]
    patch_crud(
        settings=UserSettings(user_id=1, currency="RUB", snapshot_type="MONTLY"),
        plans=[],
        actuals=actuals,
        accounts=accounts,
    )

    result = _run(DashboardService().get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is True
    assert result.has_current_plan is False
    closed_net = 4_000 - 1_000
    # Без плана текущего месяца expected совпадает с now (нет прогноза).
    assert result.capital.net_capital.now == 2_000 + closed_net
    assert result.capital.net_capital.expected == 2_000 + closed_net
    # Ожидаемые блоки пустые.
    assert result.expected_income.total == 0
    assert result.expected_income.subs == []
    assert result.expected_expense.total == 0
    # На графике актуальный ряд определён для закрытого месяца и далее.
    april_point = next(p for p in result.capital_chart if p.month_key == "2026-04")
    assert april_point.actual == closed_net
    # План — нулевой, фактов в плановом ряду нет.
    assert all(point.plan == 0 for point in result.capital_chart)


def test_future_plans_extend_chart_to_last_plan_plus_buffer(patch_crud) -> None:
    accounts = [_account(MAIN_ACCOUNT_NAME, initial=1_000)]
    plans = [
        _plan("2026-05", incomes={"Зарплата": 3_000}, expenses={"Аренда": 1_500}),
        _plan("2026-08", incomes={"Зарплата": 3_200}),
        _plan("2027-02", incomes={"Зарплата": 3_400}),
    ]
    patch_crud(
        settings=UserSettings(user_id=1, currency="RUB", snapshot_type="MONTLY"),
        plans=plans,
        actuals=[],
        accounts=accounts,
    )

    result = _run(DashboardService().get_overview(session=object(), user_id=1, now=NOW))

    # Последний план — 2027-02 (+9 мес от текущего), значит хвост =
    # 9 + CHART_FUTURE_BUFFER (6) = 15 будущих месяцев, последний =
    # 2027-08.
    last_planned_offset = 9
    assert len(result.capital_chart) == CHART_PAST_MONTHS + last_planned_offset + CHART_FUTURE_BUFFER
    assert result.capital_chart[-1].month_key == _shift_month_key(
        CURRENT_KEY, last_planned_offset + CHART_FUTURE_BUFFER
    )
    # plan_cum накапливается, для месяцев без планов «зависает» на предыдущем.
    may_plan = 3_000 - 1_500
    may_point = next(p for p in result.capital_chart if p.month_key == "2026-05")
    jul_point = next(p for p in result.capital_chart if p.month_key == "2026-07")
    aug_point = next(p for p in result.capital_chart if p.month_key == "2026-08")
    feb_point = next(p for p in result.capital_chart if p.month_key == "2027-02")
    aug27_point = next(p for p in result.capital_chart if p.month_key == "2027-08")
    assert may_point.plan == may_plan
    assert jul_point.plan == may_plan
    assert aug_point.plan == may_plan + 3_200
    assert feb_point.plan == may_plan + 3_200 + 3_400
    # После последнего плана 6 буферных месяцев — план не растёт.
    assert aug27_point.plan == may_plan + 3_200 + 3_400
    # Будущие точки всегда без факта.
    future_points = [p for p in result.capital_chart if p.month_key > CURRENT_KEY]
    assert all(p.actual is None for p in future_points)


def test_shift_month_key_handles_year_boundaries() -> None:
    assert _shift_month_key("2026-01", -1) == "2025-12"
    assert _shift_month_key("2026-12", 1) == "2027-01"
    assert _shift_month_key("2026-05", 0) == "2026-05"
    assert _shift_month_key("2026-05", -12) == "2025-05"
