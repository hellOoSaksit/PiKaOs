"""rapidfuzz matcher adapter (implements domain.ports.Matcher).

For each vocabulary Term, scores every page term against the term's surface
forms (canon + th + aliases) and keeps the best. Confidence is 0–99.
"""
from __future__ import annotations

from rapidfuzz import fuzz, process, utils

from ..domain.entities import MatchItem, PageTerm, Term


def _scorer(a: str, b: str, **kw) -> float:
    # token_set_ratio is robust to word order / extra words
    return fuzz.token_set_ratio(a, b, **kw)


class RapidfuzzMatcher:
    def match(self, vocab: list[Term], page_terms: list[PageTerm]) -> list[MatchItem]:
        choices = [pt.text for pt in page_terms]
        proc_choices = [utils.default_process(c) for c in choices]

        items: list[MatchItem] = []
        for v in vocab:
            surfaces = [s for s in [v.canon, v.th, *v.aliases] if s]
            best_conf = 0
            best_pt: PageTerm | None = None
            best_surface = v.th
            if choices:
                for surface in surfaces:
                    q = utils.default_process(surface)
                    if not q:
                        continue
                    hit = process.extractOne(q, proc_choices, scorer=_scorer, processor=None)
                    if hit is None:
                        continue
                    _, score, idx = hit
                    if score > best_conf:
                        best_conf = int(min(99, round(score)))
                        best_pt = page_terms[idx]
                        best_surface = surface
            items.append(
                MatchItem(
                    key=v.id, canon=v.canon, th=v.th, category=v.category_key,
                    conf=best_conf,
                    page_term=best_pt.text if best_pt else None,
                    alias=bool(best_pt) and best_surface != v.th,
                    ev_tag=best_pt.ev_tag if best_pt else "—",
                    ev_path=best_pt.ev_path if best_pt else "/",
                )
            )
        return items
