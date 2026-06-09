"""Composition root — wires concrete adapters into application services per
request. This is the only place the layers are assembled."""
from collections.abc import Generator
from urllib.parse import unquote

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from ..application.log_service import LogService
from ..application.scan_service import ScanService
from ..application.sitemap_service import SitemapService
from ..application.train_service import TrainService
from ..application.vocab_service import VocabService
from ..config import get_settings
from ..infrastructure.crawler import LxmlCrawler
from ..infrastructure.db import get_session
from ..infrastructure.excel import OpenpyxlExcel
from ..infrastructure.fallback_crawler import FallbackCrawler
from ..infrastructure.matcher import RapidfuzzMatcher
from ..infrastructure.renderer import PlaywrightRenderer
from ..infrastructure.repositories import SqlLogRepository, SqlTrainRepository, SqlVocabRepository
from ..infrastructure.sitemap import HttpxSitemapReader

settings = get_settings()

# stateless adapters can be shared across requests
_crawler = FallbackCrawler(LxmlCrawler(), PlaywrightRenderer())
_matcher = RapidfuzzMatcher()
_excel = OpenpyxlExcel()
_sitemap = HttpxSitemapReader()


def get_db() -> Generator[Session, None, None]:
    yield from get_session()


def actor_header(x_actor: str = Header(default="%E0%B8%9C%E0%B8%B9%E0%B9%89%E0%B9%83%E0%B8%8A%E0%B9%89", alias="X-Actor")) -> str:
    # client percent-encodes the actor name (headers are Latin-1 only)
    return unquote(x_actor)


def get_vocab_service(db: Session = Depends(get_db)) -> VocabService:
    return VocabService(SqlVocabRepository(db), SqlLogRepository(db))


def get_scan_service(db: Session = Depends(get_db)) -> ScanService:
    return ScanService(SqlVocabRepository(db), _crawler, _matcher, settings.unclear_band)


def get_train_service(db: Session = Depends(get_db)) -> TrainService:
    return TrainService(SqlVocabRepository(db), SqlTrainRepository(db), _excel, SqlLogRepository(db))


def get_log_service(db: Session = Depends(get_db)) -> LogService:
    return LogService(SqlLogRepository(db))


def get_sitemap_service() -> SitemapService:
    return SitemapService(_sitemap)
