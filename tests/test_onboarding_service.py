"""Тесты сервиса онбординга.

Покрывают валидацию состояния в Redis и формирование ключа снапшота.
Логика взаимодействия с БД (создание UserSettings, UserCategory,
PlannedSnapshot) проверяется на уровне HTTP в ``test_onboarding_api``.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.core.exceptions import OnboardingIncompleteError
from app.services.onboarding import (
    MOSCOW_TZ,
    REQUIRED_FIELDS,
    _validate_state,
    build_snapshot_key,
)


def _full_state() -> dict[str, object]:
    return {
        "currency": "RUB",
        "snapshot_type": "MONTLY",
        "income_categories": ["Зарплата"],
        "expense_categories": ["Аренда"],
        "accounts": ["Основной счёт"],
        "initial_capital": {"Основной счёт": 1000},
        "initial_snapshot": {
            "incomes": {"Зарплата": 1000},
            "expenses": {"Аренда": 500},
            "savings_deposits": {},
            "savings_withdrawals": {},
        },
    }


def test_validate_state_passes_for_complete_state() -> None:
    _validate_state(_full_state())


@pytest.mark.parametrize("field", REQUIRED_FIELDS)
def test_validate_state_flags_missing_field(field: str) -> None:
    state = _full_state()
    del state[field]
    with pytest.raises(OnboardingIncompleteError) as exc:
        _validate_state(state)
    assert field in exc.value.missing


def test_validate_state_flags_empty_list_and_dict() -> None:
    state = _full_state()
    state["income_categories"] = []
    state["initial_capital"] = {}
    with pytest.raises(OnboardingIncompleteError) as exc:
        _validate_state(state)
    assert "income_categories" in exc.value.missing
    assert "initial_capital" in exc.value.missing


def test_build_snapshot_key_monthly() -> None:
    moment = datetime(2026, 6, 14, 12, 0, tzinfo=MOSCOW_TZ)
    assert build_snapshot_key("MONTLY", now=moment) == "2026-06"


def test_build_snapshot_key_weekly_uses_iso_week() -> None:
    moment = datetime(2026, 1, 5, 12, 0, tzinfo=MOSCOW_TZ)
    assert build_snapshot_key("WEEKLY", now=moment) == "2026-W02"


def test_build_snapshot_key_defaults_to_now_in_moscow() -> None:
    key = build_snapshot_key("MONTLY")
    now_msk = datetime.now(timezone.utc).astimezone(MOSCOW_TZ)
    assert key == now_msk.strftime("%Y-%m")
