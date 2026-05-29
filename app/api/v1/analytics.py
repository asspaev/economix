from fastapi import APIRouter, HTTPException, Request, status

from app.core.dependencies import SqlSession
from app.schemas.analytics import AnalyticsOverviewResponse
from app.services.analytics import analytics_service


router = APIRouter(prefix="/analytics", tags=["analytics"])


def _user_id(request: Request) -> int:
    """Извлекает идентификатор пользователя из ``request.state.token_payload``.

    Args:
        request: Входящий HTTP-запрос Starlette.

    Returns:
        Числовой идентификатор пользователя из JWT.

    Raises:
        fastapi.HTTPException: Со статусом 401, если payload отсутствует
            или ``sub`` не приводится к целому.
    """
    payload = getattr(request.state, "token_payload", None)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from exc


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def read_overview(
    request: Request,
    session: SqlSession,
) -> AnalyticsOverviewResponse:
    """Возвращает агрегированные данные для страницы «Аналитика»."""
    user_id = _user_id(request)
    return await analytics_service.get_overview(session, user_id)
