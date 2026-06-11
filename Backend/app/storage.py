"""MinIO / S3 object storage abstraction (scaffold for files: md/image/log/pdf)."""
from __future__ import annotations

from datetime import timedelta

from minio import Minio

from .config import settings

_client = Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


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


def ping() -> bool:
    try:
        _client.bucket_exists(settings.minio_bucket)
        return True
    except Exception:
        return False
