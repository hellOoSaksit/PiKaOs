"""EN-first locale candidate ordering + soft-404 detection."""
from app.infrastructure.crawler import _looks_404, candidate_urls


def test_path_locale_swap_prefers_en():
    c = candidate_urls("https://x.com/th/about-us", "en")
    assert c[0] == "https://x.com/en/about-us"
    assert c[-1] == "https://x.com/th/about-us"


def test_already_preferred_no_duplicate():
    assert candidate_urls("https://x.com/en/about-us", "en") == ["https://x.com/en/about-us"]


def test_bare_root_guesses_locale_then_falls_back():
    c = candidate_urls("https://x.com", "en")
    assert c[0] == "https://x.com/en/"
    assert c[-1] == "https://x.com"


def test_disabled_returns_original_only():
    assert candidate_urls("https://x.com/th/a", "") == ["https://x.com/th/a"]


def test_soft_404_detection():
    assert _looks_404("https://x.com/en/404.html", "<title>x</title>")
    assert _looks_404("https://x.com/en/about", "<title>Page Not Found</title>")
    assert _looks_404("https://x.com/en/about", "<title>ไม่พบหน้า</title>")
    assert not _looks_404("https://x.com/en/about", "<title>About Us</title>")
