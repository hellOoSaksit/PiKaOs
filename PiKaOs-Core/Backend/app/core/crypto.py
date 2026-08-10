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


def _secret_material() -> bytes:
    """The secret every at-rest key here is derived from — one definition, so a fingerprint can never
    describe a different secret than the cipher actually uses."""
    return (settings.secret_key or settings.jwt_secret or "dev-insecure").encode()


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(_secret_material()).digest()))


def secret_fingerprint() -> str:
    """A short, non-reversible id for the CURRENT secret — "is this the same key?", nothing more.

    Domain-separated on purpose: `sha256(secret)` IS the Fernet key, so publishing a prefix of it in a
    backup manifest would leak real key material. Backups record this so a restore can tell that its
    ciphertext was written under a different secret — otherwise the secrets come back looking intact
    and decrypt to nothing (crypto rotation invalidates every stored token, see the module docstring).
    """
    return hashlib.sha256(b"pikaos-backup-keyid:" + _secret_material()).hexdigest()[:12]


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
