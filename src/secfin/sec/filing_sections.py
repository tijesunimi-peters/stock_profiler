"""Segment a 10-K/10-Q primary document into Items (Track 2 Wave A, Stage 2).

Second document parser -- see `sec/filing_document.py`'s docstring for why this module's
authorization is its own (`CLAUDE.md`'s Track 2 section, 2026-08-22), not an extension of
`sec/exhibits.py`'s narrower EX-21 ruling.

## Why `sec-parser`, and what it actually buys

This project has never taken an HTML-parsing dependency before -- `sec/exhibits.py`, the only
other document parser, is deliberately stdlib-only. This module uses `sec-parser` instead (an
explicit operator decision reversing that default, `docs/ROADMAP_TRACK2.md` Wave A) because
Item-boundary detection has a real trap a stdlib regex sweep does not solve for free: a filing's
own Table of Contents repeats every Item caption near the top of the document as plain,
tag-stripped text indistinguishable from a real heading. `sec-parser`'s `TableOfContentsClassifier`
filters TOC content structurally (verified against three real filings during the Wave A spike,
2026-08-23 -- zero duplicate/TOC-origin matches across Apple's 10-K, Apple's 10-Q, and a
small-cap 10-Q).

## The mechanism, as verified against real filings (not as originally planned)

`sec_parser.Edgar10QParser` -- despite the name -- works as a general HTML-to-semantic-element
extractor for 10-K documents too: it does not error on a 10-K's differently-numbered Items, it
just cannot classify them into its 10-Q-specific `TopSectionTitle` map and falls back to a
generic `TitleElement`, with a harmless `UserWarning` per unrecognized identifier (suppressed
here -- confirmed benign by inspecting the library's source and running it against a real 10-K).
There is no `Edgar10KParser` in this library (version verified: 0.58.1) and none is needed: this
module does its OWN Item-text matching against `TitleElement`/`TopSectionTitle` text (form-aware
regexes, `_FORM_ITEMS` below) rather than relying on the library's 10-Q-only section map, so one
mechanism covers both forms.

**Extraction is a SPAN over the flat, document-order element list returned by `.parse()`** -- the
text of a section is every `TextElement` between one recognized Item title and the next, found by
index. This is NOT tree-nesting (`TreeBuilder`/`SemanticTree` was tried during the spike and
undercounts badly for 10-K, since only 10-Q's items get restructured under their title by the
library's own `TopSectionManagerFor10Q` step) -- the flat span approach was verified correct on
both forms: Apple's 10-K Item 1A extracted at 9,226 words (a real, substantial Risk Factors
section), and neighboring non-target items ("Item 4. Mine Safety Disclosures") stayed within 1-2
words across every filing tested, confirming span boundaries are precise, not leaking into
neighbors.
"""

from __future__ import annotations

import re
import warnings
from dataclasses import dataclass

#: Bumped whenever segmentation logic or the item map changes in a way that could change output
#: for filings already parsed -- a row written under an older version reads as a cache MISS (see
#: storage/sqlite_filing_section_repository.py), so the next read re-parses and heals it. Same
#: convention as sec/cover.py's COVER_SCHEMA_VERSION.
#:
#: 1 -- initial RF/LEGAL/MDNA/MARKET_RISK/CYBER segmentation via sec-parser span extraction
SECTIONS_SCHEMA_VERSION = 1

#: Item captions, matched against normalized title text (non-breaking spaces collapsed, case-
#: insensitive). The item NUMBER alone is not enough on a 10-Q -- Part I Item 1 ("Financial
#: Statements") and Part II Item 1 ("Legal Proceedings") share a number, so the caption keyword is
#: what disambiguates; no separate Part-tracking is needed as a result.
_FORM_ITEMS: dict[str, dict[str, re.Pattern[str]]] = {
    "10-K": {
        "RF": re.compile(r"^item\s+1a\b.*risk\s+factors", re.I | re.S),
        "LEGAL": re.compile(r"^item\s+3\b.*legal\s+proceedings", re.I | re.S),
        "MDNA": re.compile(r"^item\s+7\b.*management.?s\s+discussion", re.I | re.S),
        "MARKET_RISK": re.compile(r"^item\s+7a\b.*quantitative", re.I | re.S),
        "CYBER": re.compile(r"^item\s+1c\b.*cybersecurity", re.I | re.S),
    },
    "10-Q": {
        "RF": re.compile(r"^item\s+1a\b.*risk\s+factors", re.I | re.S),
        "LEGAL": re.compile(r"^item\s+1\b.*legal\s+proceedings", re.I | re.S),
        "MDNA": re.compile(r"^item\s+2\b.*management.?s\s+discussion", re.I | re.S),
        "MARKET_RISK": re.compile(r"^item\s+3\b.*quantitative", re.I | re.S),
        # No Item 1C on a 10-Q. Deliberately absent, not mapped to a permanent status="na" --
        # matches filing_changes.py's "notification, not a status board" discipline: an
        # inapplicable question gets no row at all, not a manufactured non-answer.
    },
}

