"""Pure domain rules for classifying and scoring a match result."""
from __future__ import annotations


def classify(conf: int, confirmed: bool, pass_th: int, unclear_band: int) -> str:
    if confirmed:
        return "complete"
    if conf >= pass_th:
        return "complete"
    if conf >= pass_th - unclear_band:
        return "unclear"
    return "missing"


def score(items_statuses: list[str]) -> int:
    if not items_statuses:
        return 0
    complete = sum(1 for s in items_statuses if s == "complete")
    return round(complete / len(items_statuses) * 100)
