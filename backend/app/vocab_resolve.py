"""Resolve the effective term list for a category, honoring derived categories.

A base/standalone category returns its own terms. A derived category (from_keys
non-empty, e.g. IRWD) unions its sources, de-duplicated by canon.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import Category, Term
from .services.matcher import VocabTerm


def _terms_of(db: Session, cat_key: str) -> list[Term]:
    stmt = (
        select(Term)
        .where(Term.category_key == cat_key)
        .options(selectinload(Term.aliases))
        .order_by(Term.created_at)
    )
    return list(db.scalars(stmt))


def resolve_terms(db: Session, cat_key: str) -> list[Term]:
    cat = db.get(Category, cat_key)
    if cat is None:
        return []
    if cat.from_keys:
        seen: set[str] = set()
        out: list[Term] = []
        for src in cat.from_keys:
            for t in _terms_of(db, src):
                if t.canon not in seen:
                    seen.add(t.canon)
                    out.append(t)
        return out
    return _terms_of(db, cat_key)


def to_vocab(terms: list[Term]) -> list[VocabTerm]:
    return [
        VocabTerm(
            key=t.id,
            canon=t.canon,
            th=t.th,
            aliases=[a.text for a in t.aliases],
            category=t.category_key,
        )
        for t in terms
    ]
