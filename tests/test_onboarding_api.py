"""Тесты HTTP-слоя онбординга.

Покрывают извлечение состояния из Redis, его частичное обновление и
успешное завершение онбординга с выпуском нового JWT. Сервис и Redis
подменяются заглушками — реальные взаимодействия с БД и Redis
не выполняются.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from jwt.exceptions import InvalidTokenError

from app.api.v1 import onboarding as onboarding_api
from app.core.dependencies import get_redis, get_sql_session
from app.core.exceptions import (
    OnboardingAlreadyCompletedError,
    OnboardingIncompleteError,
)
from app.main import app
from app.models.user import User
from app.services.jwt import jwt_service


@pytest.fixture
def auth_token(monkeypatch: pytest.MonkeyPatch) -> str:
    """Подмена ``jwt_service.decode_token`` для прохода через middleware."""

    def fake_decode(token: str) -> dict[str, Any]:
        if token == "test-token":
            return {"sub": "42"}
        raise InvalidTokenError("invalid")

    monkeypatch.setattr(jwt_service, "decode_token", fake_decode)
    return "test-token"


@pytest.fixture
def client() -> TestClient:
    """FastAPI TestClient с подменёнными зависимостями БД и Redis."""

    async def _override_session() -> Any:
        yield object()

    async def _override_redis() -> Any:
        return object()

    app.dependency_overrides[get_sql_session] = _override_session
    app.dependency_overrides[get_redis] = _override_redis
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_get_state_returns_redis_payload(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        onboarding_api.onboarding_service,
        "get_state",
        AsyncMock(return_value={"currency": "RUB"}),
    )

    response = client.get("/api/v1/onboarding/state", headers=_auth_headers(auth_token))

    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "RUB"
    assert body["snapshot_type"] is None


def test_patch_state_merges_into_redis(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    patch_mock = AsyncMock(
        return_value={
            "currency": "RUB",
            "snapshot_type": "MONTLY",
        }
    )
    monkeypatch.setattr(onboarding_api.onboarding_service, "patch_state", patch_mock)

    response = client.patch(
        "/api/v1/onboarding/state",
        headers=_auth_headers(auth_token),
        json={"snapshot_type": "MONTLY"},
    )

    assert response.status_code == 200
    assert response.json()["snapshot_type"] == "MONTLY"
    patch_mock.assert_awaited_once()
    args, _kwargs = patch_mock.call_args
    assert args[1] == 42
    assert args[2] == {"snapshot_type": "MONTLY"}


def test_patch_state_validates_currency(
    client: TestClient,
    auth_token: str,
) -> None:
    response = client.patch(
        "/api/v1/onboarding/state",
        headers=_auth_headers(auth_token),
        json={"currency": "GBP"},
    )
    assert response.status_code == 422


def test_complete_returns_new_token_and_clears_cookie(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    new_token = "new-token"
    monkeypatch.setattr(
        onboarding_api.onboarding_service,
        "complete",
        AsyncMock(return_value=new_token),
    )
    user = User(username="anna", password_hash="$2b$12$hash")
    user.user_id = 42
    monkeypatch.setattr(
        onboarding_api.user_crud,
        "get_by_id",
        AsyncMock(return_value=user),
    )

    response = client.post(
        "/api/v1/onboarding/complete",
        headers=_auth_headers(auth_token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "access_token": new_token,
        "token_type": "bearer",
        "user": {"user_id": 42, "username": "anna"},
    }
    assert response.cookies.get("access_token") == new_token


def test_complete_conflict_when_already_done(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        onboarding_api.onboarding_service,
        "complete",
        AsyncMock(side_effect=OnboardingAlreadyCompletedError()),
    )

    response = client.post(
        "/api/v1/onboarding/complete",
        headers=_auth_headers(auth_token),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Onboarding is already completed"


def test_complete_bad_request_when_incomplete(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    monkeypatch.setattr(
        onboarding_api.onboarding_service,
        "complete",
        AsyncMock(side_effect=OnboardingIncompleteError(["currency", "snapshot_type"])),
    )

    response = client.post(
        "/api/v1/onboarding/complete",
        headers=_auth_headers(auth_token),
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["missing"] == ["currency", "snapshot_type"]


def test_onboarding_state_requires_auth(client: TestClient) -> None:
    response = client.get("/api/v1/onboarding/state")
    assert response.status_code == 401
