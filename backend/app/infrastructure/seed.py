"""Seed the base IR / WD vocabulary and the derived IR+WD category.

Mirrors SM_VOCAB / SM_BASE_CATS from the prototype (GuildOS/screens-sitemap.jsx)
so the ported UI starts with identical data."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from .orm import AliasORM, CategoryORM, TermORM

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
        ("Company History", "จากวันวานถึงวันนี้", ["ประวัติบริษัท", "ความเป็นมา", "history", "from our early days until today"]),
        ("Board of Directors", "คณะกรรมการบริษัท", ["กรรมการ", "คณะกรรมการธนาคาร", "board of directors", "board of director"]),
        ("Executive Management", "ผู้บริหารระดับสูง", ["คณะผู้บริหาร", "senior executive officers", "senior management", "executives"]),
        ("Business Strategy", "กลยุทธ์องค์กร", ["กลยุทธ์ธนาคาร", "strategy", "strategic plan"]),
        ("Corporate Governance", "การกำกับดูแลกิจการ", ["CG", "บรรษัทภิบาล"]),
        ("Nomination Policy", "นโยบายสรรหากรรมการ", ["การสรรหา", "nomination"]),
        ("Anti-Corruption", "นโยบายต่อต้านทุจริต", ["CAC", "คอร์รัปชัน"]),
        ("Awards & Recognition", "รางวัลแห่งความสำเร็จ", ["รางวัล", "awards", "awards and ranking", "awards rankings"]),
        ("Sustainability", "ความยั่งยืน", ["ESG", "รายงานความยั่งยืน"]),
    ],
}


def seed(db: Session) -> None:
    if db.scalar(select(CategoryORM).limit(1)) is not None:
        return  # already seeded
    for key, label in SM_BASE_CATS:
        db.add(CategoryORM(key=key, label=label, is_base=True, from_keys=[]))
        for canon, th, aliases in SM_VOCAB[key]:
            term = TermORM(category_key=key, canon=canon, th=th, is_base=True)
            term.aliases = [AliasORM(text=a) for a in aliases]
            db.add(term)
    db.add(CategoryORM(key="IRWD", label="IR + WD", is_base=False, from_keys=["IR", "WD"]))
    db.commit()
