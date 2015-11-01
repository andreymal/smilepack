# -*- coding: utf-8 -*-


class SmilepackError(Exception):
    pass


class InternalError(SmilepackError):
    pass


class BadRequestError(SmilepackError):
    def __init__(self, message, at=None):
        super().__init__('{}: {}'.format(at, message) if at else message)
        self.message = message
        self.at = at


class JSONValidationError(BadRequestError):
    def __init__(self, original_exc):
        super().__init__(original_exc.message, at=tuple(original_exc.path))
        self.original_exc = original_exc
