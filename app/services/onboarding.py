from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    OnboardingAlreadyCompletedError,
    OnboardingIncompleteError,
)
from app.core.redis import RedisManager
from app.crud import snapshot as snapshot_crud
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.services.auth import ACCOUNT_CATEGORY_TYPE, build_auth_claims
from app.services.jwt import JwtService, jwt_service

ONBOARDING_KEY_TEMPLATE = "onboarding:{user_id}"
ONBOARDING_TTL_SECONDS = 24 * 60 * 60
MOSCOW_TZ = timezone(timedelta(hours=3))

REQUIRED_FIELDS = (
    "currency",
    "snapshot_type",
    "income_categories",
    "expense_categories",
    "accounts",
    "initial_capital",
    "initial_snapshot",
)
MAIN_ACCOUNT_NAME = "Основной счёт"


def _redis_key(user_id: int) -> str:
    """Возвращает ключ Redis для состояния онбординга пользователя."""
    return ONBOARDING_KEY_TEMPLATE.format(user_id=user_id)


def _validate_state(state: dict[str, Any]) -> None:
    """Проверяет, что в состоянии заполнены все обязательные поля.

    Args:
        state: Текущий словарь состояния онбординга из Redis.

    Raises:
        OnboardingIncompleteError: Если хотя бы одно из обязательных полей
            отсутствует или содержит пустое значение.
    """
    missing: list[str] = []
    for field in REQUIRED_FIELDS:
        value = state.get(field)
        if value is None:
            missing.append(field)
            continue
        if isinstance(value, (list, dict)) and not value:
            missing.append(field)
    if missing:
        raise OnboardingIncompleteError(missing)


def build_snapshot_key(snapshot_type: str, now: datetime | None = None) -> str:
    """Формирует ключ периода по МСК времени.

    Args:
        snapshot_type: Тип снапшота (``MONTLY`` или ``WEEKLY``).
        now: Опциональное текущее время (для тестов); по умолчанию — ``now``
            в часовом поясе МСК.

    Returns:
        Ключ периода в формате ``"YYYY-MM"`` для ``MONTLY`` либо
        ``"YYYY-Www"`` (ISO week) для ``WEEKLY``.
    """
    moment = now or datetime.now(MOSCOW_TZ)
    if snapshot_type == "WEEKLY":
        year, week, _ = moment.isocalendar()
        return f"{year}-W{week:02d}"
    return moment.strftime("%Y-%m")


class OnboardingService:
    """Бизнес-логика онбординга пользователя.

    Хранит промежуточное состояние в Redis на 24 часа и по сигналу
    фронтенда создаёт связанные записи в БД, после чего удаляет
    Redis-ключ и выпускает новый JWT.

    Attributes:
        _jwt: Сервис JWT для выпуска токенов после завершения онбординга.
    """

    def __init__(self, jwt: JwtService) -> None:
        """Инициализирует сервис заданной зависимостью JWT.

        Args:
            jwt: Сервис JWT.
        """
        self._jwt = jwt

    async def get_state(self, redis: RedisManager, user_id: int) -> dict[str, Any]:
        """Возвращает текущее состояние онбординга из Redis.

        Args:
            redis: Менеджер Redis.
            user_id: Идентификатор пользователя.

        Returns:
            Словарь состояния (возможно, пустой), готовый к сериализации.
        """
        state = await redis.get_json(_redis_key(user_id))
        return state or {}

    async def patch_state(
        self,
        redis: RedisManager,
        user_id: int,
        patch: dict[str, Any],
    ) -> dict[str, Any]:
        """Обновляет состояние онбординга, перезаписывая указанные поля.

        Args:
            redis: Менеджер Redis.
            user_id: Идентификатор пользователя.
            patch: Поля для перезаписи в текущем состоянии.

        Returns:
            Полное состояние онбординга после применения изменений.
        """
        key = _redis_key(user_id)
        state = await redis.get_json(key) or {}
        for field, value in patch.items():
            if value is None:
                continue
            state[field] = value
        await redis.set_json(key, state, ttl_seconds=ONBOARDING_TTL_SECONDS)
        return state

    async def complete(
        self,
        session: AsyncSession,
        redis: RedisManager,
        user_id: int,
    ) -> str:
        """Завершает онбординг и создаёт записи в БД.

        Проверяет полноту состояния, затем создаёт настройки пользователя,
        категории (доходы, расходы, счета) и первый плановый снапшот.
        После успешного коммита удаляет Redis-ключ и выпускает новый JWT
        с обновлёнными claim'ами.

        Args:
            session: Активная сессия SQLAlchemy.
            redis: Менеджер Redis.
            user_id: Идентификатор пользователя.

        Returns:
            Новый подписанный JWT с ``onboarding_required=False``.

        Raises:
            OnboardingIncompleteError: Если состояние заполнено не полностью.
            OnboardingAlreadyCompletedError: Если онбординг уже был пройден.
        """
        existing = await user_settings_crud.get_by_user_id(session, user_id)
        if existing is not None:
            raise OnboardingAlreadyCompletedError()

        state = await redis.get_json(_redis_key(user_id)) or {}
        _validate_state(state)

        await user_settings_crud.create(
            session,
            user_id=user_id,
            currency=state["currency"],
            snapshot_type=state["snapshot_type"],
        )

        accounts = state["accounts"]
        initial_capital = state["initial_capital"]
        items: list[dict[str, Any]] = []
        for name in state["income_categories"]:
            items.append({"type": "INCOME", "name": name})
        for name in state["expense_categories"]:
            items.append({"type": "EXPENSE", "name": name})
        for name in accounts:
            items.append(
                {
                    "type": ACCOUNT_CATEGORY_TYPE,
                    "name": name,
                    "initial_capital": initial_capital.get(name),
                },
            )
        await user_category_crud.bulk_create(session, user_id=user_id, items=items)

        initial_snapshot = state["initial_snapshot"]
        snapshot_key = build_snapshot_key(state["snapshot_type"])
        await snapshot_crud.create_planned(
            session,
            user_id=user_id,
            snapshot_key=snapshot_key,
            incomes=initial_snapshot["incomes"],
            expenses=initial_snapshot["expenses"],
            savings_deposits=initial_snapshot["savings_deposits"],
            savings_withdrawals=initial_snapshot["savings_withdrawals"],
        )

        await session.commit()
        await redis.delete(_redis_key(user_id))

        claims = await build_auth_claims(session, user_id)
        return self._jwt.create_token(subject=user_id, extra_claims=claims)


onboarding_service = OnboardingService(jwt_service)
