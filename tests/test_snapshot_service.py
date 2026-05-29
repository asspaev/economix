"""Тесты сервиса снапшотов.

Покрывают валидацию ключа периода, проверку существования имени
категории и поведение upsert поверх ин-мемори стабов CRUD-слоя.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import pytest

from app.core.exceptions import (
    InvalidSnapshotKeyError,
    UnknownCategoryInSnapshotError,
)
from app.crud import snapshot as snapshot_crud
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.models.user_category import UserCategory
from app.models.user_settings import UserSettings
from app.schemas.snapshot import SnapshotPayload
from app.services.snapshot import snapshots_service


class _FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.flushes = 0

    async def commit(self) -> None:
        self.commits += 1

    async def flush(self) -> None:
        self.flushes += 1


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _make_category(
    *,
    user_id: int = 1,
    category_id: int = 1,
    type_: str = "INCOME",
    name: str = "Зарплата",
) -> UserCategory:
    record = UserCategory(
        user_id=user_id,
        category_id=category_id,
        type=type_,
        name=name,
        initial_capital=None,
    )
    record.is_archived = False
    return record


@dataclass
class _FakeSnapshot:
    user_id: int
    snapshot_key: str
    incomes: dict[str, int] = field(default_factory=dict)
    expenses: dict[str, int] = field(default_factory=dict)
    savings_deposits: dict[str, int] = field(default_factory=dict)
    savings_withdrawals: dict[str, int] = field(default_factory=dict)


@pytest.fixture
def user_settings_store(monkeypatch: pytest.MonkeyPatch) -> dict[int, UserSettings]:
    store: dict[int, UserSettings] = {}

    async def fake_get(_session: Any, user_id: int) -> UserSettings | None:
        return store.get(user_id)

    monkeypatch.setattr(user_settings_crud, "get_by_user_id", fake_get)
    return store


@pytest.fixture
def categories(monkeypatch: pytest.MonkeyPatch) -> list[UserCategory]:
    items: list[UserCategory] = []

    async def fake_list_by_user(
        _session: Any,
        user_id: int,
        *,
        type_: str | None = None,
    ) -> list[UserCategory]:
        out = [c for c in items if c.user_id == user_id]
        if type_ is not None:
            out = [c for c in out if c.type == type_]
        return sorted(out, key=lambda c: c.category_id)

    monkeypatch.setattr(user_category_crud, "list_by_user", fake_list_by_user)
    return items


@pytest.fixture
def planned_store(monkeypatch: pytest.MonkeyPatch) -> list[_FakeSnapshot]:
    store: list[_FakeSnapshot] = []

    async def fake_list_planned(
        _session: Any,
        user_id: int,
        *,
        keys: Any = None,
    ) -> list[_FakeSnapshot]:
        out = [s for s in store if s.user_id == user_id]
        if keys is not None:
            keys_list = list(keys)
            out = [s for s in out if s.snapshot_key in keys_list]
        return sorted(out, key=lambda s: s.snapshot_key)

    async def fake_upsert_planned(
        _session: Any,
        *,
        user_id: int,
        snapshot_key: str,
        incomes: dict[str, int],
        expenses: dict[str, int],
        savings_deposits: dict[str, int],
        savings_withdrawals: dict[str, int],
    ) -> _FakeSnapshot:
        for s in store:
            if s.user_id == user_id and s.snapshot_key == snapshot_key:
                s.incomes = incomes
                s.expenses = expenses
                s.savings_deposits = savings_deposits
                s.savings_withdrawals = savings_withdrawals
                return s
        s = _FakeSnapshot(
            user_id=user_id,
            snapshot_key=snapshot_key,
            incomes=incomes,
            expenses=expenses,
            savings_deposits=savings_deposits,
            savings_withdrawals=savings_withdrawals,
        )
        store.append(s)
        return s

    monkeypatch.setattr(snapshot_crud, "list_planned", fake_list_planned)
    monkeypatch.setattr(snapshot_crud, "upsert_planned", fake_upsert_planned)
    return store


@pytest.fixture
def actual_store(monkeypatch: pytest.MonkeyPatch) -> list[_FakeSnapshot]:
    store: list[_FakeSnapshot] = []

    async def fake_list_actual(
        _session: Any,
        user_id: int,
        *,
        keys: Any = None,
    ) -> list[_FakeSnapshot]:
        out = [s for s in store if s.user_id == user_id]
        if keys is not None:
            keys_list = list(keys)
            out = [s for s in out if s.snapshot_key in keys_list]
        return sorted(out, key=lambda s: s.snapshot_key)

    async def fake_upsert_actual(
        _session: Any,
        *,
        user_id: int,
        snapshot_key: str,
        incomes: dict[str, int],
        expenses: dict[str, int],
        savings_deposits: dict[str, int],
        savings_withdrawals: dict[str, int],
    ) -> _FakeSnapshot:
        for s in store:
            if s.user_id == user_id and s.snapshot_key == snapshot_key:
                s.incomes = incomes
                s.expenses = expenses
                s.savings_deposits = savings_deposits
                s.savings_withdrawals = savings_withdrawals
                return s
        s = _FakeSnapshot(
            user_id=user_id,
            snapshot_key=snapshot_key,
            incomes=incomes,
            expenses=expenses,
            savings_deposits=savings_deposits,
            savings_withdrawals=savings_withdrawals,
        )
        store.append(s)
        return s

    monkeypatch.setattr(snapshot_crud, "list_actual", fake_list_actual)
    monkeypatch.setattr(snapshot_crud, "upsert_actual", fake_upsert_actual)
    return store


def test_list_for_user_returns_planned_and_actual(
    planned_store: list[_FakeSnapshot],
    actual_store: list[_FakeSnapshot],
    user_settings_store: dict[int, UserSettings],
) -> None:
    planned_store.extend(
        [
            _FakeSnapshot(user_id=1, snapshot_key="2026-02", incomes={"Зарплата": 100}),
            _FakeSnapshot(user_id=1, snapshot_key="2026-01", incomes={"Зарплата": 200}),
            _FakeSnapshot(user_id=99, snapshot_key="2026-03"),  # чужой
        ]
    )
    actual_store.extend(
        [
            _FakeSnapshot(user_id=1, snapshot_key="2026-01", expenses={"Жильё": 50}),
        ]
    )
    user_settings_store[1] = UserSettings(
        user_id=1,
        currency="RUB",
        snapshot_type="MONTLY",
    )

    session = _FakeSession()
    out = _run(snapshots_service.list_for_user(session, 1))

    assert [s.snapshot_key for s in out.planned] == ["2026-01", "2026-02"]
    assert out.planned[0].incomes == {"Зарплата": 200}
    assert out.planned[1].incomes == {"Зарплата": 100}
    assert [s.snapshot_key for s in out.actual] == ["2026-01"]
    assert out.actual[0].expenses == {"Жильё": 50}
    assert out.currency == "RUB"


def test_list_for_user_defaults_currency_when_settings_missing(
    planned_store: list[_FakeSnapshot],
    actual_store: list[_FakeSnapshot],
    user_settings_store: dict[int, UserSettings],
) -> None:
    del planned_store, actual_store, user_settings_store  # пустые стабы
    session = _FakeSession()
    out = _run(snapshots_service.list_for_user(session, 1))
    assert out.currency == "USD"


@pytest.mark.parametrize("bad_key", ["2026-13", "26-01", "2026/01", "abc", "2026-1", ""])
def test_upsert_rejects_invalid_snapshot_key(
    planned_store: list[_FakeSnapshot],
    bad_key: str,
) -> None:
    session = _FakeSession()
    with pytest.raises(InvalidSnapshotKeyError):
        _run(
            snapshots_service.upsert_planned(
                session,
                1,
                bad_key,
                SnapshotPayload(),
            )
        )


def test_upsert_planned_creates_and_normalizes_keys(
    categories: list[UserCategory],
    planned_store: list[_FakeSnapshot],
) -> None:
    categories.extend(
        [
            _make_category(category_id=1, type_="INCOME", name="Зарплата"),
            _make_category(category_id=2, type_="EXPENSE", name="Жильё"),
            _make_category(category_id=3, type_="ACCOUNT", name="Основной счёт"),
        ]
    )
    session = _FakeSession()

    out = _run(
        snapshots_service.upsert_planned(
            session,
            1,
            "2026-05",
            SnapshotPayload(
                incomes={"Зарплата": 4000},
                expenses={"Жильё": 1500},
                savings_deposits={"Основной счёт": 200},
                savings_withdrawals={},
            ),
        )
    )

    assert out.snapshot_key == "2026-05"
    assert out.incomes == {"Зарплата": 4000}
    assert out.savings_deposits == {"Основной счёт": 200}
    assert session.commits == 1
    stored = planned_store[0]
    assert stored.incomes == {"Зарплата": 4000}
    assert stored.savings_deposits == {"Основной счёт": 200}


def test_upsert_planned_overwrites_existing(
    categories: list[UserCategory],
    planned_store: list[_FakeSnapshot],
) -> None:
    categories.append(_make_category(category_id=1, type_="INCOME", name="Зарплата"))
    planned_store.append(
        _FakeSnapshot(user_id=1, snapshot_key="2026-05", incomes={"Зарплата": 100}),
    )
    session = _FakeSession()

    out = _run(
        snapshots_service.upsert_planned(
            session,
            1,
            "2026-05",
            SnapshotPayload(incomes={"Зарплата": 999}),
        )
    )

    assert out.incomes == {"Зарплата": 999}
    assert len(planned_store) == 1
    assert planned_store[0].incomes == {"Зарплата": 999}


def test_upsert_actual_rejects_unknown_category(
    categories: list[UserCategory],
    actual_store: list[_FakeSnapshot],
) -> None:
    categories.append(_make_category(category_id=1, type_="INCOME", name="Зарплата"))
    session = _FakeSession()

    with pytest.raises(UnknownCategoryInSnapshotError) as exc_info:
        _run(
            snapshots_service.upsert_actual(
                session,
                1,
                "2026-05",
                SnapshotPayload(incomes={"Зарплата": 100, "Неизвестная": 50}),
            )
        )
    assert exc_info.value.category_names == ["Неизвестная"]
    assert actual_store == []


def test_upsert_actual_accepts_empty_payload(
    categories: list[UserCategory],
    actual_store: list[_FakeSnapshot],
) -> None:
    session = _FakeSession()
    out = _run(
        snapshots_service.upsert_actual(
            session,
            1,
            "2026-05",
            SnapshotPayload(),
        )
    )
    assert out.snapshot_key == "2026-05"
    assert out.incomes == {}
    assert session.commits == 1
