"""Тесты HTTP-слоя страницы «Категории».

Покрывают защиту middleware-аутентификации, валидации ручек и
преобразование доменных исключений в HTTP-коды. Сервис подменяется
заглушкой — реальной работы с БД нет.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from jwt.exceptions import InvalidTokenError

from app.api.v1 import categories as categories_api
from app.core.dependencies import get_sql_session
from app.core.exceptions import (
    ArchivedCategoryError,
    CategoryNotFoundError,
    DuplicateCategoryNameError,
    InvalidCategoryTypeError,
)
from app.main import app
from app.models.user_category import UserCategory
from app.schemas.categories import CategoriesList, CategoryRead
from app.services.jwt import jwt_service


@pytest.fixture
def auth_token(monkeypatch: pytest.MonkeyPatch) -> str:
    def fake_decode(token: str) -> dict[str, Any]:
        if token == "test-token":
            return {"sub": "42"}
        raise InvalidTokenError("invalid")

    monkeypatch.setattr(jwt_service, "decode_token", fake_decode)
    return "test-token"


@pytest.fixture
def client() -> TestClient:
    async def _override_session() -> Any:
        yield object()

    app.dependency_overrides[get_sql_session] = _override_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_record(
    *,
    user_id: int = 42,
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


def test_categories_endpoint_requires_auth(client: TestClient) -> None:
    response = client.get("/api/v1/categories")
    assert response.status_code == 401


def test_list_categories_returns_records(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    collection = CategoriesList(
        items=[
            CategoryRead.model_validate(
                _make_record(category_id=1, type_="INCOME", name="Зарплата"),
            ),
            CategoryRead.model_validate(
                _make_record(category_id=2, type_="EXPENSE", name="Жильё"),
            ),
        ],
        currency="RUB",
    )
    list_mock = AsyncMock(return_value=collection)
    monkeypatch.setattr(categories_api.categories_service, "list_for_user", list_mock)

    response = client.get(
        "/api/v1/categories",
        headers=_auth_headers(auth_token),
        params={"type": "INCOME"},
    )

    assert response.status_code == 200
    data = response.json()
    assert [c["name"] for c in data["items"]] == ["Зарплата", "Жильё"]
    assert data["items"][0]["type"] == "INCOME"
    assert data["items"][0]["is_archived"] is False
    assert data["currency"] == "RUB"

    list_mock.assert_awaited_once()
    _, called_user_id = list_mock.call_args.args
    assert called_user_id == 42
    assert list_mock.call_args.kwargs == {"type_": "INCOME"}


def test_list_categories_rejects_invalid_type(
    client: TestClient,
    auth_token: str,
) -> None:
    response = client.get(
        "/api/v1/categories",
        headers=_auth_headers(auth_token),
        params={"type": "BOGUS"},
    )
    assert response.status_code == 422


def test_create_category_returns_created_record(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    created = _make_record(category_id=5, type_="ACCOUNT", name="Накопительный", initial_capital=1000)
    create_mock = AsyncMock(return_value=created)
    monkeypatch.setattr(categories_api.categories_service, "create", create_mock)

    response = client.post(
        "/api/v1/categories",
        headers=_auth_headers(auth_token),
        json={"type": "ACCOUNT", "name": "Накопительный", "initial_capital": 1000},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["category_id"] == 5
    assert body["initial_capital"] == 1000


def test_create_category_conflict_on_duplicate(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        categories_api.categories_service,
        "create",
        AsyncMock(side_effect=DuplicateCategoryNameError("Зарплата")),
    )

    response = client.post(
        "/api/v1/categories",
        headers=_auth_headers(auth_token),
        json={"type": "INCOME", "name": "Зарплата"},
    )

    assert response.status_code == 409


def test_create_category_invalid_type_via_service(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    # Pydantic-схема ограничивает тип на уровне ввода, поэтому такой
    # путь возможен лишь при будущих расширениях. Проверяем явное
    # преобразование исключения в 400.
    monkeypatch.setattr(
        categories_api.categories_service,
        "create",
        AsyncMock(side_effect=InvalidCategoryTypeError("BOGUS")),
    )

    response = client.post(
        "/api/v1/categories",
        headers=_auth_headers(auth_token),
        json={"type": "INCOME", "name": "Зарплата"},
    )

    assert response.status_code == 400


def test_update_category_returns_updated(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    updated = _make_record(category_id=2, type_="EXPENSE", name="Жильё+")
    update_mock = AsyncMock(return_value=updated)
    monkeypatch.setattr(categories_api.categories_service, "update", update_mock)

    response = client.patch(
        "/api/v1/categories/2",
        headers=_auth_headers(auth_token),
        json={"name": "Жильё+"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Жильё+"
    update_mock.assert_awaited_once()
    _, called_user_id, called_category_id = update_mock.call_args.args
    assert called_user_id == 42
    assert called_category_id == 2
    assert update_mock.call_args.kwargs == {
        "name": "Жильё+",
        "initial_capital": None,
        "initial_capital_set": False,
    }


def test_update_category_404_for_foreign(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        categories_api.categories_service,
        "update",
        AsyncMock(side_effect=CategoryNotFoundError(2)),
    )

    response = client.patch(
        "/api/v1/categories/2",
        headers=_auth_headers(auth_token),
        json={"name": "Хак"},
    )

    assert response.status_code == 404


def test_update_category_400_when_archived(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        categories_api.categories_service,
        "update",
        AsyncMock(side_effect=ArchivedCategoryError(2)),
    )

    response = client.patch(
        "/api/v1/categories/2",
        headers=_auth_headers(auth_token),
        json={"name": "Новое"},
    )

    assert response.status_code == 400


def test_update_category_409_on_duplicate(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        categories_api.categories_service,
        "update",
        AsyncMock(side_effect=DuplicateCategoryNameError("Жильё")),
    )

    response = client.patch(
        "/api/v1/categories/2",
        headers=_auth_headers(auth_token),
        json={"name": "Жильё"},
    )

    assert response.status_code == 409


def test_archive_category_returns_updated(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    record = _make_record(category_id=3, type_="EXPENSE", name="Кафе", is_archived=True)
    archive_mock = AsyncMock(return_value=record)
    monkeypatch.setattr(categories_api.categories_service, "set_archived", archive_mock)

    response = client.patch(
        "/api/v1/categories/3/archive",
        headers=_auth_headers(auth_token),
        json={"is_archived": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["is_archived"] is True
    archive_mock.assert_awaited_once()
    assert archive_mock.call_args.kwargs == {"is_archived": True}


def test_archive_category_404(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        categories_api.categories_service,
        "set_archived",
        AsyncMock(side_effect=CategoryNotFoundError(3)),
    )

    response = client.patch(
        "/api/v1/categories/3/archive",
        headers=_auth_headers(auth_token),
        json={"is_archived": True},
    )

    assert response.status_code == 404
