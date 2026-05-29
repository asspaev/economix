"""Тесты сервиса категорий.

Покрывают валидации (типы, владелец, дубль имён, запрет на изменение
архивных записей) поверх ин-мемори стабов CRUD-слоя.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.core.exceptions import (
    ArchivedCategoryError,
    CategoryNotFoundError,
    DuplicateCategoryNameError,
    InvalidCategoryTypeError,
)
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.models.user_category import UserCategory
from app.models.user_settings import UserSettings
from app.services.categories import categories_service


class _FakeSession:
    """Минимальная заглушка ``AsyncSession``: считает commit/flush."""

    def __init__(self) -> None:
        self.commits = 0
        self.flushes = 0

    async def commit(self) -> None:
        self.commits += 1

    async def flush(self) -> None:
        self.flushes += 1


def _make_category(
    *,
    user_id: int = 1,
    category_id: int = 1,
    type_: str = "EXPENSE",
    name: str = "Жильё",
    initial_capital: int | None = None,
    is_archived: bool = False,
) -> UserCategory:
    record = UserCategory(
        user_id=user_id,
        category_id=category_id,
        type=type_,
        name=name,
        initial_capital=initial_capital,
    )
    record.is_archived = is_archived
    return record


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


@pytest.fixture
def user_settings_store(monkeypatch: pytest.MonkeyPatch) -> dict[int, UserSettings]:
    """Подменяет CRUD-функцию настроек ин-мемори словарём."""

    store: dict[int, UserSettings] = {}

    async def fake_get(_session: Any, user_id: int) -> UserSettings | None:
        return store.get(user_id)

    monkeypatch.setattr(user_settings_crud, "get_by_user_id", fake_get)
    return store


@pytest.fixture
def storage(monkeypatch: pytest.MonkeyPatch) -> list[UserCategory]:
    """Подменяет CRUD-функции работой над списком в памяти."""

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

    async def fake_get_by_id(
        _session: Any,
        user_id: int,
        category_id: int,
    ) -> UserCategory | None:
        for c in items:
            if c.user_id == user_id and c.category_id == category_id:
                return c
        return None

    async def fake_find_by_name(
        _session: Any,
        user_id: int,
        *,
        type_: str,
        name: str,
    ) -> UserCategory | None:
        for c in items:
            if c.user_id == user_id and c.type == type_ and c.name == name:
                return c
        return None

    async def fake_create_one(
        _session: Any,
        *,
        user_id: int,
        type_: str,
        name: str,
        initial_capital: int | None = None,
    ) -> UserCategory:
        max_id = max(
            (c.category_id for c in items if c.user_id == user_id),
            default=0,
        )
        record = _make_category(
            user_id=user_id,
            category_id=max_id + 1,
            type_=type_,
            name=name,
            initial_capital=initial_capital,
        )
        items.append(record)
        return record

    async def fake_update_fields(
        _session: Any,
        record: UserCategory,
        *,
        name: str | None = None,
        initial_capital: int | None = None,
        initial_capital_set: bool = False,
    ) -> UserCategory:
        if name is not None:
            record.name = name
        if initial_capital_set:
            record.initial_capital = initial_capital
        return record

    async def fake_set_archived(
        _session: Any,
        record: UserCategory,
        *,
        is_archived: bool,
    ) -> UserCategory:
        record.is_archived = is_archived
        return record

    monkeypatch.setattr(user_category_crud, "list_by_user", fake_list_by_user)
    monkeypatch.setattr(user_category_crud, "get_by_id", fake_get_by_id)
    monkeypatch.setattr(user_category_crud, "find_by_name", fake_find_by_name)
    monkeypatch.setattr(user_category_crud, "create_one", fake_create_one)
    monkeypatch.setattr(user_category_crud, "update_fields", fake_update_fields)
    monkeypatch.setattr(user_category_crud, "set_archived", fake_set_archived)

    return items


def test_list_filters_by_type_and_validates_type(
    storage: list[UserCategory],
    user_settings_store: dict[int, UserSettings],
) -> None:
    storage.extend(
        [
            _make_category(category_id=1, type_="INCOME", name="Зарплата"),
            _make_category(category_id=2, type_="EXPENSE", name="Жильё"),
        ]
    )
    user_settings_store[1] = UserSettings(
        user_id=1,
        currency="RUB",
        snapshot_type="MONTLY",
    )

    session = _FakeSession()
    result = _run(categories_service.list_for_user(session, 1, type_="INCOME"))
    assert [c.name for c in result.items] == ["Зарплата"]
    assert result.currency == "RUB"

    with pytest.raises(InvalidCategoryTypeError):
        _run(categories_service.list_for_user(session, 1, type_="UNKNOWN"))


def test_list_defaults_currency_when_settings_missing(
    storage: list[UserCategory],
    user_settings_store: dict[int, UserSettings],
) -> None:
    storage.append(_make_category(category_id=1, type_="INCOME", name="Зарплата"))
    del user_settings_store  # стаб настроек умышленно пуст

    session = _FakeSession()
    result = _run(categories_service.list_for_user(session, 1))

    assert [c.name for c in result.items] == ["Зарплата"]
    assert result.currency == "USD"


def test_create_assigns_next_id_and_commits(
    storage: list[UserCategory],
) -> None:
    storage.append(_make_category(category_id=3, type_="INCOME", name="Зарплата"))
    session = _FakeSession()

    created = _run(
        categories_service.create(
            session,
            1,
            type_="EXPENSE",
            name="  Жильё  ",
            initial_capital=None,
        )
    )

    assert created.category_id == 4
    assert created.name == "Жильё"
    assert created.initial_capital is None
    assert session.commits == 1


def test_create_keeps_initial_capital_only_for_accounts(
    storage: list[UserCategory],
) -> None:
    session = _FakeSession()

    account = _run(
        categories_service.create(
            session,
            1,
            type_="ACCOUNT",
            name="Накопительный",
            initial_capital=5000,
        )
    )
    income = _run(
        categories_service.create(
            session,
            1,
            type_="INCOME",
            name="Зарплата",
            initial_capital=9999,
        )
    )

    assert account.initial_capital == 5000
    assert income.initial_capital is None


def test_create_rejects_unknown_type(storage: list[UserCategory]) -> None:
    session = _FakeSession()
    with pytest.raises(InvalidCategoryTypeError):
        _run(
            categories_service.create(
                session,
                1,
                type_="BOGUS",
                name="Что-то",
                initial_capital=None,
            )
        )


def test_create_rejects_duplicate_name_within_type(
    storage: list[UserCategory],
) -> None:
    storage.append(_make_category(category_id=1, type_="INCOME", name="Зарплата"))
    session = _FakeSession()

    with pytest.raises(DuplicateCategoryNameError):
        _run(
            categories_service.create(
                session,
                1,
                type_="INCOME",
                name="Зарплата",
                initial_capital=None,
            )
        )

    # Тот же `name` другого типа — допустим.
    other = _run(
        categories_service.create(
            session,
            1,
            type_="EXPENSE",
            name="Зарплата",
            initial_capital=None,
        )
    )
    assert other.type == "EXPENSE"


def test_update_rejects_foreign_category(
    storage: list[UserCategory],
) -> None:
    storage.append(
        _make_category(user_id=99, category_id=1, type_="INCOME", name="Чужая"),
    )
    session = _FakeSession()

    with pytest.raises(CategoryNotFoundError):
        _run(
            categories_service.update(
                session,
                1,
                1,
                name="Хак",
                initial_capital=None,
                initial_capital_set=False,
            )
        )


def test_update_rejects_archived(
    storage: list[UserCategory],
) -> None:
    storage.append(
        _make_category(category_id=1, type_="EXPENSE", name="Старое", is_archived=True),
    )
    session = _FakeSession()

    with pytest.raises(ArchivedCategoryError):
        _run(
            categories_service.update(
                session,
                1,
                1,
                name="Новое",
                initial_capital=None,
                initial_capital_set=False,
            )
        )


def test_update_rejects_duplicate_name(
    storage: list[UserCategory],
) -> None:
    storage.extend(
        [
            _make_category(category_id=1, type_="EXPENSE", name="Еда"),
            _make_category(category_id=2, type_="EXPENSE", name="Жильё"),
        ]
    )
    session = _FakeSession()

    with pytest.raises(DuplicateCategoryNameError):
        _run(
            categories_service.update(
                session,
                1,
                2,
                name="Еда",
                initial_capital=None,
                initial_capital_set=False,
            )
        )


def test_update_applies_initial_capital_only_for_accounts(
    storage: list[UserCategory],
) -> None:
    storage.extend(
        [
            _make_category(
                category_id=1,
                type_="ACCOUNT",
                name="Накопительный",
                initial_capital=100,
            ),
            _make_category(category_id=2, type_="INCOME", name="Зарплата"),
        ]
    )
    session = _FakeSession()

    account = _run(
        categories_service.update(
            session,
            1,
            1,
            name=None,
            initial_capital=2500,
            initial_capital_set=True,
        )
    )
    assert account.initial_capital == 2500

    income = _run(
        categories_service.update(
            session,
            1,
            2,
            name="Зарплата+",
            initial_capital=9999,
            initial_capital_set=True,
        )
    )
    assert income.name == "Зарплата+"
    assert income.initial_capital is None  # игнорируется для не-счетов


def test_set_archived_toggles_flag(storage: list[UserCategory]) -> None:
    storage.append(_make_category(category_id=1, type_="EXPENSE", name="Кафе"))
    session = _FakeSession()

    updated = _run(
        categories_service.set_archived(session, 1, 1, is_archived=True),
    )
    assert updated.is_archived is True

    restored = _run(
        categories_service.set_archived(session, 1, 1, is_archived=False),
    )
    assert restored.is_archived is False


def test_set_archived_rejects_foreign_category(
    storage: list[UserCategory],
) -> None:
    storage.append(
        _make_category(user_id=99, category_id=1, type_="EXPENSE", name="Чужая"),
    )
    session = _FakeSession()
    with pytest.raises(CategoryNotFoundError):
        _run(categories_service.set_archived(session, 1, 1, is_archived=True))
