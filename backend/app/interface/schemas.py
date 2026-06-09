"""Pydantic DTOs for the HTTP edge. They map domain entities (snake_case attrs)
to the camelCase shape the React UI consumes."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---- responses ----
class CategoryOut(_Out):
    key: str
    label: str
    is_base: bool = Field(serialization_alias="isBase")
    from_keys: list[str] = Field(serialization_alias="from")
    hidden: bool


class TermOut(_Out):
    key: str = Field(validation_alias="id", serialization_alias="key")
    canon: str
    th: str
    category: str = Field(validation_alias="category_key", serialization_alias="category")
    confirmed: bool
    is_base: bool = Field(serialization_alias="isBase")
    aliases: list[str] = []


class ScanItemOut(_Out):
    key: str
    canon: str
    th: str
    category: str
    conf: int
    pageTerm: str | None = Field(validation_alias="page_term")
    alias: bool
    evTag: str = Field(validation_alias="ev_tag")
    evPath: str = Field(validation_alias="ev_path")
    status: str


class ScanResultOut(_Out):
    url: str
    cat: str = Field(validation_alias="category")
    scannedAt: datetime = Field(validation_alias="scanned_at")
    passThreshold: int = Field(validation_alias="pass_threshold")
    score: int
    items: list[ScanItemOut]
    pageTermsFound: int = Field(validation_alias="page_terms_found")
    rendered: bool = False


class TrainOut(_Out):
    id: str
    name: str
    category: str = Field(validation_alias="category_key", serialization_alias="category")
    rows: int
    ts: datetime = Field(validation_alias="created_at")


class LogOut(_Out):
    id: str
    actor: str
    action: str
    detail: str
    ts: datetime = Field(validation_alias="created_at")


# ---- requests ----
class CategoryCreate(BaseModel):
    key: str
    label: str | None = None
    from_keys: list[str] = Field(default_factory=list, alias="from")
    model_config = ConfigDict(populate_by_name=True)


class TermCreate(BaseModel):
    canon: str
    th: str = ""


class TermUpdate(BaseModel):
    canon: str | None = None
    th: str | None = None
    confirmed: bool | None = None


class AliasCreate(BaseModel):
    text: str


class ScanRequest(BaseModel):
    url: str
    category: str
    pass_threshold: int = Field(default=70, alias="passThreshold")
    bypass_popup: bool = Field(default=True, alias="bypassPopup")
    model_config = ConfigDict(populate_by_name=True)
