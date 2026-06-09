"""Seed the base vocabulary: IR from the standard IR website sitemap
(ir_sitemap.json) and WD inline, plus the derived IR+WD category."""
import json
import pathlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from .orm import AliasORM, CategoryORM, TermORM

_IR_JSON = json.loads((pathlib.Path(__file__).parent / "ir_sitemap.json").read_text(encoding="utf-8"))

WD_LABEL = "WD · ข้อมูลเปิดเผยบนเว็บ"
WD_VOCAB = [
    ("Vision & Mission", "วิสัยทัศน์และพันธกิจ", ["วิสัยทัศน์", "vision"]),
    ("Company History", "จากวันวานถึงวันนี้", ["ประวัติบริษัท", "ความเป็นมา", "history", "from our early days until today"]),
    ("Board of Directors", "คณะกรรมการบริษัท", ["กรรมการ", "คณะกรรมการธนาคาร", "board of directors", "board of director"]),
    ("Executive Management", "ผู้บริหารระดับสูง", ["คณะผู้บริหาร", "senior executive officers", "senior management", "executives"]),
    ("Business Strategy", "กลยุทธ์องค์กร", ["กลยุทธ์ธนาคาร", "strategy", "strategic plan"]),
    ("Corporate Governance", "การกำกับดูแลกิจการ", ["CG", "บรรษัทภิบาล"]),
    ("Nomination Policy", "นโยบายสรรหากรรมการ", ["การสรรหา", "nomination"]),
    ("Anti-Corruption", "นโยบายต่อต้านทุจริต", ["CAC", "คอร์รัปชัน"]),
    ("Awards & Recognition", "รางวัลแห่งความสำเร็จ", ["รางวัล", "awards", "awards and ranking", "awards rankings"]),
    ("Sustainability", "ความยั่งยืน", ["ESG", "รายงานความยั่งยืน"]),
]


def ir_terms() -> list[dict]:
    """Flatten the IR sitemap sections, de-duplicated by canon (aliases merged)."""
    out: dict[str, dict] = {}
    for sec in _IR_JSON["sections"]:
        for t in sec["terms"]:
            key = t["canon"].lower()
            if key not in out:
                out[key] = {"canon": t["canon"], "th": t["th"], "aliases": list(t["aliases"])}
            else:
                for a in t["aliases"]:
                    if a not in out[key]["aliases"]:
                        out[key]["aliases"].append(a)
    return list(out.values())


def seed(db: Session) -> None:
    if db.scalar(select(CategoryORM).limit(1)) is not None:
        return  # already seeded

    # IR — from the standard IR website sitemap
    ir = _IR_JSON["category"]
    db.add(CategoryORM(key=ir["key"], label=ir["label"], is_base=True, from_keys=[]))
    for t in ir_terms():
        term = TermORM(category_key=ir["key"], canon=t["canon"], th=t["th"], is_base=True)
        term.aliases = [AliasORM(text=a) for a in t["aliases"]]
        db.add(term)

    # WD — web-disclosure essentials
    db.add(CategoryORM(key="WD", label=WD_LABEL, is_base=True, from_keys=[]))
    for canon, th, aliases in WD_VOCAB:
        term = TermORM(category_key="WD", canon=canon, th=th, is_base=True)
        term.aliases = [AliasORM(text=a) for a in aliases]
        db.add(term)

    db.add(CategoryORM(key="IRWD", label="IR + WD", is_base=False, from_keys=["IR", "WD"]))
    db.commit()
