"""Бизнес-логика страницы «Категории».

Сервис инкапсулирует операции над :class:`UserCategory`: создание,
переименование, изменение стартового капитала и архивацию. Внутри
выполняются валидации (типы, владелец, дубли имён, запрет изменений
архивных записей); ручка из ``app/api/v1/categories.py`` только
формирует HTTP-ответ.
"""

from __future__ import annotations

from typing import get_args

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ArchivedCategoryError,
    CategoryNotFoundError,
    DuplicateCategoryNameError,
    InvalidCategoryTypeError,
)
from app.crud import user_category as user_category_crud
from app.models.user_category import UserCategory
from app.schemas.categories import CategoryType

ALLOWED_TYPES: frozenset[str] = frozenset(get_args(CategoryType))


def _validate_type(type_: str) -> None:
    """Проверяет, что переданный тип входит в :data:`ALLOWED_TYPES`.

    Args:
        type_: Строковый тип категории.

    Raises:
        InvalidCategoryTypeError: Если значение не входит в множество
            допустимых типов.
    """
    if type_ not in ALLOWED_TYPES:
        raise InvalidCategoryTypeError(type_)


class CategoriesService:
    """Сервис управления категориями пользователя."""

    async def list_for_user(
        self,
        session: AsyncSession,
        user_id: int,
        *,
        type_: str | None = None,
    ) -> list[UserCategory]:
        """Возвращает категории пользователя, опционально фильтруя по типу.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            type_: Фильтр по типу или ``None`` для всех категорий.

        Returns:
            Список категорий пользователя, упорядоченный по
            ``category_id``.

        Raises:
            InvalidCategoryTypeError: Если ``type_`` задан и не входит в
                множество допустимых значений.
        """
        if type_ is not None:
            _validate_type(type_)
        return await user_category_crud.list_by_user(
            session,
            user_id,
            type_=type_,
        )

    async def create(
        self,
        session: AsyncSession,
        user_id: int,
        *,
        type_: str,
        name: str,
        initial_capital: int | None,
    ) -> UserCategory:
        """Создаёт новую категорию пользователя.

        Стартовый капитал имеет смысл только для счетов (``ACCOUNT``); для
        остальных типов значение игнорируется. Проверяется уникальность
        имени среди категорий того же типа.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            type_: Тип создаваемой категории.
            name: Имя категории.
            initial_capital: Стартовый капитал (для счетов).

        Returns:
            Созданный экземпляр :class:`UserCategory`.

        Raises:
            InvalidCategoryTypeError: Если тип не входит в допустимое
                множество значений.
            DuplicateCategoryNameError: Если категория с таким именем
                уже существует у пользователя в рамках того же типа.
        """
        _validate_type(type_)
        clean_name = name.strip()
        if not clean_name:
            raise DuplicateCategoryNameError(name)

        duplicate = await user_category_crud.find_by_name(
            session,
            user_id,
            type_=type_,
            name=clean_name,
        )
        if duplicate is not None:
            raise DuplicateCategoryNameError(clean_name)

        capital = initial_capital if type_ == "ACCOUNT" else None
        record = await user_category_crud.create_one(
            session,
            user_id=user_id,
            type_=type_,
            name=clean_name,
            initial_capital=capital,
        )
        await session.commit()
        return record

    async def _get_owned(
        self,
        session: AsyncSession,
        user_id: int,
        category_id: int,
    ) -> UserCategory:
        """Возвращает категорию или возбуждает :class:`CategoryNotFoundError`.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            category_id: Идентификатор категории.

        Returns:
            Найденная категория, принадлежащая пользователю.

        Raises:
            CategoryNotFoundError: Если категория не найдена или
                принадлежит другому пользователю.
        """
        record = await user_category_crud.get_by_id(session, user_id, category_id)
        if record is None:
            raise CategoryNotFoundError(category_id)
        return record

    async def update(
        self,
        session: AsyncSession,
        user_id: int,
        category_id: int,
        *,
        name: str | None,
        initial_capital: int | None,
        initial_capital_set: bool,
    ) -> UserCategory:
        """Применяет частичное обновление к категории пользователя.

        Архивные категории редактировать запрещено: чтобы изменить поля,
        пользователь должен сначала разархивировать запись.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            category_id: Идентификатор изменяемой категории.
            name: Новое имя категории или ``None``, если поле не меняется.
            initial_capital: Новое значение стартового капитала
                (учитывается только для счетов).
            initial_capital_set: Передан ли ``initial_capital`` клиентом.

        Returns:
            Обновлённый экземпляр :class:`UserCategory`.

        Raises:
            CategoryNotFoundError: Если категория не найдена.
            ArchivedCategoryError: Если категория находится в архиве.
            DuplicateCategoryNameError: Если новое имя уже занято другой
                активной категорией того же типа.
        """
        record = await self._get_owned(session, user_id, category_id)
        if record.is_archived:
            raise ArchivedCategoryError(category_id)

        clean_name: str | None = None
        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise DuplicateCategoryNameError(name)
            if clean_name != record.name:
                duplicate = await user_category_crud.find_by_name(
                    session,
                    user_id,
                    type_=record.type,
                    name=clean_name,
                )
                if duplicate is not None and duplicate.category_id != category_id:
                    raise DuplicateCategoryNameError(clean_name)

        apply_capital = initial_capital_set and record.type == "ACCOUNT"
        capital_value = initial_capital if apply_capital else None

        await user_category_crud.update_fields(
            session,
            record,
            name=clean_name,
            initial_capital=capital_value,
            initial_capital_set=apply_capital,
        )
        await session.commit()
        return record

    async def set_archived(
        self,
        session: AsyncSession,
        user_id: int,
        category_id: int,
        *,
        is_archived: bool,
    ) -> UserCategory:
        """Переключает архивный статус категории.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            category_id: Идентификатор изменяемой категории.
            is_archived: Целевое значение флага архивации.

        Returns:
            Обновлённый экземпляр :class:`UserCategory`.

        Raises:
            CategoryNotFoundError: Если категория не найдена.
        """
        record = await self._get_owned(session, user_id, category_id)
        if record.is_archived == is_archived:
            return record
        await user_category_crud.set_archived(
            session,
            record,
            is_archived=is_archived,
        )
        await session.commit()
        return record


categories_service = CategoriesService()
