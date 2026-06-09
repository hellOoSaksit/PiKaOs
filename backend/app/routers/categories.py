"""Category CRUD. Base categories (IR/WD) are hidden rather than deleted; a
category used as a source by a combined category cannot be deleted."""
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category
from ..schemas import CategoryCreate, CategoryOut
from .logs import write_log

router = APIRouter(prefix="/sitemap/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    stmt = select(Category).where(Category.hidden.is_(False)).order_by(Category.created_at)
    return list(db.scalars(stmt))


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    key = body.key.strip()
    if not key:
        raise HTTPException(400, "key required")
    existing = db.get(Category, key)
    if existing and not existing.hidden:
        raise HTTPException(409, f"category '{key}' already exists")
    # validate sources exist
    for src in body.from_keys:
        if db.get(Category, src) is None:
            raise HTTPException(400, f"source category '{src}' not found")
    if existing and existing.hidden:  # un-hide
        existing.hidden = False
        existing.label = body.label or existing.label
        cat = existing
    else:
        cat = Category(key=key, label=body.label or key, is_base=False, from_keys=body.from_keys)
        db.add(cat)
    db.commit()
    write_log(db, actor, "เพิ่มหมวด", key)
    db.refresh(cat)
    return cat


@router.delete("/{key}", status_code=204)
def delete_category(
    key: str,
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    cat = db.get(Category, key)
    if cat is None:
        raise HTTPException(404, "not found")
    used_by = [
        c.key for c in db.scalars(select(Category).where(Category.hidden.is_(False)))
        if key in (c.from_keys or [])
    ]
    if used_by:
        raise HTTPException(409, f"used by combined category: {', '.join(used_by)}")
    if cat.is_base:
        cat.hidden = True  # base categories are hidden, never destroyed
    else:
        db.delete(cat)
    db.commit()
    write_log(db, actor, "ลบหมวด", key)
