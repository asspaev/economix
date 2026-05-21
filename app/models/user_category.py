from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserCategory(Base):
    """Пользовательская категория доходов или расходов.

    Каждая категория принадлежит конкретному пользователю и
    идентифицируется парой ``(user_id, category_id)``: у одного
    пользователя ``category_id`` уникален, но один и тот же
    идентификатор могут использовать разные пользователи.

    Attributes:
        user_id: Идентификатор пользователя — владельца категории,
            ссылается на :class:`User` и каскадно удаляется вместе с ним.
        category_id: Уникальный в пределах пользователя идентификатор
            категории.
        type: Тип категории (из списка: ``INCOME``, ``EXPENSE`` или ``ACCOUNT``).
        name: Отображаемое название категории.
        is_archived: Признак архивной категории, скрытой из активных
            списков, но сохранённой для исторических данных.
    """

    __tablename__ = "user_categories"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    category_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    initial_capital: Mapped[int] = mapped_column(Integer, nullable=True)
    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
    )
