from fastapi import APIRouter, HTTPException, Request, status

from app.core.dependencies import SqlSession
from app.schemas.dashboard import DashboardOverviewResponse
from app.services.dashboard import dashboard_service


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


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


@router.get("/overview", response_model=DashboardOverviewResponse)
async def read_overview(
    request: Request,
    session: SqlSession,
) -> DashboardOverviewResponse:
    """Возвращает агрегированные данные для страницы «Обзор».

    Args:
        request: Входящий запрос (используется для извлечения ``user_id``).
        session: Активная сессия SQLAlchemy.

    Returns:
        Уже посчитанный объект со всеми блоками страницы: капитал,
        график «план vs факт», ожидаемые доходы и расходы, ближайшие
        снапшоты. Если у пользователя нет ни одного снапшота, поле
        ``has_any_snapshot`` равно ``False`` — фронтенд показывает CTA
        «Создать первый снапшот» вместо блоков.
    """
    user_id = _user_id(request)
    return await dashboard_service.get_overview(session, user_id)
