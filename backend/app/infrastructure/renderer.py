"""Headless-browser renderer (Playwright/Chromium).

Lazily imports Playwright so the app still runs when it isn't installed — in
that case render() returns None and the FallbackCrawler keeps the lxml result.
"""
from __future__ import annotations

from ..config import get_settings

settings = get_settings()


class PlaywrightRenderer:
    def render(self, url: str) -> tuple[str, str] | None:
        """Render `url` in headless Chromium and return (final_url, html), or
        None if Playwright/browser is unavailable or rendering fails."""
        try:
            from playwright.sync_api import TimeoutError as PWTimeout
            from playwright.sync_api import sync_playwright
        except Exception:
            return None

        timeout_ms = int(settings.crawl_render_timeout * 1000)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                try:
                    page = browser.new_page(user_agent=settings.crawl_user_agent, locale="th-TH")
                    page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                    try:  # let client-side rendering settle; not fatal if it times out
                        page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 8000))
                    except PWTimeout:
                        pass
                    return page.url, page.content()
                finally:
                    browser.close()
        except Exception:
            return None
