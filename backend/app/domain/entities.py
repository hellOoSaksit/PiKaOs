"""Domain entities — plain dataclasses, no framework or I/O dependencies.

These are the language the application layer speaks. The ORM (infrastructure)
maps to/from these; the API layer (interface) maps these to/from DTOs.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


# ---- vocabulary ----
@dataclass
class Category:
    key: str
    label: str
    is_base: bool
    from_keys: list[str]
    hidden: bool

    @property
    def is_derived(self) -> bool:
        return bool(self.from_keys)


@dataclass
class Term:
    id: str
    category_key: str
    canon: str
    th: str
    is_base: bool
    confirmed: bool
    aliases: list[str] = field(default_factory=list)


@dataclass
class TrainFile:
    id: str
    category_key: str
    name: str
    rows: int
    created_at: datetime


@dataclass
class LogEntry:
    id: str
    actor: str
    action: str
    detail: str
    created_at: datetime


# ---- matching pipeline ----
@dataclass
class ParsedTerm:
    """A term parsed from an uploaded Excel/CSV training file."""
    canon: str
    th: str = ""
    aliases: list[str] = field(default_factory=list)


@dataclass
class PageTerm:
    """A candidate label extracted from a crawled page."""
    text: str
    ev_tag: str   # <nav>, <h1>, <title>, sitemap.xml, breadcrumb, link
    ev_path: str  # path/url the term points at (best effort)


@dataclass
class MatchItem:
    key: str
    canon: str
    th: str
    category: str
    conf: int
    page_term: str | None
    alias: bool
    ev_tag: str
    ev_path: str
    status: str = "missing"  # complete | unclear | missing


@dataclass
class ScanReport:
    url: str
    category: str
    scanned_at: datetime
    pass_threshold: int
    score: int
    items: list[MatchItem]
    page_terms_found: int
