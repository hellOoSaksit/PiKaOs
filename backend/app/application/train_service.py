"""Use cases for Excel/CSV training upload, template and vocabulary export."""
from __future__ import annotations

from ..domain.entities import ParsedTerm, TrainFile
from ..domain.ports import ExcelGateway, LogRepository, TrainRepository, VocabRepository
from .errors import ServiceError


class TrainService:
    def __init__(self, vocab: VocabRepository, train: TrainRepository, excel: ExcelGateway, log: LogRepository):
        self.vocab = vocab
        self.train = train
        self.excel = excel
        self.log = log

    def list(self, category: str | None) -> list[TrainFile]:
        return self.train.list(category)

    def upload(self, category: str, filename: str, data: bytes, actor: str) -> TrainFile:
        cat = self.vocab.get_category(category)
        if cat is None:
            raise ServiceError("category not found", 404)
        if cat.is_derived:
            raise ServiceError("cannot train a derived category — train its source", 409)
        try:
            parsed, row_count = self.excel.parse(filename, data)
        except Exception as e:  # noqa: BLE001 — surface parse failures as 400
            raise ServiceError(f"could not parse file: {type(e).__name__}") from e
        if not parsed:
            raise ServiceError("no usable rows found in file")

        added_terms, added_aliases = self.vocab.merge_terms(category, parsed)
        tf = self.train.add(category, filename, row_count)
        self.log.write(
            actor, "เพิ่มไฟล์ Excel",
            f"{filename} · หมวด {category} · +{added_terms} คำหลัก / +{added_aliases} alias",
        )
        return tf

    def delete(self, file_id: str) -> None:
        if not self.train.delete(file_id):
            raise ServiceError("not found", 404)

    def template(self) -> bytes:
        return self.excel.build_template()

    def export(self, category: str) -> bytes:
        if self.vocab.get_category(category) is None:
            raise ServiceError("category not found", 404)
        rows = [ParsedTerm(canon=t.canon, th=t.th, aliases=t.aliases) for t in self.vocab.resolve_terms(category)]
        return self.excel.build_export(category, rows)
