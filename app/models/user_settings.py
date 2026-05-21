from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserSettings(Base):
    """Индивидуальные настройки пользователя приложения.

    Хранит пользовательскую конфигурацию учёта: валюту отображения,
    выбранный тип снапшота, перечни категорий доходов и расходов,
    список счетов и стартовые балансы по счетам. Связь с :class:`User`
    выполняется один-к-одному через общий идентификатор ``user_id``.

    Attributes:
        user_id: Идентификатор пользователя — владельца настроек,
            ссылается на :class:`User` и каскадно удаляется вместе с ним.
        currency: Код валюты по умолчанию для отображения сумм.
        snapshot_type: Тип снапшота, выбранный пользователем
            (например, ``monthly`` или ``weekly``).
        income_categories: Список категорий доходов пользователя.
        expense_categories: Список категорий расходов пользователя.
        accounts: Список счетов пользователя.
        initial_capital: Стартовый капитал в разрезе счетов в формате
            ``{название_счёта: сумма}``.
    """

    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.user_id", ondelete="CASCADE"),
        primary_key=True,
    )
    currency: Mapped[str] = mapped_column(Text, nullable=False)
    snapshot_type: Mapped[str] = mapped_column(Text, nullable=False)
    income_categories: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    expense_categories: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    accounts: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    initial_capital: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)
