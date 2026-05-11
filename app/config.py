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


class SqlConfig(BaseModel):
    """Конфигурация подключения к PostgreSQL через SQLAlchemy.

    Описывает параметры асинхронного движка SQLAlchemy и пула соединений,
    а также формирует DSN для драйвера ``asyncpg``.

    Attributes:
        host: Хост сервера PostgreSQL.
        port: TCP-порт сервера PostgreSQL.
        user: Имя пользователя для аутентификации.
        password: Пароль пользователя для аутентификации.
        database: Имя базы данных, к которой выполняется подключение.
        echo: Флаг логирования SQL-запросов движком SQLAlchemy.
        pool_size: Базовый размер пула соединений.
        max_overflow: Допустимое число дополнительных соединений сверх пула.
        pool_pre_ping: Флаг проверки соединения перед выдачей из пула.
    """

    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str = "postgres"
    database: str = "economix"
    echo: bool = False
    pool_size: int = 5
    max_overflow: int = 10
    pool_pre_ping: bool = True

    @property
    def dsn(self) -> str:
        """Возвращает DSN-строку для асинхронного драйвера ``asyncpg``.

        Returns:
            URL подключения вида
            ``postgresql+asyncpg://user:password@host:port/database``.
        """
        return f"postgresql+asyncpg://{self.user}:{self.password}" f"@{self.host}:{self.port}/{self.database}"


class JwtConfig(BaseModel):
    """Конфигурация сервиса аутентификации на основе JWT.

    Определяет параметры подписи и срока жизни токенов, а также
    стоимость хэширования паролей алгоритмом bcrypt.

    Attributes:
        secret_key: Секретный ключ для подписи и верификации токенов.
        algorithm: Алгоритм подписи JWT (например, ``HS256``).
        access_token_expire_minutes: Срок жизни access-токена в минутах.
        issuer: Значение поля ``iss`` JWT, идентифицирующее издателя.
        bcrypt_rounds: Стоимость хэширования bcrypt (log2 числа итераций).
    """

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    issuer: str = "economix"
    bcrypt_rounds: int = 12


class Settings(BaseSettings):
    """Корневой объект настроек, загружаемых из окружения и файла .env.

    Использует pydantic-settings для иерархической загрузки конфигурации:
    значения вложенных моделей могут быть переопределены через переменные
    окружения с разделителем ``__`` (например, ``APP__PORT=9000``).

    Attributes:
        app: Конфигурация приложения, см. :class:`AppConfig`.
        sql: Конфигурация подключения к PostgreSQL, см. :class:`SqlConfig`.
        jwt: Конфигурация JWT-аутентификации, см. :class:`JwtConfig`.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    app: AppConfig = AppConfig()
    sql: SqlConfig = SqlConfig()
    jwt: JwtConfig = JwtConfig()


settings = Settings()
