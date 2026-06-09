"""Excel/CSV training parser tests."""
from app.services.excel import parse


def test_csv_with_headers():
    csv = "canon,th,aliases\nShare Price,ราคาหลักทรัพย์,ราคาหุ้น|stock price\nDividend,เงินปันผล,\n"
    terms, rows = parse("vocab.csv", csv.encode("utf-8"))
    assert rows == 2
    assert terms[0].canon == "Share Price"
    assert terms[0].aliases == ["ราคาหุ้น", "stock price"]
    assert terms[1].th == "เงินปันผล" and terms[1].aliases == []


def test_csv_positional_fallback():
    csv = "Vision,วิสัยทัศน์,vision\n"  # no recognizable header -> treated as data
    terms, rows = parse("x.csv", csv.encode("utf-8"))
    assert rows == 1
    assert terms[0].canon == "Vision"
    assert terms[0].aliases == ["vision"]
