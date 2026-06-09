"""Excel/CSV training upload: parse a file into terms, merge them into the
category's vocabulary (new canons added, existing canons gain new aliases), and
record the file's metadata."""
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Alias, Category, Term, TrainFile
from ..schemas import TrainOut
from ..services import excel
from .logs import write_log

router = APIRouter(prefix="/sitemap/train", tags=["train"])


@router.get("", response_model=list[TrainOut])
def list_train(category: str | None = None, db: Session = Depends(get_db)):
    stmt = select(TrainFile).order_by(TrainFile.created_at.desc())
    if category:
        stmt = stmt.where(TrainFile.category_key == category)
    return list(db.scalars(stmt))


@router.post("", response_model=TrainOut, status_code=201)
async def upload_train(
    category: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: str = Header(default="ผู้ใช้", alias="X-Actor"),
):
    cat = db.get(Category, category)
    if cat is None:
        raise HTTPException(404, "category not found")
    if cat.from_keys:
        raise HTTPException(409, "cannot train a derived category — train its source")

    data = await file.read()
    try:
        parsed, row_count = excel.parse(file.filename, data)
    except Exception as e:
        raise HTTPException(400, f"could not parse file: {type(e).__name__}")
    if not parsed:
        raise HTTPException(400, "no usable rows found in file")

    existing = list(
        db.scalars(
            select(Term).where(Term.category_key == category).options(selectinload(Term.aliases))
        )
    )
    by_canon = {t.canon.lower(): t for t in existing}

    added_terms = 0
    added_aliases = 0
    for pt in parsed:
        key = pt.canon.lower()
        term = by_canon.get(key)
        if term is None:
            term = Term(category_key=category, canon=pt.canon, th=pt.th or pt.canon)
            term.aliases = [Alias(text=a) for a in pt.aliases]
            db.add(term)
            by_canon[key] = term
            added_terms += 1
            added_aliases += len(pt.aliases)
        else:
            have = {a.text.lower() for a in term.aliases}
            for a in pt.aliases:
                if a.lower() not in have:
                    term.aliases.append(Alias(text=a))
                    have.add(a.lower())
                    added_aliases += 1

    tf = TrainFile(category_key=category, name=file.filename, rows=row_count)
    db.add(tf)
    db.commit()
    write_log(
        db, actor, "เพิ่มไฟล์ Excel",
        f"{file.filename} · หมวด {category} · +{added_terms} คำหลัก / +{added_aliases} alias",
    )
    db.refresh(tf)
    return tf


@router.delete("/{file_id}", status_code=204)
def delete_train(file_id: str, db: Session = Depends(get_db)):
    tf = db.get(TrainFile, file_id)
    if tf is None:
        raise HTTPException(404, "not found")
    db.delete(tf)
    db.commit()
