from fastapi import APIRouter, HTTPException, Request, status

from app.core.dependencies import SqlSession
from app.core.exceptions import (
    InvalidSnapshotKeyError,
    UnknownCategoryInSnapshotError,
)
from app.schemas.snapshot import SnapshotPayload, SnapshotRead, SnapshotsList
from app.services.snapshot import snapshots_service

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


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


@router.get("", response_model=SnapshotsList)
async def list_snapshots(
    request: Request,
    session: SqlSession,
) -> SnapshotsList:
    """Возвращает все плановые и фактические снапшоты пользователя.

    Args:
        request: Входящий запрос.
        session: Активная сессия SQLAlchemy.

    Returns:
        Объект со списками ``planned`` и ``actual``.
    """
    user_id = _user_id(request)
    return await snapshots_service.list_for_user(session, user_id)


@router.put("/planned/{snapshot_key}", response_model=SnapshotRead)
async def upsert_planned_snapshot(
    request: Request,
    snapshot_key: str,
    payload: SnapshotPayload,
    session: SqlSession,
) -> SnapshotRead:
    """Создаёт или полностью перезаписывает плановый снапшот за период.

    Args:
        request: Входящий запрос.
        snapshot_key: Ключ периода в формате ``YYYY-MM``.
        payload: Содержимое снапшота в разрезе категорий и счетов.
        session: Активная сессия SQLAlchemy.

    Returns:
        Сохранённый плановый снапшот.

    Raises:
        fastapi.HTTPException: ``400`` при недопустимом ключе периода,
            ``404`` если в пейлоаде указаны несуществующие имена категорий.
    """
    user_id = _user_id(request)
    try:
        return await snapshots_service.upsert_planned(
            session,
            user_id,
            snapshot_key,
            payload,
        )
    except InvalidSnapshotKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid snapshot key",
        ) from exc
    except UnknownCategoryInSnapshotError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown category in snapshot payload",
        ) from exc


@router.put("/actual/{snapshot_key}", response_model=SnapshotRead)
async def upsert_actual_snapshot(
    request: Request,
    snapshot_key: str,
    payload: SnapshotPayload,
    session: SqlSession,
) -> SnapshotRead:
    """Создаёт или полностью перезаписывает фактический снапшот за период.

    Args:
        request: Входящий запрос.
        snapshot_key: Ключ периода в формате ``YYYY-MM``.
        payload: Содержимое снапшота в разрезе категорий и счетов.
        session: Активная сессия SQLAlchemy.

    Returns:
        Сохранённый фактический снапшот.

    Raises:
        fastapi.HTTPException: ``400`` при недопустимом ключе периода,
            ``404`` если в пейлоаде указаны несуществующие имена категорий.
    """
    user_id = _user_id(request)
    try:
        return await snapshots_service.upsert_actual(
            session,
            user_id,
            snapshot_key,
            payload,
        )
    except InvalidSnapshotKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid snapshot key",
        ) from exc
    except UnknownCategoryInSnapshotError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown category in snapshot payload",
        ) from exc
