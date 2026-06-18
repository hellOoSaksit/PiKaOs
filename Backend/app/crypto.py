"""Symmetric encryption for secrets stored at rest (e.g. LLM API keys in llm_connections).

The "no-hardcode" rule lets admins set provider keys from the UI → the ciphertext lives in
the DB, never plaintext. The Fernet key is **derived** from `settings.secret_key` (falling
back to `jwt_secret` in dev) via SHA-256, so there's no extra key file to manage — but
rotating that secret invalidates every stored ciphertext (keys must be re-entered).

Uses `cryptography` (Fernet = AES-128-CBC + HMAC) — the one new backend dependency this
needs; stdlib has no authenticated symmetric cipher.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _fernet() -> Fernet:
    raw = (settings.secret_key or settings.jwt_secret or "dev-insecure").encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(raw).digest()))


def encrypt(plaintext: str) -> str:
    """Encrypt a secret → opaque token safe to store in the DB."""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    """Decrypt a stored token. Returns "" if the token is bad / the secret rotated."""
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return ""
