"""Excel/CSV gateway tests (parse + template/export round-trip)."""
from app.domain.entities import ParsedTerm
from app.infrastructure.excel import OpenpyxlExcel

excel = OpenpyxlExcel()


def test_csv_with_headers():
    csv = "canon,th,aliases\nShare Price,ราคาหลักทรัพย์,ราคาหุ้น|stock price\nDividend,เงินปันผล,\n"
    terms, rows = excel.parse("vocab.csv", csv.encode("utf-8"))
    assert rows == 2
    assert terms[0].canon == "Share Price"
    assert terms[0].aliases == ["ราคาหุ้น", "stock price"]
    assert terms[1].th == "เงินปันผล" and terms[1].aliases == []


def test_template_is_parseable():
    terms, rows = excel.parse("t.xlsx", excel.build_template())
    assert rows >= 2
    canons = {t.canon for t in terms}
    assert "Share Price" in canons and "Financial Statements" in canons
    sp = next(t for t in terms if t.canon == "Share Price")
    assert "stock price" in sp.aliases


def test_export_round_trip():
    src = [ParsedTerm("Dividend", "เงินปันผล", ["นโยบายปันผล", "dividend policy"])]
    terms, _ = excel.parse("e.xlsx", excel.build_export("IR", src))
    assert terms[0].canon == "Dividend"
    assert terms[0].aliases == ["นโยบายปันผล", "dividend policy"]


def test_csv_positional_fallback():
    csv = "Vision,วิสัยทัศน์,vision\n"  # no recognizable header -> treated as data
    terms, rows = excel.parse("x.csv", csv.encode("utf-8"))
    assert rows == 1
    assert terms[0].canon == "Vision"
    assert terms[0].aliases == ["vision"]
