"""Тесты HTTP-слоя страницы «Аналитика»."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from jwt.exceptions import InvalidTokenError

from app.api.v1 import analytics as analytics_api
from app.core.dependencies import get_sql_session
from app.main import app
from app.schemas.analytics import (
    AnalyticsCategoryRow,
    AnalyticsOverviewResponse,
    AnalyticsPlanVsActualBlock,
    AnalyticsPlanVsActualRow,
    AnalyticsScenario,
    AnalyticsScenarioPoint,
    AnalyticsSnapshotOption,
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


def _row(kind: str, name: str) -> AnalyticsPlanVsActualRow:
    return AnalyticsPlanVsActualRow(
        kind=kind,  # type: ignore[arg-type]
        name=name,
        plan=100,
        actual=120,
        spark=[1] * 12,
        note="к мартовскому снапшоту",
        subs=[AnalyticsCategoryRow(name="Зарплата", plan=100, actual=120)],
    )


def _payload() -> AnalyticsOverviewResponse:
    block = AnalyticsPlanVsActualBlock(
        income=_row("income", "Доходы"),
        expense=_row("expense", "Расходы"),
        capital=_row("capital", "Капитал"),
    )
    return AnalyticsOverviewResponse(
        currency="RUB",
        has_any_snapshot=True,
        snapshot_options=[
            AnalyticsSnapshotOption(
                snapshot_key="2026-04",
                label="Апрель 2026",
                kind="fact",
                hint="закрыт 1 мая 2026",
                state_label="Факт",
            ),
        ],
        plan_vs_actual={"2026-04": block},
        scenario=AnalyticsScenario(
            points=[
                AnalyticsScenarioPoint(
                    month_key="2026-04", label="Апр", plan=1000, actual=1100,
                ),
            ],
            plan_total=1000,
            actual_total=1100,
            gap=100,
            ahead=True,
            cross_month_label="Апр",
        ),
    )


def test_overview_requires_auth(client: TestClient) -> None:
    response = client.get("/api/v1/analytics/overview")
    assert response.status_code == 401


def test_overview_returns_payload(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    auth_token: str,
) -> None:
    payload = _payload()
    service_mock = AsyncMock(return_value=payload)
    monkeypatch.setattr(analytics_api.analytics_service, "get_overview", service_mock)

    response = client.get(
        "/api/v1/analytics/overview",
        headers=_auth_headers(auth_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["currency"] == "RUB"
    assert data["has_any_snapshot"] is True
    assert data["snapshot_options"][0]["snapshot_key"] == "2026-04"
    assert data["snapshot_options"][0]["kind"] == "fact"
    assert data["plan_vs_actual"]["2026-04"]["income"]["plan"] == 100
    assert data["plan_vs_actual"]["2026-04"]["income"]["subs"][0]["name"] == "Зарплата"
    assert data["scenario"]["ahead"] is True
    assert data["scenario"]["cross_month_label"] == "Апр"

    service_mock.assert_awaited_once()
    _session, called_user_id = service_mock.call_args.args
    assert called_user_id == 42
