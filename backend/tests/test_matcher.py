"""Unit tests for the matcher adapter + classifier policy (no DB / network)."""
from app.domain.entities import PageTerm, Term
from app.domain.policies import classify
from app.infrastructure.matcher import RapidfuzzMatcher

matcher = RapidfuzzMatcher()


def _vocab():
    return [
        Term(id="t1", category_key="IR", canon="Share Price", th="ราคาหลักทรัพย์",
             is_base=True, confirmed=False, aliases=["ราคาหุ้น", "stock price"]),
        Term(id="t2", category_key="IR", canon="Dividend", th="เงินปันผล",
             is_base=True, confirmed=False, aliases=["นโยบายปันผล"]),
    ]


def test_alias_match_scores_high():
    page = [PageTerm("ราคาหุ้นย้อนหลัง", "<nav>", "/investor")]
    items = {m.key: m for m in matcher.match(_vocab(), page)}
    assert items["t1"].conf >= 80          # alias "ราคาหุ้น" fuzzily inside the page term
    assert items["t1"].alias is True       # matched via a non-th surface form
    assert items["t2"].conf < items["t1"].conf


def test_empty_page_yields_zero_conf():
    items = matcher.match(_vocab(), [])
    assert all(m.conf == 0 and m.page_term is None for m in items)


def test_classify_bands():
    assert classify(80, False, 70, 18) == "complete"
    assert classify(60, False, 70, 18) == "unclear"   # within [52, 70)
    assert classify(40, False, 70, 18) == "missing"
    assert classify(10, True, 70, 18) == "complete"    # confirmed overrides
