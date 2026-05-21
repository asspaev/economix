import json
from typing import Any

from redis.asyncio import Redis, from_url

from app.config import RedisConfig, settings


class RedisManager:
    """Менеджер асинхронного клиента Redis для приложения.

    Инкапсулирует создание клиента :class:`redis.asyncio.Redis` и
    предоставляет высокоуровневые методы для работы с JSON-значениями
    и TTL. Используется для временного хранения промежуточных данных,
    например, состояния онбординга пользователя на 24 часа.

    Attributes:
        _client: Асинхронный клиент Redis, созданный по конфигурации.
    """

    def __init__(self, config: RedisConfig) -> None:
        """Инициализирует клиент Redis по переданной конфигурации.

        Args:
            config: Конфигурация подключения к Redis.
        """
        self._client: Redis = from_url(
            config.url,
            decode_responses=config.decode_responses,
        )

    @property
    def client(self) -> Redis:
        """Возвращает низкоуровневый асинхронный клиент Redis.

        Returns:
            Экземпляр :class:`redis.asyncio.Redis`.
        """
        return self._client

    async def get_json(self, key: str) -> dict[str, Any] | None:
        """Возвращает JSON-словарь по ключу либо ``None``.

        Args:
            key: Ключ, под которым хранится JSON-значение.

        Returns:
            Декодированный словарь или ``None``, если ключа нет.
        """
        raw = await self._client.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set_json(
        self,
        key: str,
        value: dict[str, Any],
        ttl_seconds: int | None = None,
    ) -> None:
        """Сохраняет словарь как JSON по ключу с опциональным TTL.

        Args:
            key: Ключ, под которым сохраняется значение.
            value: Словарь, сериализуемый в JSON.
            ttl_seconds: Время жизни ключа в секундах. ``None`` — без TTL.
        """
        payload = json.dumps(value, ensure_ascii=False)
        if ttl_seconds is None:
            await self._client.set(key, payload)
        else:
            await self._client.set(key, payload, ex=ttl_seconds)

    async def delete(self, key: str) -> None:
        """Удаляет ключ Redis, если он существует.

        Args:
            key: Ключ, который требуется удалить.
        """
        await self._client.delete(key)

    async def close(self) -> None:
        """Освобождает соединение клиента Redis.

        Должен вызываться при завершении жизненного цикла приложения.
        """
        await self._client.aclose()


redis_manager = RedisManager(settings.redis)
