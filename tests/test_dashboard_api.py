"""Тесты HTTP-слоя страницы «Обзор».

Проверяют, что эндпоинт ``GET /api/v1/dashboard/overview`` требует
валидного JWT (401 без токена), возвращает 200 с корректным
``response_model`` и форму ответа фронтенд может потреблять без
дополнительной обработки.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from jwt.exceptions import InvalidTokenError

from app.api.v1 import dashboard as dashboard_api
from app.core.dependencies import get_sql_session
from app.main import app
from app.schemas.dashboard import (
    AccountSummary,
    CapitalChartPoint,
    CapitalSummary,
    CategoryAmount,
    DashboardOverviewResponse,
    ExpectedBlock,
    NowExpected,
    RecentSnapshot,
)
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


def _full_response() -> DashboardOverviewResponse:
    return DashboardOverviewResponse(
        has_any_snapshot=True,
        has_current_plan=True,
        current_snapshot_key="2026-05",
        current_month_label="Май 2026",
        currency="RUB",
        capital=CapitalSummary(
            net_capital=NowExpected(now=46_820, expected=48_720),
            main_account=AccountSummary(name="Основной счёт", now=7_950, expected=8_200),
            savings_accounts=[
                AccountSummary(name="Накопительный", now=22_400, expected=23_200),
            ],
        ),
        capital_chart=[
            CapitalChartPoint(month_key="2026-05", label="Май", plan=48_000, actual=46_820),
        ],
        expected_income=ExpectedBlock(
            total=5_840,
            subs=[CategoryAmount(name="Зарплата", value=4_200)],
        ),
        expected_expense=ExpectedBlock(
            total=3_520,
            subs=[CategoryAmount(name="Аренда", value=1_450)],
        ),
        recent_snapshots=[
            RecentSnapshot(
                snapshot_key="2026-05",
                year=2026,
                month=5,
                month_name="Май",
                label="Май 2026",
                status="current",
                has_plan=True,
                has_actual=False,
                planned_income=5_840,
                planned_expense=3_520,
                planned_capital=48_720,
                actual_income=None,
                actual_expense=None,
                actual_capital=None,
            ),
        ],
    )


def test_overview_requires_auth(client: TestClient) -> None:
    response = client.get("/api/v1/dashboard/overview")
    assert response.status_code == 401


def test_overview_returns_aggregated_payload(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    payload = _full_response()
    service_mock = AsyncMock(return_value=payload)
    monkeypatch.setattr(dashboard_api.dashboard_service, "get_overview", service_mock)

    response = client.get(
        "/api/v1/dashboard/overview",
        headers=_auth_headers(auth_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["has_any_snapshot"] is True
    assert data["has_current_plan"] is True
    assert data["current_snapshot_key"] == "2026-05"
    assert data["current_month_label"] == "Май 2026"
    assert data["currency"] == "RUB"
    assert data["capital"]["net_capital"] == {"now": 46_820, "expected": 48_720}
    assert data["capital"]["main_account"]["name"] == "Основной счёт"
    assert data["capital"]["savings_accounts"][0]["now"] == 22_400
    assert data["capital_chart"][0]["label"] == "Май"
    assert data["expected_income"]["total"] == 5_840
    assert data["expected_income"]["subs"][0] == {"name": "Зарплата", "value": 4_200}
    assert data["expected_expense"]["total"] == 3_520
    assert data["recent_snapshots"][0]["status"] == "current"
    assert data["recent_snapshots"][0]["month_name"] == "Май"
    assert data["recent_snapshots"][0]["planned_capital"] == 48_720

    service_mock.assert_awaited_once()
    _session, called_user_id = service_mock.call_args.args
    assert called_user_id == 42


def test_overview_empty_user_returns_flags(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    empty = DashboardOverviewResponse(
        has_any_snapshot=False,
        has_current_plan=False,
        current_snapshot_key="2026-05",
        current_month_label="Май 2026",
        currency="USD",
        capital=CapitalSummary(
            net_capital=NowExpected(now=0, expected=0),
            main_account=AccountSummary(name="Основной счёт", now=0, expected=0),
            savings_accounts=[],
        ),
        capital_chart=[],
        expected_income=ExpectedBlock(total=0, subs=[]),
        expected_expense=ExpectedBlock(total=0, subs=[]),
        recent_snapshots=[],
    )
    monkeypatch.setattr(
        dashboard_api.dashboard_service,
        "get_overview",
        AsyncMock(return_value=empty),
    )

    response = client.get(
        "/api/v1/dashboard/overview",
        headers=_auth_headers(auth_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["has_any_snapshot"] is False
    assert data["has_current_plan"] is False
    assert data["capital_chart"] == []
    assert data["recent_snapshots"] == []
