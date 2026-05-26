from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_category import UserCategory


async def list_by_user(
    session: AsyncSession,
    user_id: int,
    *,
    type_: str | None = None,
) -> list[UserCategory]:
    """Возвращает категории пользователя, опционально фильтруя по типу.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.
        type_: Тип категорий для фильтрации (``INCOME``, ``EXPENSE`` или
            ``ACCOUNT``). ``None`` — без фильтрации.

    Returns:
        Список найденных категорий, упорядоченный по ``category_id``.
    """
    stmt = select(UserCategory).where(UserCategory.user_id == user_id)
    if type_ is not None:
        stmt = stmt.where(UserCategory.type == type_)
    stmt = stmt.order_by(UserCategory.category_id)
    result = await session.scalars(stmt)
    return list(result.all())


async def get_by_id(
    session: AsyncSession,
    user_id: int,
    category_id: int,
) -> UserCategory | None:
    """Возвращает категорию пользователя по составному ключу.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя — владельца категории.
        category_id: Идентификатор категории, уникальный в пределах
            пользователя.

    Returns:
        Найденный экземпляр :class:`UserCategory` или ``None``, если
        запись отсутствует.
    """
    return await session.scalar(
        select(UserCategory).where(
            UserCategory.user_id == user_id,
            UserCategory.category_id == category_id,
        ),
    )


async def find_by_name(
    session: AsyncSession,
    user_id: int,
    *,
    type_: str,
    name: str,
) -> UserCategory | None:
    """Возвращает категорию пользователя по типу и имени.

    Используется для проверки дублей имён в пределах одного типа.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.
        type_: Тип категории.
        name: Имя категории.

    Returns:
        Найденная запись или ``None``.
    """
    return await session.scalar(
        select(UserCategory).where(
            UserCategory.user_id == user_id,
            UserCategory.type == type_,
            UserCategory.name == name,
        ),
    )


async def create_one(
    session: AsyncSession,
    *,
    user_id: int,
    type_: str,
    name: str,
    initial_capital: int | None = None,
) -> UserCategory:
    """Создаёт одну категорию пользователя со следующим свободным ``category_id``.

    Идентификатор присваивается как ``max(category_id) + 1`` среди
    существующих категорий пользователя; для нового пользователя — ``1``.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.
        type_: Тип категории.
        name: Имя категории.
        initial_capital: Стартовый капитал (применимо к счетам).

    Returns:
        Созданный экземпляр :class:`UserCategory`.
    """
    max_id = await session.scalar(
        select(func.max(UserCategory.category_id)).where(
            UserCategory.user_id == user_id,
        ),
    )
    next_id = (max_id or 0) + 1
    record = UserCategory(
        user_id=user_id,
        category_id=next_id,
        type=type_,
        name=name,
        initial_capital=initial_capital,
    )
    session.add(record)
    await session.flush()
    return record


async def update_fields(
    session: AsyncSession,
    record: UserCategory,
    *,
    name: str | None = None,
    initial_capital: int | None = None,
    initial_capital_set: bool = False,
) -> UserCategory:
    """Перезаписывает изменяемые поля категории.

    Параметр ``initial_capital_set`` нужен, чтобы отличить «не передано»
    от «передано ``None``» — последнее сбрасывает стартовый капитал.

    Args:
        session: Активная сессия SQLAlchemy.
        record: Существующая запись категории.
        name: Новое имя категории; ``None`` — не изменять.
        initial_capital: Новое значение стартового капитала.
        initial_capital_set: Если ``True``, ``initial_capital``
            записывается как есть (включая ``None``).

    Returns:
        Тот же экземпляр после применения изменений.
    """
    if name is not None:
        record.name = name
    if initial_capital_set:
        record.initial_capital = initial_capital
    await session.flush()
    return record


async def set_archived(
    session: AsyncSession,
    record: UserCategory,
    *,
    is_archived: bool,
) -> UserCategory:
    """Переключает архивный статус категории.

    Args:
        session: Активная сессия SQLAlchemy.
        record: Существующая запись категории.
        is_archived: Целевое значение флага архивации.

    Returns:
        Тот же экземпляр после применения изменения.
    """
    record.is_archived = is_archived
    await session.flush()
    return record


async def bulk_create(
    session: AsyncSession,
    *,
    user_id: int,
    items: list[dict[str, object]],
) -> list[UserCategory]:
    """Массово создаёт категории пользователя со сквозной нумерацией.

    Идентификатор ``category_id`` присваивается последовательно начиная с 1
    в порядке передачи в ``items``.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя — владельца категорий.
        items: Список словарей со ключами ``type``, ``name`` и опциональным
            ``initial_capital``.

    Returns:
        Список созданных :class:`UserCategory` в исходном порядке.
    """
    created: list[UserCategory] = []
    for index, item in enumerate(items, start=1):
        record = UserCategory(
            user_id=user_id,
            category_id=index,
            type=item["type"],
            name=item["name"],
            initial_capital=item.get("initial_capital"),
        )
        session.add(record)
        created.append(record)
    await session.flush()
    return created
