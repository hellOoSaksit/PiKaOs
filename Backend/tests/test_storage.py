"""Tests for the object-storage status route (/api/storage) — hits the live server.

Proves: admin can read storage status, the response carries NO secrets (access/secret keys stay in
env), and a non-admin without `infra.manage` is refused (403).

    docker compose exec backend pytest tests/test_storage.py
"""
from __future__ import annotations

import asyncio
import os

import httpx

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8000")
PW = "pikaos123"


async def _token(c: httpx.AsyncClient, who: str) -> str:
    r = await c.post("/api/auth/login", json={"usernameOrEmail": who, "password": PW})
    r.raise_for_status()
    return r.json()["token"]["accessToken"]


def test_storage_status_admin_ok_no_secrets_and_manager_forbidden():
    async def main():
        async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as c:
            admin = await _token(c, "somchai")          # seeded admin
            ra = await c.get("/api/storage/status", headers={"Authorization": f"Bearer {admin}"})
            rt = await c.post("/api/storage/test", headers={"Authorization": f"Bearer {admin}"})
            manager = await _token(c, "nicha")           # seeded manager — lacks infra.manage
            rm = await c.get("/api/storage/status", headers={"Authorization": f"Bearer {manager}"})
            return ra.status_code, ra.json(), rt.status_code, rm.status_code
    sa, body, st, sm = asyncio.run(main())

    assert sa == 200
    assert body["provider"] in ("minio", "s3")
    assert body["bucket"] and body["endpoint"]
    assert isinstance(body["reachable"], bool)
    # never leak credentials in the status payload
    blob = " ".join(str(v).lower() for v in body.values())
    assert "secret" not in blob and "pikaos-secret" not in blob
    assert "access_key" not in body and "secret_key" not in body
    assert st == 200                                     # admin can run the test-connection too
    assert sm == 403                                     # manager has no infra.manage → refused
