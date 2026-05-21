# Economix

Бэкенд на FastAPI (Python 3.12+) с асинхронным SQLAlchemy 2.x и PostgreSQL (asyncpg), JWT-аутентификацией и фронтендом на React + Vite + TypeScript.

## Стек

- **Backend:** FastAPI, SQLAlchemy (async), asyncpg, Alembic, PyJWT, bcrypt, loguru, pydantic-settings
- **Frontend:** React + Vite + TypeScript (директория `web/`)
- **Инфраструктура:** Docker / docker-compose
- **Тесты:** pytest
- **Менеджер зависимостей:** Poetry

## Структура

```
app/
  api/            # FastAPI-роутеры (тонкий слой HTTP)
    v1/
      auth.py
  services/       # Бизнес-логика
  crud/           # SQL-запросы (SQLAlchemy)
  models/         # ORM-модели SQLAlchemy
  schemas/        # Pydantic-схемы запросов/ответов
  core/
    dependencies.py  # FastAPI-зависимости (SqlSession, TokenPayload)
    exceptions.py    # Доменные исключения (AppError и наследники)
    middleware.py    # JwtAuthMiddleware
    sql.py           # Менеджер сессий SQLAlchemy
  alembic/        # Миграции БД
  config.py       # Настройки (pydantic-settings)
  main.py         # Точка входа FastAPI
tests/            # pytest
web/              # React + Vite + TS
```

## Архитектурные правила

### Слои и зависимости
- **`app/api/`** — только тонкий HTTP-слой. Внутри ручек разрешается:
  - валидация входа через Pydantic-схему;
  - вызов сервиса из `app/services/`;
  - перехват доменных исключений из `app/core/exceptions.py` и преобразование их в `HTTPException`;
  - формирование ответа (cookies, headers, response_model).
  
  В ручках **запрещены** SQL-запросы, прямая работа с моделями и бизнес-логика.

- **`app/services/`** — вся бизнес-логика. Сервисы вызывают `app/crud/` и поднимают исключения из `app/core/exceptions.py`. Сервисы не знают про HTTP.

- **`app/crud/`** — **единственное** место, где допустимы SQL-запросы (`select`, `insert`, `update`, `delete`, работа с сессией). Никакого SQL в сервисах, ручках или мидлварах.

- **`app/core/exceptions.py`** — все кастомные исключения наследуются от `AppError`. Сервисы поднимают доменные исключения; ручки ловят их и формируют HTTP-ответы.

### Изменения моделей и миграции
- **Не изменяй файлы в `app/models/` без явного запроса пользователя.** Если задача неявно требует правки модели — уточни у пользователя перед изменением.
- **Не запускай `alembic revision`/`alembic upgrade`/`alembic downgrade` без явной просьбы.** Создание миграций — отдельное действие, инициируемое пользователем.

### Тесты
- После каждой новой фичи или изменения существующей пиши тесты в `tests/` (pytest).
- Покрытие — минимум happy-path и ключевые ошибки доменных исключений.

### Коммиты
- **Не делай `git commit` без явной просьбы пользователя.** Даже после успешного завершения задачи изменения оставляй незакоммиченными, пока пользователь сам не попросит.

## Запуск

```bash
# Локально
poetry install
poetry run python -m app.main

# Через Docker
docker compose up
```

## Конфигурация

Настройки берутся из переменных окружения и `.env` (см. `app/config.py`). Вложенные секции разделяются `__`, например: `APP__PORT=9000`, `SQL__HOST=db`, `JWT__SECRET_KEY=...`.

Секции: `app` (`AppConfig`), `sql` (`SqlConfig`), `jwt` (`JwtConfig`).

## Аутентификация

JWT в HttpOnly cookie `access_token` (или заголовке `Authorization: Bearer <token>`). Все маршруты проверяются `JwtAuthMiddleware`, кроме публичных префиксов, перечисленных в `app/main.py` (`PUBLIC_PATHS`): `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/logout`.
