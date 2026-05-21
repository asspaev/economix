from sqlalchemy import select
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
