"""Тесты HTTP-слоя страницы «Снапшоты».

Покрывают защиту middleware-аутентификации, маршруты и преобразование
доменных исключений в HTTP-коды. Сервис подменяется заглушкой —
реальной работы с БД нет.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from jwt.exceptions import InvalidTokenError

from app.api.v1 import snapshots as snapshots_api
from app.core.dependencies import get_sql_session
from app.core.exceptions import (
    InvalidSnapshotKeyError,
    UnknownCategoryInSnapshotError,
)
from app.main import app
from app.schemas.snapshot import SnapshotRead, SnapshotsList
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


def test_snapshots_endpoint_requires_auth(client: TestClient) -> None:
    response = client.get("/api/v1/snapshots")
    assert response.status_code == 401


def test_list_snapshots_returns_collection(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    collection = SnapshotsList(
        planned=[
            SnapshotRead(
                snapshot_key="2026-01",
                incomes={"Зарплата": 100},
                expenses={"Жильё": 50},
                savings_deposits={},
                savings_withdrawals={},
            ),
        ],
        actual=[],
        currency="RUB",
    )
    list_mock = AsyncMock(return_value=collection)
    monkeypatch.setattr(snapshots_api.snapshots_service, "list_for_user", list_mock)

    response = client.get("/api/v1/snapshots", headers=_auth_headers(auth_token))

    assert response.status_code == 200
    body = response.json()
    assert body["actual"] == []
    assert body["currency"] == "RUB"
    assert body["planned"][0]["snapshot_key"] == "2026-01"
    assert body["planned"][0]["incomes"] == {"Зарплата": 100}

    list_mock.assert_awaited_once()
    _, called_user_id = list_mock.call_args.args
    assert called_user_id == 42


def test_upsert_planned_returns_record(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    saved = SnapshotRead(
        snapshot_key="2026-05",
        incomes={"Зарплата": 4000},
        expenses={},
        savings_deposits={"Основной счёт": 200},
        savings_withdrawals={},
    )
    upsert_mock = AsyncMock(return_value=saved)
    monkeypatch.setattr(snapshots_api.snapshots_service, "upsert_planned", upsert_mock)

    response = client.put(
        "/api/v1/snapshots/planned/2026-05",
        headers=_auth_headers(auth_token),
        json={
            "incomes": {"Зарплата": 4000},
            "expenses": {},
            "savings_deposits": {"Основной счёт": 200},
            "savings_withdrawals": {},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["snapshot_key"] == "2026-05"
    assert body["incomes"] == {"Зарплата": 4000}
    upsert_mock.assert_awaited_once()
    _, called_user_id, called_key, called_payload = upsert_mock.call_args.args
    assert called_user_id == 42
    assert called_key == "2026-05"
    assert called_payload.incomes == {"Зарплата": 4000}
    assert called_payload.savings_deposits == {"Основной счёт": 200}


def test_upsert_planned_400_on_invalid_key(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        snapshots_api.snapshots_service,
        "upsert_planned",
        AsyncMock(side_effect=InvalidSnapshotKeyError("2026-13")),
    )
    response = client.put(
        "/api/v1/snapshots/planned/2026-13",
        headers=_auth_headers(auth_token),
        json={},
    )
    assert response.status_code == 400


def test_upsert_actual_404_on_unknown_category(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        snapshots_api.snapshots_service,
        "upsert_actual",
        AsyncMock(side_effect=UnknownCategoryInSnapshotError(["Неизвестная"])),
    )
    response = client.put(
        "/api/v1/snapshots/actual/2026-05",
        headers=_auth_headers(auth_token),
        json={"incomes": {"Неизвестная": 100}},
    )
    assert response.status_code == 404


def test_upsert_actual_returns_record(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    saved = SnapshotRead(
        snapshot_key="2026-05",
        incomes={},
        expenses={"Жильё": 700},
        savings_deposits={},
        savings_withdrawals={},
    )
    upsert_mock = AsyncMock(return_value=saved)
    monkeypatch.setattr(snapshots_api.snapshots_service, "upsert_actual", upsert_mock)

    response = client.put(
        "/api/v1/snapshots/actual/2026-05",
        headers=_auth_headers(auth_token),
        json={"expenses": {"Жильё": 700}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["expenses"] == {"Жильё": 700}
    upsert_mock.assert_awaited_once()
