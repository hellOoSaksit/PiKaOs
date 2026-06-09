"""Unit tests for the matcher + classifier (no DB / network needed)."""
from app.services.crawler import PageTerm
from app.services.matcher import VocabTerm, classify, match_terms


def _vocab():
    return [
        VocabTerm(key="t1", canon="Share Price", th="ราคาหลักทรัพย์",
                  aliases=["ราคาหุ้น", "stock price"], category="IR"),
        VocabTerm(key="t2", canon="Dividend", th="เงินปันผล",
                  aliases=["นโยบายปันผล"], category="IR"),
    ]


def test_alias_match_scores_high():
    page = [PageTerm("ราคาหุ้นย้อนหลัง", "<nav>", "/investor")]
    items = {m.key: m for m in match_terms(_vocab(), page)}
    assert items["t1"].conf >= 80          # alias "ราคาหุ้น" fuzzily inside the page term
    assert items["t1"].alias is True       # matched via a non-th surface form
    assert items["t2"].conf < items["t1"].conf  # dividend not on the page


def test_empty_page_yields_zero_conf():
    items = match_terms(_vocab(), [])
    assert all(m.conf == 0 and m.page_term is None for m in items)


def test_classify_bands():
    assert classify(80, False, 70, 18) == "complete"
    assert classify(60, False, 70, 18) == "unclear"   # within [52, 70)
    assert classify(40, False, 70, 18) == "missing"
    assert classify(10, True, 70, 18) == "complete"    # confirmed overrides
