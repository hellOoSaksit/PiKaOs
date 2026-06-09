"""Nav-focused vs deep extraction."""
from app.infrastructure.crawler import extract_terms

# A page whose nav holds the real sections and whose <main> holds news articles.
HTML = """
<html><head><title>SCB</title></head><body>
  <header><nav>
    <a href="/th/about-us">About Us</a>
    <a href="/th/about-us/corporate-governance">Corporate Governance</a>
    <a href="/th/about-us/sustainability">Sustainability</a>
    <a href="/th/about-us/csr">CSR</a>
    <a href="/th/about-us/news">News</a>
    <a href="/th/about-us/news/mar-2568/some-article">Deep news article in mega-menu</a>
  </nav></header>
  <main>
    <h1>Welcome</h1>
    <h2>SCB launches new mobile app</h2>
    <h2>Q3 profit rises 12%</h2>
    <a href="/news/123">SCB launches new mobile app</a>
  </main>
</body></html>
"""


def _texts(terms):
    return {t.text for t in terms}


def test_nav_only_matches_url_slugs():
    # default mode derives terms from URL slugs (lowercase, de-hyphenated)
    texts = _texts(extract_terms("https://scb.co.th", HTML, bypass_popup=True, deep=False))
    assert "corporate governance" in texts
    assert "sustainability" in texts and "csr" in texts and "news" in texts
    # news/article content must NOT leak in (h2/links not used in slug mode)
    assert "SCB launches new mobile app" not in texts
    assert "Q3 profit rises 12%" not in texts
    # deep article link dumped into the mega-menu is filtered by path depth
    assert "some article" not in texts


def test_deep_includes_content_headings():
    texts = _texts(extract_terms("https://scb.co.th", HTML, bypass_popup=True, deep=True))
    assert "SCB launches new mobile app" in texts
    assert "Q3 profit rises 12%" in texts
