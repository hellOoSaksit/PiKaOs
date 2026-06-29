"""Object storage abstraction (files: md/image/log/pdf).

The `minio` client speaks the S3 API, so this one module backs MinIO, AWS S3, or any
S3-compatible store — the backend is chosen by env (`storage_provider` + `minio_*` + `storage_region`),
never hardcoded and never edited from the UI (bootstrap creds, config.py). The tools tab gets a
read-only status + test-connection (`status()`/`ping()`) — it does not mutate these.
"""
from __future__ import annotations

from datetime import timedelta

from minio import Minio

from .config import settings

# region is required by AWS S3 and ignored by MinIO; pass None when unset so the client picks it up.
_client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
    region=settings.storage_region or None,
)


def status() -> dict:
    """Non-secret storage config for the tools tab (provider/endpoint/bucket/region) + reachability.
    Never returns access/secret keys — those stay in env."""
    return {
        "provider": settings.storage_provider,
        "endpoint": settings.minio_endpoint,
        "bucket": settings.minio_bucket,
        "secure": settings.minio_secure,
        "region": settings.storage_region or None,
        "reachable": ping(),
    }


def ensure_bucket() -> None:
    if not _client.bucket_exists(settings.minio_bucket):
        _client.make_bucket(settings.minio_bucket)


def put_object(object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    import io

    _client.put_object(
        settings.minio_bucket,
        object_key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def presigned_get(object_key: str, expires_seconds: int = 3600) -> str:
    return _client.presigned_get_object(
        settings.minio_bucket, object_key, expires=timedelta(seconds=expires_seconds)
    )


def get_object(object_key: str) -> bytes:
    """Read an object's bytes back (used by RAG ingestion to chunk/embed a stored doc).
    The HTTP response must be released, so read fully then close — see minio docs."""
    resp = None
    try:
        resp = _client.get_object(settings.minio_bucket, object_key)
        return resp.read()
    finally:
        if resp is not None:
            resp.close()
            resp.release_conn()


def remove_object(object_key: str) -> None:
    _client.remove_object(settings.minio_bucket, object_key)


def ping() -> bool:
    try:
        _client.bucket_exists(settings.minio_bucket)
        return True
    except Exception:
        return False
