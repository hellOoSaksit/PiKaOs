"""Tests for the SSRF guard (A7) used by the compare/audit outbound path.

Network-free: IP-literal URLs make `getaddrinfo` return without a DNS lookup, and
the request hook rejects a URL *before* httpx opens a connection — so nothing here
talks to the network.

    docker compose exec backend pytest tests/test_net_guard.py
"""
from __future__ import annotations

import asyncio
from contextlib import contextmanager

import httpx
import pytest

from app.config import settings
from app.services import compare_service as cs
from app.services.net_guard import BlockedURLError, assert_public_url


@contextmanager
def _settings(**overrides):
    """Temporarily patch settings, restoring originals after."""
    old = {k: getattr(settings, k) for k in overrides}
    for k, v in overrides.items():
        setattr(settings, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(settings, k, v)


# --- assert_public_url: block the internal ranges --------------------------

@pytest.mark.parametrize("url", [
    "http://127.0.0.1/",                       # loopback
    "http://169.254.169.254/latest/meta-data/",  # link-local (cloud metadata)
    "http://10.0.0.5/",                        # RFC1918 private
    "http://192.168.1.1/",                     # RFC1918 private
    "http://172.16.0.1/",                      # RFC1918 private
    "http://[::1]/",                           # IPv6 loopback
    "http://0.0.0.0/",                         # unspecified
])
def test_blocks_non_public_ips(url):
    with pytest.raises(BlockedURLError):
        assert_public_url(url)


@pytest.mark.parametrize("url", [
    "ftp://example.com/x",     # non-http scheme
    "file:///etc/passwd",      # non-http scheme
    "gopher://x/",             # non-http scheme
])
def test_blocks_bad_scheme(url):
    with pytest.raises(BlockedURLError):
        assert_public_url(url)


def test_blocks_missing_host():
    with pytest.raises(BlockedURLError):
        assert_public_url("http:///just-a-path")


def test_allows_public_ip_literal():
    # 8.8.8.8 is a global address; getaddrinfo on a literal does no DNS lookup.
    assert_public_url("http://8.8.8.8/")        # must not raise


# --- toggle + allowlist ----------------------------------------------------

def test_toggle_off_is_noop():
    with _settings(compare_ssrf_block_private=False):
        assert_public_url("http://127.0.0.1/")  # guard disabled → allowed


def test_allowlist_rejects_host_not_listed():
    with _settings(compare_url_allowlist="example.com"):
        with pytest.raises(BlockedURLError):
            assert_public_url("http://8.8.8.8/")   # public but not in allowlist


# --- wiring: a guarded client rejects before connecting --------------------

def test_guarded_client_blocks_internal_url():
    async def go():
        client = cs._make_client(follow_redirects=False)
        try:
            await client.get("http://127.0.0.1:9/")   # hook raises before any connect
        finally:
            await client.aclose()

    with pytest.raises(httpx.RequestError):
        asyncio.run(go())
