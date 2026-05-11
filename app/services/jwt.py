from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError

from app.config import JwtConfig, settings


class JwtService:
    """Сервис аутентификации на основе JWT и bcrypt.

    Инкапсулирует операции с паролями (хэширование и проверка) и токенами
    доступа (выпуск, валидация и извлечение полезной нагрузки). Использует
    :class:`JwtConfig` для получения секретного ключа, алгоритма подписи
    и сроков жизни токенов.

    Attributes:
        _config: Конфигурация JWT, заданная при инициализации сервиса.
    """

    def __init__(self, config: JwtConfig) -> None:
        """Инициализирует сервис заданной конфигурацией.

        Args:
            config: Конфигурация JWT-аутентификации.
        """
        self._config = config

    def hash_password(self, password: str) -> str:
        """Вычисляет bcrypt-хэш пароля.

        Args:
            password: Пароль пользователя в открытом виде.

        Returns:
            Строковое представление bcrypt-хэша, пригодное для хранения
            в БД и передачи в :meth:`verify_password`.
        """
        salt = bcrypt.gensalt(rounds=self._config.bcrypt_rounds)
        hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
        return hashed.decode("utf-8")

    def verify_password(self, password: str, password_hash: str) -> bool:
        """Проверяет соответствие пароля сохранённому bcrypt-хэшу.

        Args:
            password: Пароль пользователя в открытом виде.
            password_hash: Ранее сохранённый bcrypt-хэш пароля.

        Returns:
            ``True``, если пароль соответствует хэшу, иначе ``False``.
        """
        return bcrypt.checkpw(
            password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )

    def create_token(
        self,
        subject: str | int,
        extra_claims: dict[str, Any] | None = None,
        expires_in: timedelta | None = None,
    ) -> str:
        """Выпускает подписанный JWT для указанного субъекта.

        Args:
            subject: Идентификатор субъекта (обычно ``user_id``),
                сохраняемый в стандартное поле ``sub``.
            extra_claims: Дополнительные пользовательские поля payload.
                Не могут переопределять зарезервированные поля
                (``sub``, ``iat``, ``exp``, ``iss``).
            expires_in: Явный срок жизни токена. Если не задан, берётся
                из конфигурации (:attr:`JwtConfig.access_token_expire_minutes`).

        Returns:
            Закодированный JWT в виде строки.
        """
        now = datetime.now(UTC)
        lifetime = expires_in or timedelta(minutes=self._config.access_token_expire_minutes)
        payload: dict[str, Any] = {
            **(extra_claims or {}),
            "sub": str(subject),
            "iss": self._config.issuer,
            "iat": int(now.timestamp()),
            "exp": int((now + lifetime).timestamp()),
        }
        return jwt.encode(
            payload,
            self._config.secret_key,
            algorithm=self._config.algorithm,
        )

    def decode_token(self, token: str) -> dict[str, Any]:
        """Валидирует подпись JWT и возвращает полезную нагрузку.

        Args:
            token: Закодированный JWT, переданный клиентом.

        Returns:
            Словарь с полями payload (включая ``sub``, ``iat``, ``exp``).

        Raises:
            jwt.exceptions.InvalidTokenError: Если подпись недействительна,
                токен просрочен или его структура нарушена.
        """
        return jwt.decode(
            token,
            self._config.secret_key,
            algorithms=[self._config.algorithm],
            issuer=self._config.issuer,
        )

    def is_token_valid(self, token: str) -> bool:
        """Проверяет валидность JWT без возбуждения исключения.

        Args:
            token: Закодированный JWT, переданный клиентом.

        Returns:
            ``True``, если токен валиден и не просрочен, иначе ``False``.
        """
        try:
            self.decode_token(token)
        except InvalidTokenError:
            return False
        return True

    def get_subject(self, token: str) -> str:
        """Извлекает идентификатор субъекта из валидного JWT.

        Args:
            token: Закодированный JWT, переданный клиентом.

        Returns:
            Значение поля ``sub`` из payload токена.

        Raises:
            jwt.exceptions.InvalidTokenError: Если токен невалиден или в
                payload отсутствует поле ``sub``.
        """
        payload = self.decode_token(token)
        subject = payload.get("sub")
        if subject is None:
            raise InvalidTokenError("Token payload is missing the 'sub' claim")
        return str(subject)


jwt_service = JwtService(settings.jwt)
