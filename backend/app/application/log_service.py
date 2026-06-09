"""Use case for reading/clearing the audit log."""
from __future__ import annotations

from ..domain.entities import LogEntry
from ..domain.ports import LogRepository


class LogService:
    def __init__(self, repo: LogRepository):
        self.repo = repo

    def list(self) -> list[LogEntry]:
        return self.repo.list()

    def clear(self) -> None:
        self.repo.clear()
