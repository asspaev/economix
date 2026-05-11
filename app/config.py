from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseModel):
    """Конфигурация основного приложения FastAPI.

    Содержит параметры запуска ASGI-сервера и метаданные приложения,
    используемые при инициализации экземпляра FastAPI.

    Attributes:
        host: IP-адрес, на котором будет запущен сервер.
        port: TCP-порт для прослушивания входящих соединений.
        reload: Флаг автоматической перезагрузки сервера при изменении кода.
        debug: Флаг режима отладки FastAPI.
        title: Человекочитаемое название приложения, отображаемое в OpenAPI.
        version: Версия приложения в формате SemVer.
    """

    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = False
    debug: bool = False
    title: str = "Economix"
    version: str = "1.0.0"


class Settings(BaseSettings):
    """Корневой объект настроек, загружаемых из окружения и файла .env.

    Использует pydantic-settings для иерархической загрузки конфигурации:
    значения вложенных моделей могут быть переопределены через переменные
    окружения с разделителем ``__`` (например, ``APP__PORT=9000``).

    Attributes:
        app: Конфигурация приложения, см. :class:`AppConfig`.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    app: AppConfig = AppConfig()


settings = Settings()
