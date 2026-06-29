#!/usr/bin/env python3
"""Lint the docs/ tree so the conventions stay machine-enforced, not human memory.

Checks (hard-fail → exit 1):
  1. Frontmatter — every docs/**/*.md starts with a YAML block holding all 7 required fields,
     with `type`/`status` drawn from the allowed vocabulary (templates/frontmatter.md).
  2. Markdown links `](target)` — targets that resolve INSIDE this repo must exist; if the
     target has an `#anchor`, the anchor must match a heading in the target file (GitHub slug).
  3. `related:` frontmatter paths — same existence rule.

Cross-repo links (resolve OUTSIDE PiKaOs-Docs, e.g. ../../PiKaOs-Core/..., ../../../CLAUDE.md) are
checked only when the sibling actually exists on disk — so a full local checkout validates them,
while CI (PiKaOs-Docs alone) skips them instead of false-failing. templates/ keep destination-
relative skeleton links (correct once pasted), so their link/anchor bodies are skipped — but their
own frontmatter is still validated.

stdlib only; run: python scripts/docs-lint.py
"""
from __future__ import annotations

import os
import re
import sys
import urllib.parse

# Docs use non-ASCII (→, ·, Thai); force UTF-8 output so reporting doesn't crash on a
# Windows cp1252 console (CI is UTF-8, but local dev on Windows isn't).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(REPO_ROOT, "docs")

REQUIRED_FIELDS = {"title", "type", "status", "keywords", "related", "summary", "updated"}
VALID_TYPES = {"rule", "reference", "architecture", "feature", "process", "index",
               "prompt", "template", "glossary"}
VALID_STATUS = {"active", "design", "built", "draft", "deprecated"}

LINK_RE = re.compile(r"\]\(([^)]+)\)")
RELATED_RE = re.compile(r"^related:\s*\[(.*)\]", re.M)
HEADING_RE = re.compile(r"^#{1,6}\s+(.*?)\s*$")


def md_files() -> list[str]:
    out = []
    for root, _, files in os.walk(DOCS):
        out += [os.path.join(root, f) for f in files if f.endswith(".md")]
    return out


def slug(heading: str) -> str:
    """GitHub-style heading anchor: lowercase, drop punctuation/emoji, spaces→hyphens."""
    h = heading.lower().replace("`", "").replace("**", "")
    h = re.sub(r"[^\w\s-]", "", h)        # strip punctuation + emoji (keeps word chars/space/hyphen)
    return re.sub(r"\s", "-", h.strip("\n"))


def headings_of(path: str) -> set[str]:
    out = set()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = HEADING_RE.match(line.rstrip("\n"))
            if m:
                out.add(slug(m.group(1)))
    return out


def inside_repo(path: str) -> bool:
    return os.path.normpath(path).startswith(REPO_ROOT)


def check_frontmatter(path: str, errors: list[str]) -> None:
    text = open(path, encoding="utf-8").read()
    if not text.startswith("---\n"):
        errors.append(f"{path}: missing frontmatter (must start with '---')")
        return
    block = text.split("---", 2)[1]
    fields = {m.group(1) for m in re.finditer(r"^(\w+):", block, re.M)}
    missing = REQUIRED_FIELDS - fields
    if missing:
        errors.append(f"{path}: frontmatter missing fields {sorted(missing)}")
    t = re.search(r"^type:\s*(\S+)", block, re.M)
    if t and t.group(1) not in VALID_TYPES:
        errors.append(f"{path}: invalid type '{t.group(1)}' (allowed: {sorted(VALID_TYPES)})")
    s = re.search(r"^status:\s*(\S+)", block, re.M)
    if s and s.group(1) not in VALID_STATUS:
        errors.append(f"{path}: invalid status '{s.group(1)}' (allowed: {sorted(VALID_STATUS)})")


def check_refs(path: str, heading_cache: dict[str, set[str]], errors: list[str]) -> int:
    """Validate markdown links + related: paths. Returns count of skipped cross-repo refs."""
    skipped = 0
    d = os.path.dirname(path)
    is_template = os.sep + "templates" + os.sep in path
    text = open(path, encoding="utf-8").read()

    targets = []
    if not is_template:  # template bodies hold destination-relative skeleton links — not real refs
        targets += LINK_RE.findall(text)
    rel = RELATED_RE.search(text)
    if rel:
        targets += [x.strip().strip("\"' ") for x in rel.group(1).split(",")]

    for raw in targets:
        if not raw or raw.startswith(("http://", "https://", "mailto:", "#")):
            continue
        if raw == "path":  # the literal `[file](path)` example in CLAUDE.md's maintainer note
            continue
        tgt, _, anchor = raw.partition("#")
        tgt = urllib.parse.unquote(tgt)
        full = os.path.normpath(os.path.join(d, tgt)) if tgt else os.path.normpath(path)

        if not inside_repo(full):
            if not os.path.exists(full):
                skipped += 1            # sibling repo absent (CI) — can't check, don't fail
            continue
        if not os.path.exists(full):
            errors.append(f"{path}: broken link → {raw}")
            continue
        if anchor and full.endswith(".md"):
            if full not in heading_cache:
                heading_cache[full] = headings_of(full)
            if anchor not in heading_cache[full]:
                errors.append(f"{path}: broken anchor → {raw}")
    return skipped


def main() -> int:
    files = md_files()
    errors: list[str] = []
    heading_cache: dict[str, set[str]] = {}
    skipped = 0
    for f in files:
        check_frontmatter(f, errors)
        skipped += check_refs(f, heading_cache, errors)

    if errors:
        print("docs-lint FAILED:\n")
        for e in errors:
            print(f"  - {e}")
        print(f"\n{len(errors)} problem(s) in {len(files)} docs.")
        return 1
    print(f"docs-lint OK — {len(files)} docs, frontmatter + links + anchors + related all valid "
          f"({skipped} cross-repo refs skipped: siblings not checked out).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
