"""Seed the IR vocabulary from the standard IR website sitemap
(ir_sitemap.json). Only the real IR data is seeded — each term keeps its menu
section so the page→module structure from the sitemap is preserved."""
import json
import pathlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from .orm import AliasORM, CategoryORM, TermORM

_IR_JSON = json.loads((pathlib.Path(__file__).parent / "ir_sitemap.json").read_text(encoding="utf-8"))


def ir_rows() -> list[dict]:
    """Flatten the IR sitemap, de-duplicated by canon (aliases merged); each row
    keeps the section (menu) it first appeared under."""
    out: dict[str, dict] = {}
    for sec in _IR_JSON["sections"]:
        for t in sec["terms"]:
            key = t["canon"].lower()
            if key not in out:
                out[key] = {"canon": t["canon"], "th": t["th"], "aliases": list(t["aliases"]), "section": sec["name"]}
            else:
                for a in t["aliases"]:
                    if a not in out[key]["aliases"]:
                        out[key]["aliases"].append(a)
    return list(out.values())


def seed(db: Session) -> None:
    if db.scalar(select(CategoryORM).limit(1)) is not None:
        return  # already seeded

    ir = _IR_JSON["category"]
    db.add(CategoryORM(key=ir["key"], label=ir["label"], is_base=True, from_keys=[]))
    for r in ir_rows():
        term = TermORM(category_key=ir["key"], canon=r["canon"], th=r["th"], section=r["section"], is_base=True)
        term.aliases = [AliasORM(text=a) for a in r["aliases"]]
        db.add(term)
    db.commit()
