"""Audit log endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import LogEntry
from ..schemas import LogOut

router = APIRouter(prefix="/sitemap/log", tags=["log"])


def write_log(db: Session, actor: str, action: str, detail: str = "") -> None:
    db.add(LogEntry(actor=actor or "ผู้ใช้", action=action, detail=detail))
    db.commit()


@router.get("", response_model=list[LogOut])
def list_log(db: Session = Depends(get_db)):
    stmt = select(LogEntry).order_by(LogEntry.created_at.desc()).limit(200)
    return list(db.scalars(stmt))


@router.delete("", status_code=204)
def clear_log(db: Session = Depends(get_db)):
    db.execute(delete(LogEntry))
    db.commit()