#: Human-readable section names, keyed the same as _FORM_ITEMS' inner dicts.
_SECTION_NAMES = {
    "RF": "Risk Factors",
    "LEGAL": "Legal Proceedings",
    "MDNA": "Management's Discussion and Analysis",
    "MARKET_RISK": "Quantitative and Qualitative Disclosures About Market Risk",
    "CYBER": "Cybersecurity",
}

#: Defensive word-count floors below which an extracted span is treated as a parsing artifact
#: rather than real content -- the "unwilling" backstop kept even with a real parser, per the
#: EX-21 precedent's "a partial extraction is worse than none". Set from real filings inspected
#: during the 2026-08-23 spike (smallest genuine values seen: a 10-Q MARKET_RISK section at 10
#: words, LEGAL at 109) -- low enough not to reject legitimate brief disclosures, high enough to
#: catch a near-empty span (a TOC-adjacent leak showed 1-2 words on non-target items in every
#: filing tested).
_MIN_WORDS: dict[str, dict[str, int]] = {
    "10-K": {"RF": 100, "LEGAL": 15, "MDNA": 100, "MARKET_RISK": 10, "CYBER": 15},
    "10-Q": {"RF": 15, "LEGAL": 10, "MDNA": 50, "MARKET_RISK": 3},
}

_WORD = re.compile(r"[A-Za-z']+")
_SENTENCE_END = re.compile(r"[.!?]+(?:\s|$)")


def _base_form(form: str) -> str | None:
    if form.startswith("10-K"):
        return "10-K"
    if form.startswith("10-Q"):
        return "10-Q"
    return None


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


@dataclass
class SectionResult:
    item_code: str
    section_name: str
    cleaned_text: str
    word_count: int
    sentence_count: int
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _na(item_code: str, reason: str) -> SectionResult:
    return SectionResult(
        item_code=item_code,
        section_name=_SECTION_NAMES[item_code],
        cleaned_text="",
        word_count=0,
        sentence_count=0,
        status="na",
        reason=reason,
    )


def segment_filing(document_html: str, form: str) -> list[SectionResult]:
    """Split a primary document into Items. One `SectionResult` per item_code applicable to
    `form` -- never per-document status; one item's failure never invalidates the others.

    `form` must be the filing's actual form string (`"10-K"`, `"10-K/A"`, `"10-Q"`, `"10-Q/A"`).
    An unrecognized form returns an empty list (nothing applicable), not an error -- Track 2 Wave A
    only targets 10-K/10-Q.
    """
    base_form = _base_form(form)
    if base_form is None:
        return []
    items = _FORM_ITEMS[base_form]
    floors = _MIN_WORDS[base_form]

    import sec_parser as sp

    try:
        with warnings.catch_warnings():
            # 10-K documents trigger a harmless UserWarning per Item that Edgar10QParser's
            # 10-Q-specific section map doesn't recognize -- expected and inspected, not a real
            # problem (see the module docstring).
            warnings.simplefilter("ignore", category=UserWarning)
            elements = sp.Edgar10QParser().parse(document_html)
    except Exception as exc:  # noqa: BLE001 -- a malformed document is a parse failure, not a crash
        return [
            _na(code, f"This document could not be parsed ({exc.__class__.__name__}).")
            for code in items
        ]

    # Every title-like element, in document order, with its flat-list index -- the span
    # boundaries. Checks BOTH TitleElement (10-K's fallback classification) and TopSectionTitle
    # (10-Q's properly-recognized sections) since which one a given Item lands as depends on
    # whether Edgar10QParser's 10-Q section map happens to recognize it.
    titles: list[tuple[int, str]] = []
    for i, el in enumerate(elements):
        if isinstance(el, (sp.TitleElement, sp.TopSectionTitle)):
            text = _normalize(el.text)
            if re.match(r"^item\s+\d+[a-c]?\b", text, re.I):
                titles.append((i, text))

    results: list[SectionResult] = []
    for code, pattern in items.items():
        match_idx = next((n for n, (_, text) in enumerate(titles) if pattern.match(text)), None)
        if match_idx is None:
            results.append(
                _na(code, f"No recognizable {_SECTION_NAMES[code]} heading found in this document.")
            )
            continue

        start_i = titles[match_idx][0]
        end_i = titles[match_idx + 1][0] if match_idx + 1 < len(titles) else len(elements)
        parts = [
            el.text
            for el in elements[start_i + 1 : end_i]
            if isinstance(el, sp.TextElement) and not isinstance(el, sp.SupplementaryText)
        ]
        cleaned = _normalize(" ".join(parts))
        word_count = len(_WORD.findall(cleaned))

        if word_count < floors[code]:
            results.append(
                _na(
                    code,
                    f"Found a {_SECTION_NAMES[code]} heading but the extracted content was "
                    "implausibly short -- likely a parsing artifact, not the real section.",
                )
            )
            continue

        sentence_count = max(1, len(_SENTENCE_END.findall(cleaned)))
        results.append(
            SectionResult(
                item_code=code,
                section_name=_SECTION_NAMES[code],
                cleaned_text=cleaned,
                word_count=word_count,
                sentence_count=sentence_count,
            )
        )

    return results
