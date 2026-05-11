from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Базовый класс декларативных моделей SQLAlchemy.

    Определяет общие для всех таблиц поля аудита ``created_at`` и
    ``updated_at`` со значением по умолчанию ``now()`` на стороне СУБД.

    Attributes:
        created_at: Момент создания записи в часовом поясе UTC.
        updated_at: Момент последнего обновления записи в часовом поясе UTC.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
