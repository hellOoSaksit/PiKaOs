"""The core endpoint: crawl a URL and match its terms against a category's
vocabulary. Replaces the prototype's mock `run()`."""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Category
from ..schemas import ScanItem, ScanRequest, ScanResult
from ..services import crawler
from ..services.matcher import classify, match_terms
from ..vocab_resolve import resolve_terms, to_vocab
from datetime import datetime, timezone

router = APIRouter(prefix="/sitemap", tags=["scan"])
settings = get_settings()


@router.post("/scan", response_model=ScanResult)
def scan(body: ScanRequest, db: Session = Depends(get_db)):
    cat = db.get(Category, body.category)
    if cat is None:
        raise HTTPException(404, f"category '{body.category}' not found")

    vocab = to_vocab(resolve_terms(db, body.category))
    if not vocab:
        raise HTTPException(400, "category has no vocabulary terms")

    try:
        final_url, html_text = crawler.fetch(body.url)
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"fetch failed: HTTP {e.response.status_code}")
    except httpx.HTTPError as e:
        raise HTTPException(502, f"fetch failed: {type(e).__name__}")

    page_terms = crawler.extract_terms(final_url, html_text, bypass_popup=body.bypass_popup)
    matches = match_terms(vocab, page_terms)

    pass_th = body.pass_threshold
    confirmed_keys = {t.id for t in resolve_terms(db, body.category) if t.confirmed}

    items: list[ScanItem] = []
    complete = 0
    for m in matches:
        status = classify(m.conf, m.key in confirmed_keys, pass_th, settings.unclear_band)
        if status == "complete":
            complete += 1
        items.append(
            ScanItem(
                key=m.key, canon=m.canon, th=m.th, category=m.category,
                conf=m.conf, pageTerm=m.page_term, alias=m.alias,
                evTag=m.ev_tag, evPath=m.ev_path, status=status,
            )
        )

    score = round(complete / len(items) * 100) if items else 0
    return ScanResult(
        url=final_url,
        category=body.category,
        scannedAt=datetime.now(timezone.utc),
        passThreshold=pass_th,
        score=score,
        items=items,
        pageTermsFound=len(page_terms),
    )
