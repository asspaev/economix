"""Тесты HTTP-слоя аутентификации.

Проверяют, что эндпоинты входа и регистрации возвращают подписанный JWT
в теле ответа (для клиентского кеша) и в cookie ``access_token`` — и что
доменные исключения преобразуются в корректные HTTP-статусы.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import auth as auth_api
from app.core.dependencies import get_sql_session
from app.core.exceptions import InvalidCredentialsError, UsernameAlreadyTakenError
from app.main import app
from app.models.user import User


@pytest.fixture
def fake_session() -> object:
    """Заглушка асинхронной сессии — реальные запросы не выполняются."""
    return object()


@pytest.fixture
def client(fake_session: object) -> TestClient:
    """FastAPI TestClient с подменённой сессией БД."""

    async def _override_session() -> Any:
        yield fake_session

    app.dependency_overrides[get_sql_session] = _override_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _make_user(user_id: int = 1, username: str = "anna_v") -> User:
    user = User(username=username, password_hash="$2b$12$hash")
    user.user_id = user_id
    return user


def test_register_returns_token_and_user(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    user = _make_user()
    token = "jwt-test-token"
    register_mock = AsyncMock(return_value=(user, token))
    monkeypatch.setattr(auth_api.auth_service, "register", register_mock)

    response = client.post(
        "/api/v1/auth/register",
        json={"username": "anna_v", "password": "secret-pass"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload == {
        "access_token": token,
        "token_type": "bearer",
        "user": {"user_id": 1, "username": "anna_v"},
    }
    assert response.cookies.get("access_token") == token
    register_mock.assert_awaited_once()


def test_register_conflict_when_username_taken(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setattr(
        auth_api.auth_service,
        "register",
        AsyncMock(side_effect=UsernameAlreadyTakenError("anna_v")),
    )

    response = client.post(
        "/api/v1/auth/register",
        json={"username": "anna_v", "password": "secret-pass"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Username is already taken"
    assert response.cookies.get("access_token") is None


def test_login_returns_token_and_user(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    user = _make_user(user_id=7, username="boris")
    token = "jwt-test-token"
    login_mock = AsyncMock(return_value=(user, token))
    monkeypatch.setattr(auth_api.auth_service, "login", login_mock)

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "boris", "password": "secret-pass"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "access_token": token,
        "token_type": "bearer",
        "user": {"user_id": 7, "username": "boris"},
    }
    assert response.cookies.get("access_token") == token
    login_mock.assert_awaited_once()


def test_login_unauthorized_on_invalid_credentials(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setattr(
        auth_api.auth_service,
        "login",
        AsyncMock(side_effect=InvalidCredentialsError()),
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "boris", "password": "secret-pass"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"
    assert response.cookies.get("access_token") is None


def test_login_validation_error_for_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "boris", "password": "shrt"},
    )
    assert response.status_code == 422
