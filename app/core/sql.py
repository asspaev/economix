from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import SqlConfig, settings


class SqlSessionManager:
    """Менеджер асинхронных сессий PostgreSQL поверх SQLAlchemy.

    Инкапсулирует жизненный цикл асинхронного движка SQLAlchemy и фабрики
    сессий, предоставляя единую точку получения :class:`AsyncSession` для
    обработчиков FastAPI и фоновых задач. Гарантирует корректный откат
    транзакции при возникновении исключения внутри контекстного блока.

    Attributes:
        _engine: Асинхронный движок SQLAlchemy, поддерживающий пул соединений.
        _sessionmaker: Фабрика асинхронных сессий, привязанная к движку.
    """

    def __init__(self, config: SqlConfig) -> None:
        """Инициализирует движок и фабрику сессий по переданной конфигурации.

        Args:
            config: Конфигурация подключения к PostgreSQL.
        """
        self._engine: AsyncEngine = create_async_engine(
            config.dsn,
            echo=config.echo,
            pool_size=config.pool_size,
            max_overflow=config.max_overflow,
            pool_pre_ping=config.pool_pre_ping,
        )
        self._sessionmaker: async_sessionmaker[AsyncSession] = async_sessionmaker(
            bind=self._engine,
            expire_on_commit=False,
            autoflush=False,
        )

    @property
    def engine(self) -> AsyncEngine:
        """Возвращает асинхронный движок SQLAlchemy.

        Returns:
            Экземпляр :class:`AsyncEngine`, управляющий пулом соединений.
        """
        return self._engine

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Открывает асинхронную сессию в виде контекстного менеджера.

        При выходе из контекста без исключения сессия закрывается штатно;
        при возбуждении исключения транзакция откатывается перед закрытием.

        Yields:
            AsyncSession: Активная сессия SQLAlchemy для выполнения запросов.
        """
        async with self._sessionmaker() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    async def dispose(self) -> None:
        """Освобождает соединения пула и закрывает движок.

        Должен вызываться при завершении жизненного цикла приложения, чтобы
        корректно закрыть открытые соединения PostgreSQL.
        """
        await self._engine.dispose()


sql_session_manager = SqlSessionManager(settings.sql)
