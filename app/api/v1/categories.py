from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.core.dependencies import SqlSession
from app.core.exceptions import (
    ArchivedCategoryError,
    CategoryNotFoundError,
    DuplicateCategoryNameError,
    InvalidCategoryTypeError,
)
from app.schemas.categories import (
    CategoryArchive,
    CategoryCreate,
    CategoryRead,
    CategoryType,
    CategoryUpdate,
)
from app.services.categories import categories_service

router = APIRouter(prefix="/categories", tags=["categories"])


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


@router.get("", response_model=list[CategoryRead])
async def list_categories(
    request: Request,
    session: SqlSession,
    type: Annotated[CategoryType | None, Query(description="Фильтр по типу категории")] = None,
) -> list[CategoryRead]:
    """Возвращает категории пользователя.

    Args:
        request: Входящий запрос (используется для извлечения ``user_id``).
        session: Активная сессия SQLAlchemy.
        type: Опциональный фильтр по типу (``INCOME``/``EXPENSE``/``ACCOUNT``).

    Returns:
        Список категорий, упорядоченный по ``category_id``.
    """
    user_id = _user_id(request)
    try:
        records = await categories_service.list_for_user(
            session,
            user_id,
            type_=type,
        )
    except InvalidCategoryTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown category type",
        ) from exc
    return [CategoryRead.model_validate(r) for r in records]


@router.post(
    "",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    request: Request,
    payload: CategoryCreate,
    session: SqlSession,
) -> CategoryRead:
    """Создаёт новую категорию пользователя.

    Args:
        request: Входящий запрос.
        payload: Тип, имя и опциональный стартовый капитал категории.
        session: Активная сессия SQLAlchemy.

    Returns:
        Созданная категория со сгенерированным ``category_id``.

    Raises:
        fastapi.HTTPException: ``400`` при неизвестном типе, ``409`` при
            попытке создать категорию с уже существующим именем того
            же типа.
    """
    user_id = _user_id(request)
    try:
        record = await categories_service.create(
            session,
            user_id,
            type_=payload.type,
            name=payload.name,
            initial_capital=payload.initial_capital,
        )
    except InvalidCategoryTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown category type",
        ) from exc
    except DuplicateCategoryNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category with this name already exists",
        ) from exc
    return CategoryRead.model_validate(record)


@router.patch("/{category_id}", response_model=CategoryRead)
async def update_category(
    request: Request,
    category_id: int,
    payload: CategoryUpdate,
    session: SqlSession,
) -> CategoryRead:
    """Частично обновляет поля категории пользователя.

    Архивные категории редактировать нельзя — сначала их нужно
    разархивировать через :func:`set_archived`.

    Args:
        request: Входящий запрос.
        category_id: Идентификатор изменяемой категории.
        payload: Подмножество полей для обновления.
        session: Активная сессия SQLAlchemy.

    Returns:
        Обновлённая категория.

    Raises:
        fastapi.HTTPException: ``404`` если категория не найдена,
            ``409`` при дубликате имени, ``400`` если категория в архиве.
    """
    user_id = _user_id(request)
    data = payload.model_dump(exclude_unset=True)
    try:
        record = await categories_service.update(
            session,
            user_id,
            category_id,
            name=data.get("name"),
            initial_capital=data.get("initial_capital"),
            initial_capital_set="initial_capital" in data,
        )
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        ) from exc
    except DuplicateCategoryNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category with this name already exists",
        ) from exc
    except ArchivedCategoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archived categories cannot be edited",
        ) from exc
    return CategoryRead.model_validate(record)


@router.patch("/{category_id}/archive", response_model=CategoryRead)
async def archive_category(
    request: Request,
    category_id: int,
    payload: CategoryArchive,
    session: SqlSession,
) -> CategoryRead:
    """Переключает архивный статус категории.

    Args:
        request: Входящий запрос.
        category_id: Идентификатор изменяемой категории.
        payload: Целевое значение флага архивации.
        session: Активная сессия SQLAlchemy.

    Returns:
        Категория после применения изменения.

    Raises:
        fastapi.HTTPException: ``404``, если категория не найдена.
    """
    user_id = _user_id(request)
    try:
        record = await categories_service.set_archived(
            session,
            user_id,
            category_id,
            is_archived=payload.is_archived,
        )
    except CategoryNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        ) from exc
    return CategoryRead.model_validate(record)
