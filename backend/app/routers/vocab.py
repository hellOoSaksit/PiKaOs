"""Term + alias CRUD for a category, plus the merged-vocab read used by the UI's
'Map คำศัพท์' tab. Derived categories are read-only (edit the source instead)."""
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Alias, Category, Term
from ..schemas import AliasCreate, TermCreate, TermOut, TermUpdate
from ..vocab_resolve import resolve_terms
from .logs import write_log

router = APIRouter(prefix="/sitemap", tags=["vocab"])


def _require_editable(db: Session, cat_key: str) -> Category:
    cat = db.get(Category, cat_key)
    if cat is None:
        raise HTTPException(404, "category not found")
    if cat.from_keys:
        raise HTTPException(409, "derived category is read-only — edit its source")
    return cat


@router.get("/vocab/{cat_key}", response_model=list[TermOut])
def merged_vocab(cat_key: str, db: Session = Depends(get_db)):
    """Effective terms for a category (unions sources for derived categories)."""
    if db.get(Category, cat_key) is None:
        raise HTTPException(404, "category not found")
    return resolve_terms(db, cat_key)


@router.post("/vocab/{cat_key}/terms", response_model=TermOut, status_code=201)
def add_term(
    cat_key: str,
    body: TermCreate,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    _require_editable(db, cat_key)
    canon = body.canon.strip()
    if not canon:
        raise HTTPException(400, "canon required")
    term = Term(category_key=cat_key, canon=canon, th=(body.th or canon).strip())
    db.add(term)
    db.commit()
    write_log(db, actor, "เพิ่มคำหลัก", f"{canon} · หมวด {cat_key}")
    db.refresh(term)
    return term


@router.patch("/terms/{term_id}", response_model=TermOut)
def update_term(
    term_id: str,
    body: TermUpdate,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    term = db.get(Term, term_id)
    if term is None:
        raise HTTPException(404, "term not found")
    changed = []
    if body.canon is not None and body.canon.strip():
        write_log(db, actor, "แก้คำหลัก", f"{term.canon} → {body.canon.strip()}")
        term.canon = body.canon.strip()
        changed.append("canon")
    if body.th is not None and body.th.strip():
        term.th = body.th.strip()
        changed.append("th")
    if body.confirmed is not None:
        term.confirmed = body.confirmed
        if body.confirmed:
            write_log(db, actor, "เพิ่มศัพท์ (ยืนยันไม่ชัด)", term.canon)
    db.commit()
    db.refresh(term)
    return term


@router.delete("/terms/{term_id}", status_code=204)
def delete_term(
    term_id: str,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    term = db.get(Term, term_id)
    if term is None:
        raise HTTPException(404, "term not found")
    write_log(db, actor, "ลบคำหลัก", f"{term.canon} · หมวด {term.category_key}")
    db.delete(term)
    db.commit()


@router.post("/terms/{term_id}/aliases", response_model=TermOut, status_code=201)
def add_alias(
    term_id: str,
    body: AliasCreate,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    term = db.get(Term, term_id)
    if term is None:
        raise HTTPException(404, "term not found")
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "alias text required")
    if text not in [a.text for a in term.aliases]:
        db.add(Alias(term_id=term_id, text=text))
        db.commit()
        write_log(db, actor, "เพิ่มคำ map", f"{text} → {term.canon}")
        db.refresh(term)
    return term


@router.delete("/terms/{term_id}/aliases/{text}", response_model=TermOut)
def remove_alias(
    term_id: str,
    text: str,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    term = db.get(Term, term_id)
    if term is None:
        raise HTTPException(404, "term not found")
    for a in list(term.aliases):
        if a.text == text:
            db.delete(a)
            write_log(db, actor, "ลบคำ map", f"{text} · {term.canon}")
    db.commit()
    db.refresh(term)
    return term
