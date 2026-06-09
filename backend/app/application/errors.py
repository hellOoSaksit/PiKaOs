"""Application-level error carrying an HTTP-ish status, mapped to a response by
the interface layer (so application code never imports FastAPI)."""


class ServiceError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status
