"""Тесты сервиса страницы «Аналитика».

Покрывают агрегацию плановых и фактических снапшотов в две опции
переключателя (последний закрытый факт / текущий план), три ряда «План
vs Факт» на каждую опцию и сценарий накопительного капитала. CRUD-слой
заменён заглушками — реальной БД не требуется.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

import pytest

from app.models.snapshot import ActualSnapshot, PlannedSnapshot
from app.models.user_category import UserCategory
from app.models.user_settings import UserSettings
from app.services import analytics as analytics_module
from app.services.analytics import AnalyticsService
from app.services.dashboard import CHART_PAST_MONTHS
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

        monkeypatch.setattr(analytics_module.snapshot_crud, "list_planned", _list_planned)
        monkeypatch.setattr(analytics_module.snapshot_crud, "list_actual", _list_actual)
        monkeypatch.setattr(
            analytics_module.user_category_crud,
            "list_by_user",
            _list_by_user,
        )
        monkeypatch.setattr(
            analytics_module.user_settings_crud,
            "get_by_user_id",
            _get_settings,
        )

    return _apply


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_happy_path_returns_two_options_and_scenario(patch_crud) -> None:
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
            incomes={"Зарплата": 5_200, "Фриланс": 600},
            expenses={"Аренда": 2_100, "Продукты": 700},
            deposits={"Накопительный": 600},
        ),
    ]
    plans = [
        _plan(
            "2026-04",
            incomes={"Зарплата": 5_000, "Фриланс": 500},
            expenses={"Аренда": 2_100, "Продукты": 800},
            deposits={"Накопительный": 700},
        ),
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

    result = _run(AnalyticsService().get_overview(session=object(), user_id=1, now=NOW))

    assert result.currency == "RUB"
    assert result.has_any_snapshot is True
    assert [o.snapshot_key for o in result.snapshot_options] == ["2026-04", "2026-05"]
    assert result.snapshot_options[0].kind == "fact"
    assert result.snapshot_options[0].hint == "закрыт 1 мая 2026"
    assert result.snapshot_options[0].state_label == "Факт"
    assert result.snapshot_options[0].label == "Апрель 2026"
    assert result.snapshot_options[1].kind == "pending"
    assert result.snapshot_options[1].hint == "до 1 июня 2026"
    assert result.snapshot_options[1].state_label == "Ожидается"

    april = result.plan_vs_actual["2026-04"]
    assert april.income.plan == 5_000 + 500
    assert april.income.actual == 5_200 + 600
    assert april.expense.plan == 2_100 + 800
    assert april.expense.actual == 2_100 + 700
    assert april.capital.plan == (5_000 + 500) - (2_100 + 800)
    assert april.capital.actual == (5_200 + 600) - (2_100 + 700)
    assert april.income.note == "к мартовскому снапшоту"
    # subs покрывают объединение категорий плана и факта.
    assert {s.name for s in april.income.subs} == {"Зарплата", "Фриланс"}
    # subs капитала включают основной счёт и сбережения.
    main_row = next(s for s in april.capital.subs if s.name == MAIN_ACCOUNT_NAME)
    savings_row = next(s for s in april.capital.subs if s.name == "Накопительный")
    assert savings_row.plan == 700
    assert savings_row.actual == 600
    # Для основного: net(snap) - сумма (deposits-withdrawals) других счетов.
    assert main_row.plan == april.capital.plan - 700
    assert main_row.actual == april.capital.actual - 600

    may = result.plan_vs_actual["2026-05"]
    assert may.income.plan == 5_300 + 700
    assert may.income.actual == 0
    assert may.income.note.startswith("15 из 31 дней")
    assert may.income.note.endswith("прогноз к 1 июня")

    # Sparkline — 12 значений на ряд.
    assert len(april.income.spark) == CHART_PAST_MONTHS
    assert len(april.capital.spark) == CHART_PAST_MONTHS

    # Scenario: 12 точек, actual_total — последний доступный накопительный факт.
    assert len(result.scenario.points) == CHART_PAST_MONTHS
    closed_net = (5_000 - 2_000) + (5_200 + 600 - 2_100 - 700)
    assert result.scenario.actual_total == closed_net
    plan_cum = sum(
        sum(p.incomes.values()) - sum(p.expenses.values()) for p in plans
    )
    assert result.scenario.plan_total == plan_cum
    assert result.scenario.gap == closed_net - plan_cum
    assert result.scenario.ahead == (result.scenario.gap >= 0)


def test_only_current_plan_returns_single_pending_option(patch_crud) -> None:
    accounts = [_account(MAIN_ACCOUNT_NAME, initial=1_000)]
    plans = [_plan("2026-05", incomes={"Зарплата": 3_000}, expenses={"Аренда": 1_500})]
    patch_crud(
        settings=UserSettings(user_id=1, currency="USD", snapshot_type="MONTLY"),
        plans=plans,
        actuals=[],
        accounts=accounts,
    )

    result = _run(AnalyticsService().get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is True
    assert len(result.snapshot_options) == 1
    only = result.snapshot_options[0]
    assert only.snapshot_key == CURRENT_KEY
    assert only.kind == "pending"

    block = result.plan_vs_actual[CURRENT_KEY]
    assert block.income.actual == 0
    assert block.expense.actual == 0
    assert block.capital.actual == 0
    assert block.income.plan == 3_000

    assert result.scenario.actual_total == 0
    assert result.scenario.ahead is False or result.scenario.gap <= 0


def test_only_closed_facts_returns_single_fact_option(patch_crud) -> None:
    accounts = [_account(MAIN_ACCOUNT_NAME, initial=2_000)]
    actuals = [_actual("2026-04", incomes={"Зарплата": 4_000}, expenses={"Аренда": 1_000})]
    patch_crud(
        settings=UserSettings(user_id=1, currency="EUR", snapshot_type="MONTLY"),
        plans=[],
        actuals=actuals,
        accounts=accounts,
    )

    result = _run(AnalyticsService().get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is True
    assert len(result.snapshot_options) == 1
    only = result.snapshot_options[0]
    assert only.snapshot_key == "2026-04"
    assert only.kind == "fact"
    assert only.hint == "закрыт 1 мая 2026"

    block = result.plan_vs_actual["2026-04"]
    assert block.income.plan == 0
    assert block.income.actual == 4_000
    assert block.income.note == "к мартовскому снапшоту"
    assert block.capital.plan == 0
    assert block.capital.actual == 4_000 - 1_000


def test_empty_user_returns_no_options_and_zero_scenario(patch_crud) -> None:
    patch_crud(settings=None, plans=[], actuals=[], accounts=[])

    result = _run(AnalyticsService().get_overview(session=object(), user_id=1, now=NOW))

    assert result.has_any_snapshot is False
    assert result.snapshot_options == []
    assert result.plan_vs_actual == {}
    assert len(result.scenario.points) == CHART_PAST_MONTHS
    assert all(p.actual is None for p in result.scenario.points)
    assert all(p.plan == 0 for p in result.scenario.points)
    assert result.scenario.plan_total == 0
    assert result.scenario.actual_total == 0
    assert result.scenario.gap == 0
    assert result.scenario.cross_month_label is None
