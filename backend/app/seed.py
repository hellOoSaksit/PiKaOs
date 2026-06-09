"""Seed the base IR / WD vocabulary and the derived IR+WD category.

Mirrors `SM_VOCAB` and `SM_BASE_CATS` from the prototype
(GuildOS/screens-sitemap.jsx) so the ported UI starts with identical data.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Alias, Category, Term

SM_BASE_CATS = [
    ("IR", "IR · นักลงทุนสัมพันธ์"),
    ("WD", "WD · ข้อมูลเปิดเผยบนเว็บ"),
]

SM_VOCAB = {
    "IR": [
        ("Share Price", "ราคาหลักทรัพย์", ["ราคาหุ้น", "stock price", "ราคาย้อนหลัง"]),
        ("Financial Statements", "งบการเงิน", ["งบดุล", "ผลประกอบการ", "financials"]),
        ("Annual Report", "รายงานประจำปี", ["56-1 One Report", "รายงานปี"]),
        ("Dividend", "เงินปันผล", ["นโยบายปันผล", "dividend policy"]),
        ("Shareholder Structure", "โครงสร้างผู้ถือหุ้น", ["ผู้ถือหุ้นรายใหญ่", "major shareholders"]),
        ("IR Contact", "ติดต่อนักลงทุนสัมพันธ์", ["ติดต่อ IR", "investor contact"]),
    ],
    "WD": [
        ("Vision & Mission", "วิสัยทัศน์และพันธกิจ", ["วิสัยทัศน์", "vision"]),
        ("Board of Directors", "คณะกรรมการบริษัท", ["กรรมการ", "board of directors"]),
        ("Corporate Governance", "การกำกับดูแลกิจการ", ["CG", "บรรษัทภิบาล"]),
        ("Nomination Policy", "นโยบายสรรหากรรมการ", ["การสรรหา", "nomination"]),
        ("Anti-Corruption", "นโยบายต่อต้านทุจริต", ["CAC", "คอร์รัปชัน"]),
        ("Sustainability", "ความยั่งยืน", ["ESG", "รายงานความยั่งยืน"]),
    ],
}


def seed(db: Session) -> None:
    if db.scalar(select(Category).limit(1)) is not None:
        return  # already seeded

    for key, label in SM_BASE_CATS:
        db.add(Category(key=key, label=label, is_base=True, from_keys=[]))
        for canon, th, aliases in SM_VOCAB[key]:
            term = Term(category_key=key, canon=canon, th=th, is_base=True)
            term.aliases = [Alias(text=a) for a in aliases]
            db.add(term)

    db.add(Category(key="IRWD", label="IR + WD", is_base=False, from_keys=["IR", "WD"]))
    db.commit()
