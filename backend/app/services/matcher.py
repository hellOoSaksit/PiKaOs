"""Fuzzy terminology matching with rapidfuzz.

For each canonical vocabulary term we score every candidate page term against
the term's surface forms (canon + th + aliases) and keep the best. The winning
page term, its confidence (0–99), and provenance flow straight into the report.
This replaces the prototype's deterministic `smHash(...) % 100` mock.
"""
from __future__ import annotations

from dataclasses import dataclass

from rapidfuzz import fuzz, process, utils

from .crawler import PageTerm


@dataclass
class VocabTerm:
    key: str
    canon: str
    th: str
    aliases: list[str]
    category: str


@dataclass
class MatchItem:
    key: str
    canon: str
    th: str
    category: str
    conf: int
    page_term: str | None
    alias: bool          # matched via an alias / non-th surface form
    ev_tag: str
    ev_path: str


def _scorer(a: str, b: str, **kw) -> float:
    # token_set_ratio is robust to word order and extra words ("ราคาหุ้นย้อนหลัง" ~ "ราคาหุ้น")
    return fuzz.token_set_ratio(a, b, **kw)


def match_terms(vocab: list[VocabTerm], page_terms: list[PageTerm]) -> list[MatchItem]:
    choices = [pt.text for pt in page_terms]
    # processed (lowercased, punctuation-stripped) choices for fair comparison
    proc_choices = [utils.default_process(c) for c in choices]

    items: list[MatchItem] = []
    for vt in vocab:
        surfaces = [s for s in [vt.canon, vt.th, *vt.aliases] if s]
        best_conf = 0
        best_pt: PageTerm | None = None
        best_surface = vt.th

        if choices:
            for surface in surfaces:
                q = utils.default_process(surface)
                if not q:
                    continue
                # process.extractOne over the page terms for this surface form
                hit = process.extractOne(q, proc_choices, scorer=_scorer, processor=None)
                if hit is None:
                    continue
                _, score, idx = hit
                if score > best_conf:
                    best_conf = int(min(99, round(score)))
                    best_pt = page_terms[idx]
                    best_surface = surface

        matched_via_alias = bool(best_pt) and best_surface != vt.th
        items.append(
            MatchItem(
                key=vt.key,
                canon=vt.canon,
                th=vt.th,
                category=vt.category,
                conf=best_conf,
                page_term=best_pt.text if best_pt else None,
                alias=matched_via_alias,
                ev_tag=best_pt.ev_tag if best_pt else "—",
                ev_path=best_pt.ev_path if best_pt else "/",
            )
        )
    return items


def classify(conf: int, confirmed: bool, pass_th: int, unclear_band: int) -> str:
    if confirmed:
        return "complete"
    if conf >= pass_th:
        return "complete"
    if conf >= pass_th - unclear_band:
        return "unclear"
    return "missing"
