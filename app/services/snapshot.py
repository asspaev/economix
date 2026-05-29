"""Бизнес-логика страницы «Снапшоты».

Сервис собирает плановые и фактические снапшоты пользователя в один
ответ, а также позволяет создавать или полностью перезаписывать
снапшот за конкретный период (``snapshot_key``). Категории и счета
адресуются по имени (как в онбординге и сервисе «Обзор»); ключ периода —
в формате ``YYYY-MM``.
"""

from __future__ import annotations

import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    InvalidSnapshotKeyError,
    UnknownCategoryInSnapshotError,
)
from app.crud import snapshot as snapshot_crud
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.models.snapshot import ActualSnapshot, PlannedSnapshot
from app.schemas.snapshot import SnapshotPayload, SnapshotRead, SnapshotsList

SNAPSHOT_KEY_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_snapshot_key(snapshot_key: str) -> None:
    """Проверяет, что ключ периода соответствует формату ``YYYY-MM``.

    Args:
        snapshot_key: Ключ периода.

    Raises:
        InvalidSnapshotKeyError: Если строка не подходит под маску.
    """
    if not SNAPSHOT_KEY_PATTERN.fullmatch(snapshot_key):
        raise InvalidSnapshotKeyError(snapshot_key)


def _to_storage(values: dict[str, int]) -> dict[str, int]:
    """Готовит словарь к сохранению в JSONB: значения приводит к ``int``."""
    return {k: int(v) for k, v in values.items()}


def _to_payload(values: dict[str, int] | None) -> dict[str, int]:
    """Преобразует словарь из JSONB к виду ``{category_name: amount}``."""
    return {k: int(v) for k, v in (values or {}).items()}


def _to_read(record: PlannedSnapshot | ActualSnapshot) -> SnapshotRead:
    """Собирает Pydantic-ответ из ORM-записи снапшота."""
    return SnapshotRead(
        snapshot_key=record.snapshot_key,
        incomes=_to_payload(record.incomes),
        expenses=_to_payload(record.expenses),
        savings_deposits=_to_payload(record.savings_deposits),
        savings_withdrawals=_to_payload(record.savings_withdrawals),
    )


class SnapshotsService:
    """Сервис управления плановыми и фактическими снапшотами."""

    async def list_for_user(
        self,
        session: AsyncSession,
        user_id: int,
    ) -> SnapshotsList:
        """Возвращает все снапшоты пользователя одной коллекцией.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.

        Returns:
            Объект со списками ``planned`` и ``actual``, упорядоченными по
            возрастанию ``snapshot_key``, плюс код валюты пользователя.
        """
        planned = await snapshot_crud.list_planned(session, user_id)
        actual = await snapshot_crud.list_actual(session, user_id)
        settings = await user_settings_crud.get_by_user_id(session, user_id)
        currency = settings.currency if settings is not None else "USD"
        return SnapshotsList(
            planned=[_to_read(r) for r in planned],
            actual=[_to_read(r) for r in actual],
            currency=currency,
        )

    async def _validate_categories(
        self,
        session: AsyncSession,
        user_id: int,
        payload: SnapshotPayload,
    ) -> None:
        """Проверяет, что все имена категорий в пейлоаде есть у пользователя.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            payload: Пейлоад снапшота.

        Raises:
            UnknownCategoryInSnapshotError: Если хотя бы одно из имён не
                найдено среди активных категорий пользователя.
        """
        referenced: set[str] = set()
        for bucket in (
            payload.incomes,
            payload.expenses,
            payload.savings_deposits,
            payload.savings_withdrawals,
        ):
            referenced.update(bucket.keys())
        if not referenced:
            return

        categories = await user_category_crud.list_by_user(session, user_id)
        known = {c.name for c in categories}
        unknown = sorted(referenced - known)
        if unknown:
            raise UnknownCategoryInSnapshotError(unknown)

    async def upsert_planned(
        self,
        session: AsyncSession,
        user_id: int,
        snapshot_key: str,
        payload: SnapshotPayload,
    ) -> SnapshotRead:
        """Создаёт или перезаписывает плановый снапшот за период.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            snapshot_key: Ключ периода в формате ``YYYY-MM``.
            payload: Содержимое снапшота.

        Returns:
            Сохранённый снапшот в виде :class:`SnapshotRead`.

        Raises:
            InvalidSnapshotKeyError: Если ключ периода невалиден.
            UnknownCategoryInSnapshotError: Если в пейлоаде указаны
                несуществующие у пользователя ``category_id``.
        """
        _validate_snapshot_key(snapshot_key)
        await self._validate_categories(session, user_id, payload)
        record = await snapshot_crud.upsert_planned(
            session,
            user_id=user_id,
            snapshot_key=snapshot_key,
            incomes=_to_storage(payload.incomes),
            expenses=_to_storage(payload.expenses),
            savings_deposits=_to_storage(payload.savings_deposits),
            savings_withdrawals=_to_storage(payload.savings_withdrawals),
        )
        await session.commit()
        return _to_read(record)

    async def upsert_actual(
        self,
        session: AsyncSession,
        user_id: int,
        snapshot_key: str,
        payload: SnapshotPayload,
    ) -> SnapshotRead:
        """Создаёт или перезаписывает фактический снапшот за период.

        Args:
            session: Активная сессия SQLAlchemy.
            user_id: Идентификатор пользователя.
            snapshot_key: Ключ периода в формате ``YYYY-MM``.
            payload: Содержимое снапшота.

        Returns:
            Сохранённый снапшот в виде :class:`SnapshotRead`.

        Raises:
            InvalidSnapshotKeyError: Если ключ периода невалиден.
            UnknownCategoryInSnapshotError: Если в пейлоаде указаны
                несуществующие у пользователя ``category_id``.
        """
        _validate_snapshot_key(snapshot_key)
        await self._validate_categories(session, user_id, payload)
        record = await snapshot_crud.upsert_actual(
            session,
            user_id=user_id,
            snapshot_key=snapshot_key,
            incomes=_to_storage(payload.incomes),
            expenses=_to_storage(payload.expenses),
            savings_deposits=_to_storage(payload.savings_deposits),
            savings_withdrawals=_to_storage(payload.savings_withdrawals),
        )
        await session.commit()
        return _to_read(record)


snapshots_service = SnapshotsService()
