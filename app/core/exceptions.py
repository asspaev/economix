class AppError(Exception):
    """Базовый класс прикладных исключений сервиса.

    Все доменные исключения наследуются от него, чтобы слой API мог
    однозначно отличать ожидаемые ошибки бизнес-логики от непредвиденных
    программных и инфраструктурных сбоев.
    """


class UsernameAlreadyTakenError(AppError):
    """Имя пользователя уже занято другой учётной записью.

    Возбуждается сервисом регистрации при попытке создать пользователя
    с уже существующим в БД ``username``.
    """


class InvalidCredentialsError(AppError):
    """Учётные данные не соответствуют ни одной учётной записи.

    Возбуждается сервисом аутентификации, когда пользователь с указанным
    ``username`` не найден или пароль не совпадает с сохранённым хэшем.
    """


class OnboardingIncompleteError(AppError):
    """Состояние онбординга в Redis заполнено не полностью.

    Возбуждается сервисом онбординга при попытке завершить процесс, когда
    в Redis-ключе пользователя отсутствуют обязательные поля.

    Attributes:
        missing: Перечень отсутствующих ключей состояния онбординга.
    """

    def __init__(self, missing: list[str]) -> None:
        super().__init__(f"Onboarding state is incomplete: {missing}")
        self.missing = missing


class OnboardingAlreadyCompletedError(AppError):
    """Пользователь уже прошёл онбординг.

    Возбуждается сервисом онбординга, если у пользователя уже существует
    запись :class:`UserSettings`.
    """


class CategoryNotFoundError(AppError):
    """Категория с указанным ``category_id`` у пользователя не найдена.

    Возбуждается сервисом категорий, когда обращение идёт к чужой или
    несуществующей категории.
    """


class InvalidCategoryTypeError(AppError):
    """Передан неизвестный тип категории.

    Допустимые значения — ``INCOME``, ``EXPENSE``, ``ACCOUNT``.
    """


class DuplicateCategoryNameError(AppError):
    """Имя категории уже занято другой активной категорией того же типа."""


class ArchivedCategoryError(AppError):
    """Попытка изменить поля категории, помещённой в архив."""


class InvalidSnapshotKeyError(AppError):
    """Передан ключ снапшота в недопустимом формате.

    Ожидается строка вида ``YYYY-MM`` с месяцем от ``01`` до ``12``.
    """


class UnknownCategoryInSnapshotError(AppError):
    """В пейлоаде снапшота указано несуществующее у пользователя имя категории.

    Attributes:
        category_names: Перечень имён, которых нет среди активных категорий.
    """

    def __init__(self, category_names: list[str]) -> None:
        super().__init__(f"Unknown category names in snapshot: {category_names}")
        self.category_names = category_names
