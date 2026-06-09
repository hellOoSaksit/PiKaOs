"""Use cases for categories + vocabulary terms/aliases."""
from __future__ import annotations

from ..domain.entities import Category, Term
from ..domain.ports import LogRepository, VocabRepository
from .errors import ServiceError


class VocabService:
    def __init__(self, repo: VocabRepository, log: LogRepository):
        self.repo = repo
        self.log = log

    # ---- categories ----
    def list_categories(self) -> list[Category]:
        return self.repo.list_categories()

    def create_category(self, key: str, label: str | None, from_keys: list[str], actor: str) -> Category:
        key = key.strip()
        if not key:
            raise ServiceError("key required")
        existing = self.repo.get_category(key)
        if existing and not existing.hidden:
            raise ServiceError(f"category '{key}' already exists", 409)
        for src in from_keys:
            if self.repo.get_category(src) is None:
                raise ServiceError(f"source category '{src}' not found")
        cat = (
            self.repo.unhide_category(key, label or key)
            if existing and existing.hidden
            else self.repo.add_category(key, label or key, from_keys)
        )
        self.log.write(actor, "เพิ่มหมวด", key)
        return cat

    def delete_category(self, key: str, actor: str) -> None:
        cat = self.repo.get_category(key)
        if cat is None:
            raise ServiceError("not found", 404)
        used_by = self.repo.categories_using(key)
        if used_by:
            raise ServiceError(f"used by combined category: {', '.join(used_by)}", 409)
        if cat.is_base:
            self.repo.hide_category(key)  # base categories are hidden, never destroyed
        else:
            self.repo.delete_category(key)
        self.log.write(actor, "ลบหมวด", key)

    # ---- terms ----
    def _editable(self, cat_key: str) -> Category:
        cat = self.repo.get_category(cat_key)
        if cat is None:
            raise ServiceError("category not found", 404)
        if cat.is_derived:
            raise ServiceError("derived category is read-only — edit its source", 409)
        return cat

    def merged_vocab(self, cat_key: str) -> list[Term]:
        if self.repo.get_category(cat_key) is None:
            raise ServiceError("category not found", 404)
        return self.repo.resolve_terms(cat_key)

    def add_term(self, cat_key: str, canon: str, th: str, actor: str) -> Term:
        self._editable(cat_key)
        canon = canon.strip()
        if not canon:
            raise ServiceError("canon required")
        term = self.repo.add_term(cat_key, canon, (th or canon).strip())
        self.log.write(actor, "เพิ่มคำหลัก", f"{canon} · หมวด {cat_key}")
        return term

    def update_term(self, term_id: str, canon: str | None, th: str | None, confirmed: bool | None, actor: str) -> Term:
        old = self.repo.get_term(term_id)
        if old is None:
            raise ServiceError("term not found", 404)
        if canon is not None and canon.strip():
            self.log.write(actor, "แก้คำหลัก", f"{old.canon} → {canon.strip()}")
        term = self.repo.update_term(term_id, canon=canon, th=th, confirmed=confirmed)
        if confirmed:
            self.log.write(actor, "เพิ่มศัพท์ (ยืนยันไม่ชัด)", term.canon)
        return term

    def delete_term(self, term_id: str, actor: str) -> None:
        term = self.repo.get_term(term_id)
        if term is None:
            raise ServiceError("term not found", 404)
        self.repo.delete_term(term_id)
        self.log.write(actor, "ลบคำหลัก", f"{term.canon} · หมวด {term.category_key}")

    def add_alias(self, term_id: str, text: str, actor: str) -> Term:
        term = self.repo.get_term(term_id)
        if term is None:
            raise ServiceError("term not found", 404)
        text = text.strip()
        if not text:
            raise ServiceError("alias text required")
        if text not in term.aliases:
            term = self.repo.add_alias(term_id, text)
            self.log.write(actor, "เพิ่มคำ map", f"{text} → {term.canon}")
        return term

    def remove_alias(self, term_id: str, text: str, actor: str) -> Term:
        term = self.repo.get_term(term_id)
        if term is None:
            raise ServiceError("term not found", 404)
        if text in term.aliases:
            term = self.repo.remove_alias(term_id, text)
            self.log.write(actor, "ลบคำ map", f"{text} · {term.canon}")
        return term
