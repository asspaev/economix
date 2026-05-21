from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidCredentialsError, UsernameAlreadyTakenError
from app.crud import user as user_crud
from app.crud import user_category as user_category_crud
from app.crud import user_settings as user_settings_crud
from app.models.user import User
from app.services.jwt import JwtService, jwt_service

ACCOUNT_CATEGORY_TYPE = "ACCOUNT"


async def build_auth_claims(session: AsyncSession, user_id: int) -> dict[str, Any]:
    """Собирает дополнительные claim'ы для JWT по состоянию пользователя.

    Поле ``onboarding_required`` сигнализирует фронтенду о необходимости
    запустить онбординг. Поле ``initial_capital`` содержит стартовые
    остатки счетов пользователя — это устраняет необходимость отдельного
    запроса к БД из обработчиков, которым нужны эти значения.

    Args:
        session: Активная сессия SQLAlchemy.
        user_id: Идентификатор пользователя.

    Returns:
        Словарь дополнительных полей JWT.
    """
    settings = await user_settings_crud.get_by_user_id(session, user_id)
    if settings is None:
        return {"onboarding_required": True, "initial_capital": {}}
    accounts = await user_category_crud.list_by_user(
        session,
        user_id,
        type_=ACCOUNT_CATEGORY_TYPE,
    )
    initial_capital = {
        account.name: account.initial_capital
        for account in accounts
        if account.initial_capital is not None
    }
    return {"onboarding_required": False, "initial_capital": initial_capital}


class AuthService:
    """Сервис регистрации и аутентификации пользователей.

    Объединяет операции над хранилищем пользователей и сервис JWT, чтобы
    инкапсулировать всю бизнес-логику аутентификации и оставить слою API
    только формирование HTTP-ответов.

    Attributes:
        _jwt: Сервис выпуска JWT и работы с bcrypt-хэшами паролей.
    """

    def __init__(self, jwt: JwtService) -> None:
        """Инициализирует сервис заданной зависимостью JWT.

        Args:
            jwt: Сервис JWT, используемый для хэширования паролей
                и выпуска access-токенов.
        """
        self._jwt = jwt

    async def register(
        self,
        session: AsyncSession,
        username: str,
        password: str,
    ) -> tuple[User, str]:
        """Регистрирует нового пользователя и выпускает access-токен.

        Новый пользователь всегда обязан пройти онбординг, поэтому в JWT
        записывается ``onboarding_required=True``.

        Args:
            session: Активная сессия SQLAlchemy.
            username: Желаемое имя пользователя.
            password: Пароль пользователя в открытом виде.

        Returns:
            Кортеж из созданной учётной записи и подписанного JWT.

        Raises:
            UsernameAlreadyTakenError: Если пользователь с таким именем
                уже существует.
        """
        existing = await user_crud.get_by_username(session, username)
        if existing is not None:
            raise UsernameAlreadyTakenError(username)
        user = await user_crud.create(
            session,
            username=username,
            password_hash=self._jwt.hash_password(password),
        )
        token = self._jwt.create_token(
            subject=user.user_id,
            extra_claims={"onboarding_required": True, "initial_capital": {}},
        )
        return user, token

    async def login(
        self,
        session: AsyncSession,
        username: str,
        password: str,
    ) -> tuple[User, str]:
        """Аутентифицирует пользователя и выпускает access-токен.

        В JWT добавляются поля ``onboarding_required`` и ``initial_capital``,
        вычисляемые по текущему состоянию пользователя в БД.

        Args:
            session: Активная сессия SQLAlchemy.
            username: Имя пользователя.
            password: Пароль пользователя в открытом виде.

        Returns:
            Кортеж из найденной учётной записи и подписанного JWT.

        Raises:
            InvalidCredentialsError: Если пользователь не найден или пароль
                не соответствует сохранённому хэшу.
        """
        user = await user_crud.get_by_username(session, username)
        if user is None or not self._jwt.verify_password(password, user.password_hash):
            raise InvalidCredentialsError()
        claims = await build_auth_claims(session, user.user_id)
        token = self._jwt.create_token(subject=user.user_id, extra_claims=claims)
        return user, token


auth_service = AuthService(jwt_service)
