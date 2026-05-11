from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidCredentialsError, UsernameAlreadyTakenError
from app.crud import user as user_crud
from app.models.user import User
from app.services.jwt import JwtService, jwt_service


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
        token = self._jwt.create_token(subject=user.user_id)
        return user, token

    async def login(
        self,
        session: AsyncSession,
        username: str,
        password: str,
    ) -> tuple[User, str]:
        """Аутентифицирует пользователя и выпускает access-токен.

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
        token = self._jwt.create_token(subject=user.user_id)
        return user, token


auth_service = AuthService(jwt_service)
