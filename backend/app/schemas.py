"""Pydantic request/response models. Field names are camelCase on the wire
(via alias) so the ported React UI consumes them unchanged."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Camel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---- vocab ----
class AliasOut(_Camel):
    id: str
    text: str


class TermOut(_Camel):
    key: str = Field(validation_alias="id", serialization_alias="key")
    canon: str
    th: str
    category: str = Field(validation_alias="category_key", serialization_alias="category")
    confirmed: bool
    is_base: bool = Field(serialization_alias="isBase")
    aliases: list[str] = []

    @field_validator("aliases", mode="before")
    @classmethod
    def _flatten(cls, v):
        if v and not isinstance(v[0], str):
            return [a.text for a in v]
        return v


class CategoryOut(_Camel):
    key: str
    label: str
    is_base: bool = Field(serialization_alias="isBase")
    from_keys: list[str] = Field(serialization_alias="from")
    hidden: bool


class TermCreate(BaseModel):
    canon: str
    th: str = ""


class TermUpdate(BaseModel):
    canon: str | None = None
    th: str | None = None
    confirmed: bool | None = None


class AliasCreate(BaseModel):
    text: str


class CategoryCreate(BaseModel):
    key: str
    label: str | None = None
    from_keys: list[str] = Field(default_factory=list, alias="from")
    model_config = ConfigDict(populate_by_name=True)


# ---- scan ----
class ScanRequest(BaseModel):
    url: str
    category: str
    pass_threshold: int = Field(default=70, alias="passThreshold")
    bypass_popup: bool = Field(default=True, alias="bypassPopup")
    model_config = ConfigDict(populate_by_name=True)


class ScanItem(_Camel):
    key: str
    canon: str
    th: str
    category: str
    conf: int
    pageTerm: str | None
    alias: bool
    evTag: str
    evPath: str
    status: str  # complete | unclear | missing


class ScanResult(_Camel):
    url: str
    category: str = Field(serialization_alias="cat")
    scannedAt: datetime
    passThreshold: int
    score: int
    items: list[ScanItem]
    pageTermsFound: int


# ---- train / log ----
class TrainOut(_Camel):
    id: str
    name: str
    category: str = Field(validation_alias="category_key", serialization_alias="category")
    rows: int
    ts: datetime = Field(validation_alias="created_at")


class LogOut(_Camel):
    id: str
    actor: str
    action: str
    detail: str
    ts: datetime = Field(validation_alias="created_at")
