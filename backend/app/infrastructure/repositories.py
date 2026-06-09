"""SQLAlchemy adapters implementing the domain repository ports. These are the
only place ORM rows are mapped to/from domain entities."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from ..domain.entities import Category, LogEntry, ParsedTerm, Term, TrainFile
from .orm import AliasORM, CategoryORM, LogEntryORM, TermORM, TrainFileORM


# ---- mappers ----
def _to_category(o: CategoryORM) -> Category:
    return Category(key=o.key, label=o.label, is_base=o.is_base, from_keys=list(o.from_keys or []), hidden=o.hidden)


def _to_term(o: TermORM) -> Term:
    return Term(
        id=o.id, category_key=o.category_key, canon=o.canon, th=o.th,
        is_base=o.is_base, confirmed=o.confirmed, aliases=[a.text for a in o.aliases],
    )


def _to_trainfile(o: TrainFileORM) -> TrainFile:
    return TrainFile(id=o.id, category_key=o.category_key, name=o.name, rows=o.rows, created_at=o.created_at)


def _to_log(o: LogEntryORM) -> LogEntry:
    return LogEntry(id=o.id, actor=o.actor, action=o.action, detail=o.detail, created_at=o.created_at)


class SqlVocabRepository:
    def __init__(self, db: Session):
        self.db = db

    # categories
    def list_categories(self) -> list[Category]:
        stmt = select(CategoryORM).where(CategoryORM.hidden.is_(False)).order_by(CategoryORM.created_at)
        return [_to_category(c) for c in self.db.scalars(stmt)]

    def get_category(self, key: str) -> Category | None:
        o = self.db.get(CategoryORM, key)
        return _to_category(o) if o else None

    def add_category(self, key: str, label: str, from_keys: list[str]) -> Category:
        o = CategoryORM(key=key, label=label, is_base=False, from_keys=from_keys)
        self.db.add(o)
        self.db.commit()
        self.db.refresh(o)
        return _to_category(o)

    def unhide_category(self, key: str, label: str) -> Category:
        o = self.db.get(CategoryORM, key)
        o.hidden = False
        o.label = label or o.label
        self.db.commit()
        self.db.refresh(o)
        return _to_category(o)

    def hide_category(self, key: str) -> None:
        o = self.db.get(CategoryORM, key)
        o.hidden = True
        self.db.commit()

    def delete_category(self, key: str) -> None:
        o = self.db.get(CategoryORM, key)
        self.db.delete(o)
        self.db.commit()

    def categories_using(self, key: str) -> list[str]:
        cats = self.db.scalars(select(CategoryORM).where(CategoryORM.hidden.is_(False)))
        return [c.key for c in cats if key in (c.from_keys or [])]

    # terms
    def _terms_orm(self, cat_key: str) -> list[TermORM]:
        stmt = (
            select(TermORM).where(TermORM.category_key == cat_key)
            .options(selectinload(TermORM.aliases)).order_by(TermORM.created_at)
        )
        return list(self.db.scalars(stmt))

    def list_terms(self, cat_key: str) -> list[Term]:
        return [_to_term(o) for o in self._terms_orm(cat_key)]

    def resolve_terms(self, cat_key: str) -> list[Term]:
        cat = self.db.get(CategoryORM, cat_key)
        if cat is None:
            return []
        if cat.from_keys:
            seen: set[str] = set()
            out: list[Term] = []
            for src in cat.from_keys:
                for o in self._terms_orm(src):
                    if o.canon not in seen:
                        seen.add(o.canon)
                        out.append(_to_term(o))
            return out
        return self.list_terms(cat_key)

    def get_term(self, term_id: str) -> Term | None:
        o = self.db.get(TermORM, term_id)
        return _to_term(o) if o else None

    def add_term(self, cat_key: str, canon: str, th: str) -> Term:
        o = TermORM(category_key=cat_key, canon=canon, th=th)
        self.db.add(o)
        self.db.commit()
        self.db.refresh(o)
        return _to_term(o)

    def update_term(self, term_id, *, canon=None, th=None, confirmed=None) -> Term:
        o = self.db.get(TermORM, term_id)
        if canon is not None and canon.strip():
            o.canon = canon.strip()
        if th is not None and th.strip():
            o.th = th.strip()
        if confirmed is not None:
            o.confirmed = confirmed
        self.db.commit()
        self.db.refresh(o)
        return _to_term(o)

    def delete_term(self, term_id: str) -> None:
        o = self.db.get(TermORM, term_id)
        self.db.delete(o)
        self.db.commit()

    def add_alias(self, term_id: str, text: str) -> Term:
        o = self.db.get(TermORM, term_id)
        if text not in [a.text for a in o.aliases]:
            self.db.add(AliasORM(term_id=term_id, text=text))
            self.db.commit()
            self.db.refresh(o)
        return _to_term(o)

    def remove_alias(self, term_id: str, text: str) -> Term:
        o = self.db.get(TermORM, term_id)
        for a in list(o.aliases):
            if a.text == text:
                self.db.delete(a)
        self.db.commit()
        self.db.refresh(o)
        return _to_term(o)

    def merge_terms(self, cat_key: str, parsed: list[ParsedTerm]) -> tuple[int, int]:
        existing = self._terms_orm(cat_key)
        by_canon = {t.canon.lower(): t for t in existing}
        added_terms = added_aliases = 0
        for pt in parsed:
            key = pt.canon.lower()
            o = by_canon.get(key)
            if o is None:
                o = TermORM(category_key=cat_key, canon=pt.canon, th=pt.th or pt.canon)
                o.aliases = [AliasORM(text=a) for a in pt.aliases]
                self.db.add(o)
                by_canon[key] = o
                added_terms += 1
                added_aliases += len(pt.aliases)
            else:
                have = {a.text.lower() for a in o.aliases}
                for a in pt.aliases:
                    if a.lower() not in have:
                        o.aliases.append(AliasORM(text=a))
                        have.add(a.lower())
                        added_aliases += 1
        self.db.commit()
        return added_terms, added_aliases


class SqlTrainRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, category: str | None) -> list[TrainFile]:
        stmt = select(TrainFileORM).order_by(TrainFileORM.created_at.desc())
        if category:
            stmt = stmt.where(TrainFileORM.category_key == category)
        return [_to_trainfile(o) for o in self.db.scalars(stmt)]

    def add(self, category: str, name: str, rows: int) -> TrainFile:
        o = TrainFileORM(category_key=category, name=name, rows=rows)
        self.db.add(o)
        self.db.commit()
        self.db.refresh(o)
        return _to_trainfile(o)

    def delete(self, file_id: str) -> bool:
        o = self.db.get(TrainFileORM, file_id)
        if o is None:
            return False
        self.db.delete(o)
        self.db.commit()
        return True


class SqlLogRepository:
    def __init__(self, db: Session):
        self.db = db

    def write(self, actor: str, action: str, detail: str = "") -> None:
        self.db.add(LogEntryORM(actor=actor or "ผู้ใช้", action=action, detail=detail))
        self.db.commit()

    def list(self, limit: int = 200) -> list[LogEntry]:
        stmt = select(LogEntryORM).order_by(LogEntryORM.created_at.desc()).limit(limit)
        return [_to_log(o) for o in self.db.scalars(stmt)]

    def clear(self) -> None:
        self.db.execute(delete(LogEntryORM))
        self.db.commit()
