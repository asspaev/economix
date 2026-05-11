from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from loguru import logger

from app.api import router as api_router
from app.config import settings
from app.core.middleware import JwtAuthMiddleware

PUBLIC_PATHS: tuple[str, ...] = (
    "/api/v1/auth/register",
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управляет жизненным циклом приложения FastAPI.

    Выполняет действия при старте приложения до передачи управления
    обработчикам запросов и финализирующие действия после завершения работы.

    Args:
        app: Экземпляр приложения FastAPI, к которому привязан контекст.

    Yields:
        None: Передаёт управление в основной цикл работы приложения.
    """
    logger.info("Starting application")
    yield
    logger.info("Shutting down application")


app = FastAPI(
    title=settings.app.title,
    version=settings.app.version,
    debug=settings.app.debug,
    lifespan=lifespan,
)
app.add_middleware(JwtAuthMiddleware, public_paths=PUBLIC_PATHS)
app.include_router(api_router)


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.app.host,
        port=settings.app.port,
        reload=settings.app.reload,
    )
