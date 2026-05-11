from collections.abc import Iterable
from typing import Final

from jwt.exceptions import InvalidTokenError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.status import HTTP_401_UNAUTHORIZED
from starlette.types import ASGIApp

from app.services.jwt import jwt_service

_ACCESS_TOKEN_COOKIE: Final[str] = "access_token"
_BEARER_SCHEME: Final[str] = "Bearer"


class JwtAuthMiddleware(BaseHTTPMiddleware):
    """ASGI-мидлвара, пропускающая только аутентифицированные запросы.

    Извлекает JWT из заголовка ``Authorization: Bearer <token>`` или
    из cookie ``access_token``, валидирует его через :class:`JwtService`
    и сохраняет полезную нагрузку в ``request.state.token_payload`` для
    последующих обработчиков. Запросы, путь которых совпадает с одним
    из ``public_paths`` или начинается с него, пропускаются без проверки.

    Attributes:
        _public_paths: Кортеж префиксов URL, не требующих аутентификации.
    """

    def __init__(self, app: ASGIApp, public_paths: Iterable[str] = ()) -> None:
        """Инициализирует мидлвару списком публичных префиксов путей.

        Args:
            app: ASGI-приложение, оборачиваемое мидлварой.
            public_paths: Префиксы путей, не требующих JWT (например,
                эндпоинты входа, регистрации и OpenAPI-документации).
        """
        super().__init__(app)
        self._public_paths = tuple(public_paths)

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Валидирует JWT и передаёт запрос дальше при успехе.

        Args:
            request: Входящий HTTP-запрос Starlette.
            call_next: Следующее звено цепочки ASGI-обработчиков.

        Returns:
            Ответ обработчика для аутентифицированных запросов либо
            JSON-ответ со статусом 401, если токен отсутствует или
            не прошёл валидацию.
        """
        if self._is_public(request.url.path):
            return await call_next(request)

        token = self._extract_token(request)
        if token is None:
            return self._unauthorized("Not authenticated")

        try:
            payload = jwt_service.decode_token(token)
        except InvalidTokenError:
            return self._unauthorized("Invalid authentication credentials")

        request.state.token_payload = payload
        return await call_next(request)

    def _is_public(self, path: str) -> bool:
        """Проверяет, попадает ли путь под один из публичных префиксов."""
        return any(
            path == prefix or path.startswith(prefix + "/")
            for prefix in self._public_paths
        )

    @staticmethod
    def _extract_token(request: Request) -> str | None:
        """Извлекает JWT из заголовка Authorization или cookie."""
        header = request.headers.get("Authorization")
        if header:
            scheme, _, credentials = header.partition(" ")
            if scheme.lower() == _BEARER_SCHEME.lower() and credentials:
                return credentials
        return request.cookies.get(_ACCESS_TOKEN_COOKIE)

    @staticmethod
    def _unauthorized(detail: str) -> JSONResponse:
        """Формирует JSON-ответ 401 с заголовком WWW-Authenticate."""
        return JSONResponse(
            status_code=HTTP_401_UNAUTHORIZED,
            content={"detail": detail},
            headers={"WWW-Authenticate": _BEARER_SCHEME},
        )
