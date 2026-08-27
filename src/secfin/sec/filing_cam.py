"""Extract Critical Audit Matters (CAMs) from a 10-K's auditor's report (Track 2 Wave B §8.2).

**A real structural departure from `filing_sections.py`'s single-span-per-item_code pattern.** The
auditor's report isn't a numbered Item, and CAMs form a REPEATING block (typically 1-4 matters per
filer per year) -- the reason `filing_cam_matters` is its own table, not a `filing_sections` row
(see `docs/DATA_MODEL.md`).

## The mechanism, as verified against three real 10-Ks (Apple, Microsoft, JPMorgan Chase,
## 2026-08-27) -- not as originally planned, and not as first implemented either

The approved design (`docs/ROADMAP_TRACK2.md` §8.2, written before this spike) assumed each CAM's
bolded title would land as its own `TitleElement`/`TopSectionTitle`, the same sub-span mechanism
`filing_sections.py` uses for top-level Items. **That assumption does not hold**, and neither did
several of this module's own early revisions -- each of the findings below was found by running
against the three real filings and checking the actual output, not by inspecting the HTML once and
assuming a pattern generalizes:

- The "Report of Independent Registered Public Accounting Firm" heading itself is UNRELIABLY
  classified -- a `TitleElement` for Apple and JPMorgan, but plain inline text inside a
  `TextElement` for Microsoft. Detection cannot depend on title classification at all for the
  DISCLAIMER search; it has to search every element's text, any type.
- **The SAME heading can also repeat mid-page as a running header**, classified as a real
  `TitleElement` -- found directly in JPMorgan's filing, sitting in the MIDDLE of a CAM matter's
  own discussion. A second occurrence is only treated as the region's real end when it's followed
  shortly by an actual report opening ("To the ... Board of Directors..."); otherwise it's a
  spurious repeat, skipped as noise rather than mistaken for a stop signal (`_REPORT_OPENING`).
- **Running page headers ("PART II", "Item 8") can land as `PageHeaderElement`s interleaved with
  real content** -- confirmed in Microsoft's filing. An early version of this module both let them
  interrupt sentence-continuation detection AND included their text in the extracted matter,
  producing titles like "PART II Item 8 Revenue Recognition". Fixed by restricting content
  collection to `TextElement` only (excluding `SupplementaryText`, the same exclusion
  `filing_sections.segment_filing` applies).
- **A page boundary can split one matter's discussion across two separate `TextElement`s
  mid-sentence**, with the spurious running-header repeat above sitting in between -- found in
  JPMorgan's filing, where a matter's text stopped mid-word-run ("...fair value estimate of certain
  level") and resumed in the next real content element ("3 financial instruments; (ii) a high
  degree..."). `_merge_continuations` re-joins any element whose text doesn't end in terminal
  punctuation with the one that follows, WITH an inserted space (unlike the no-space tag-boundary
  joins below -- a page break splits mid-word-run, where a real space existed in the original text;
  a tag boundary is where none ever did).
- Individual CAM matters are SOMETIMES their own `TextElement` (Microsoft: two matters, two
  elements, cleanly separated after the above fixes) and SOMETIMES merged into one blob with the
  report's boilerplate opinion language and the CAM disclaimer paragraph all run together with no
  space at the join (Apple: one matter; JPMorgan: two matters). Both patterns are handled by the
  same extraction path.
- PCAOB AS 3101 mandates the CONCEPT of a "the critical audit matter(s) ... arising from the
  current period audit ... communicated ... material ... complex judgments" disclaimer, followed by
  a SECOND sentence disclaiming that discussing a CAM doesn't change the opinion -- but not its
  exact wording, which varies across filers. An early version of `_DISCLAIMER` matched only the
  first sentence, leaving the second to be misread as matter content; fixed by extending the match
  through both sentences, ending at "...to which it/they relate(s)."
- A reference to the relevant financial-statement note recurs near the start of nearly every
  individual matter ("Refer to Note 1 to the financial statements", "As described in Note 13 to
  the CONSOLIDATED financial statements" -- JPMorgan's own phrasing, which an early version's
  tighter regex missed entirely, silently leaving its whole CAM section as one unsplit matter).
  Two or more such references inside one piece is a CANDIDATE signal for a further split -- but not
  by itself: a single matter can legitimately reference its own note twice (seen in Apple's filing,
  once in "Description of the Matter" and again in "How We Addressed the Matter"), and counting
  references alone (an early version's approach) split Apple's ONE matter into five fragments at
  its own INTERNAL sub-headings ("Description of the Matter" -> "How We Addressed the Matter"),
  which also collapse with no surrounding space. Fixed: a no-space boundary only counts as a matter
  split when it sits shortly BEFORE a note-reference that isn't the piece's first -- internal
  sub-headings are never followed shortly by a fresh note reference, only a new matter's title is.
- Where an HTML block boundary collapsed with NO surrounding whitespace (a `<p>`-to-`<p>` or
  `<b>`-to-`<p>` join), the joined text shows a lowercase/digit/close-paren character immediately
  followed by a period immediately followed by an uppercase letter, with zero space -- e.g. Apple's
  "...to which it relates.Uncertain Tax Positions...". Verified NOT to fire on "U.S."-style
  abbreviations (the character before that period is itself uppercase).
- Every audit report closes with a PCAOB-mandated auditor-tenure sentence ("We have served as the
  Company's/Firm's auditor since [year].") -- the single most reliable stop signal available,
  because unlike the report heading it never repeats as a running header, and unlike an Item
  heading it doesn't depend on the NEXT section being correctly title-classified. Checked first,
  and INCLUSIVE of its own element (every other stop condition excludes the triggering element).
  Without it, JPMorgan's scan ran past the report entirely and pulled in real financial-statement
  tables as spurious "matters" -- caught by checking actual output against real content, not by
  trusting the region-boundary logic in isolation.

## What this buys, and what it honestly doesn't

This extracts real, readable CAM content for filers whose matters land in separate elements
(Microsoft-style) with full fidelity, and for filers whose matters merge into one blob (Apple-,
JPMorgan-style) it recovers each individual matter via the note-reference/no-space-boundary
heuristic where that signal is present. It does NOT guarantee a clean split for every filer's
idiosyncratic phrasing -- a matter boundary with neither a fresh note reference nor a no-space join
nearby simply won't be found, and that matter stays merged with its neighbor rather than being
guessed apart. This is the same "an unwilling parser beats a wrong one" trade-off `sec/exhibits.py`
established for EX-21: a merged block is presented as itself, honestly, not silently split on a
guess. `title_text` is BEST-EFFORT ONLY (a regex up to a known description-intro phrase, `None` if
none found) -- it is never load-bearing for what a matter is ABOUT; that's the (not yet built)
embedding classifier's job (§8.1/§8.3), not this module's.
"""

from __future__ import annotations

import re
import warnings
from dataclasses import dataclass

#: Bumped whenever the extraction algorithm changes in a way that could change output for filings
#: already parsed -- same cache-heals-on-read convention as SECTIONS_SCHEMA_VERSION.
#:
#: 1 -- initial disclaimer-anchored, note-reference/no-space-period split, verified against
#:      Apple (1 matter, merged blob), Microsoft (2 matters, separate elements), and JPMorgan
#:      Chase (2+ matters, merged blob).
CAM_SCHEMA_VERSION = 1

#: Anchors on the PCAOB AS 3101 disclaimer's CONCEPT (communicated to the audit committee,
#: material, involved complex judgment, followed by a second sentence disclaiming that discussing
#: a CAM doesn't change the opinion), not literal wording -- confirmed to vary across real filers.
#: The disclaimer is TWO sentences in every filer checked, both consumed by one match ending at
#: "...to which it/they relate(s)." -- an earlier version stopped after the first sentence
#: ("...complex judgments") and left the second sentence to be misread as matter content; fixed
#: after finding it produce exactly that in Apple's and JPMorgan's real filings. `.{0,1200}?` bounds
#: the span so a stray "critical audit matter" mention elsewhere can't match across an implausible
#: gap.
_DISCLAIMER = re.compile(
    r"critical\s+audit\s+matters?\b.{0,80}(?:communicated|arising\s+from).{0,1200}?"
    r"relates?\.",
    re.I | re.S,
)

#: PCAOB AS 3101.14 mandates every audit report close with an auditor-tenure sentence -- confirmed
#: verbatim (modulo firm/entity-noun phrasing) in all three filers checked: Apple "...We have
#: served as the Company's auditor since 2009.", Microsoft "...since 1983.", JPMorgan "...as the
#: Firm's auditor since 1965." The single most reliable stop signal available: unlike
#: `_REPORT_HEADING`, it never repeats as a running page header, and unlike `_ITEM_HEADING`, it
#: doesn't depend on the next Item being correctly title-classified. Checked FIRST, and INCLUSIVE
#: of the element it's found in (every other stop condition excludes its own triggering element).
_AUDITOR_SINCE = re.compile(
    r"we\s+have\s+(?:served|acted)\s+as\s+(?:the\s+\S+['’]s|its)\s+auditor\s+since\s+\d{4}",
    re.I,
)

#: Unreliable as a TITLE classification, per the module docstring -- searched across every
#: element's text regardless of type, only used to bound the END of the CAM region (the matching
#: report repeats once more for the ICFR opinion, which never carries CAMs).
_REPORT_HEADING = re.compile(
    r"report\s+of\s+independent\s+registered\s+public\s+accounting\s+firm", re.I
)

#: A repeated `_REPORT_HEADING` match is NOT always a real second report -- found directly in
#: JPMorgan's real filing: this exact heading text reappears mid-page, in the MIDDLE of a CAM
#: matter's own discussion (a running-page-header artifact `sec-parser` classified as a real
#: `TitleElement` there, unlike Microsoft's equivalent running headers, which landed as harmless
#: `PageHeaderElement`s). A genuine second report is always followed shortly by its own opening --
#: verified across all three filers ("To the Shareholders and the Board of Directors...", "To the
#: Stockholders and the Board of Directors...") -- so a repeat is only treated as the region's real
#: end when this follows it; otherwise it's skipped as noise and the scan continues past it.
_REPORT_OPENING = re.compile(r"to\s+the\s+(?:share|stock)holders|board\s+of\s+directors", re.I)

_ITEM_HEADING = re.compile(r"^item\s+\d", re.I)

#: A reference to the relevant financial-statement note, present near the start of nearly every
#: individual CAM matter across all three filers checked. `(?:consolidated\s+)?` is required, not
#: cosmetic -- JPMorgan phrases every reference "Note N to the CONSOLIDATED financial statements"
#: (Apple and Microsoft omit "consolidated"); an earlier version's tighter gap between "the" and
#: "financial" matched zero references in JPMorgan's real filing, which fed nothing into the
#: splitter and silently left its content as one truncated, unsplit matter -- found by direct
#: verification against JPMorgan's real 10-K, not assumed correct from the two filers checked first.
_NOTE_REF = re.compile(
    r"\bnote\s+\d+[a-z]?\s+to\s+the\s+(?:consolidated\s+)?financial\s+statements", re.I
)

#: The no-space HTML-block-join artifact -- verified NOT to fire on "U.S."-style abbreviations
#: (the character before the period there is uppercase, excluded by the lowercase/digit lookbehind).
#: **Fires on TWO different kinds of boundary, only one of which is a real matter split** -- found
#: directly in Apple's real filing, not assumed: it also fires between a matter's OWN internal
#: sub-headings ("...complex domestic and international tax laws.Auditing management's
#: evaluation...", "...interpretations of tax laws.How We Addressed theMatter in Our Audit..."),
#: which are NOT new matters. Counting note-references per piece and splitting on every no-space
#: boundary once 2+ are found (an earlier version of this module did exactly that) split Apple's
#: ONE matter into five fragments at its internal sub-headings. Fixed: only treat a no-space
#: boundary as a matter split when it sits close BEFORE a note-reference that isn't the first one
#: found -- internal sub-headings ("Description of the Matter", "How We Addressed...") are never
#: followed shortly by a fresh Note reference, only a new matter's title is.
_MID_BLOB_SPLIT = re.compile(r"(?<=[a-z0-9)%])\.(?=[A-Z])")

#: How far back from a note-reference to look for the no-space boundary that starts its matter's
#: title -- generous enough to cover JPMorgan's longest observed title ("Allowance for Loan
#: Losses – Portfolio-Based Component of the Wholesale and Credit Card Retained Loan Portfolios",
#: ~115 chars), small enough that an internal sub-heading's own boundary (which sits much further
#: from any note-reference, if one is nearby at all) doesn't get mistaken for one.
_SPLIT_LOOKBACK_CHARS = 150

#: An element's text NOT ending in terminal punctuation means it was cut off mid-sentence --
#: confirmed happening in JPMorgan's real filing, where a page boundary split one matter's
#: discussion across two `TextElement`s (with the spurious repeated report heading from
#: `_REPORT_OPENING`'s docstring sitting in between, already skipped by then). Joined WITH a space
#: (unlike `_MID_BLOB_SPLIT`'s no-space tag-boundary joins) because a page-break split happens
#: mid-word-RUN, not mid-tag -- the original text had a real space there ("...level 3 financial
#: instruments...", not "...level3 financial instruments...").
_TERMINAL_PUNCT = re.compile(r"[.!?][\"')]?\s*$")

#: Best-effort title boundary -- known phrasings observed across the three filers checked. Not
#: exhaustive; a filer using different phrasing simply gets `title_text=None`, never a guess.
_TITLE_STOP = re.compile(
    r"(?:as\s+(?:discussed|described|disclosed)\s+in|refer\s+to)\s+note\s+\d+"
    r"|description\s+of\s+the\s+matter"
    r"|critical\s+audit\s+matter\s+description",
    re.I,
)

_WORD = re.compile(r"[A-Za-z']+")

#: A real CAM description runs to several hundred words in every filing checked; a floor well
#: below that catches a stray near-empty fragment (a signature block, a page-header leak) without
#: rejecting a legitimately terse matter.
_MIN_WORDS = 40

#: How far past the disclaimer to look for the region's end boundary before giving up and using
#: the bound itself -- generous enough to cover JPMorgan's longest observed run, small enough to
#: never wander into unrelated later Items.
_MAX_SCAN_AHEAD = 25

_MAX_TITLE_CHARS = 120


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


@dataclass
class CamMatterResult:
    ordinal: int
    title_text: str | None
    cleaned_text: str
    word_count: int
    status: str = "ok"  # "ok" | "na"
    reason: str | None = None


def _na(reason: str) -> list[CamMatterResult]:
    return [
        CamMatterResult(
            ordinal=1, title_text=None, cleaned_text="", word_count=0, status="na", reason=reason
        )
    ]


def _extract_title(text: str) -> str | None:
    m = _TITLE_STOP.search(text)
    if not m:
        return None
    title = text[: m.start()].strip(" -–—")
    return title[:_MAX_TITLE_CHARS] or None


def _merge_continuations(raw_texts: list[str]) -> list[str]:
    """Re-join element texts split mid-sentence by a page boundary, WITH a space (see
    `_TERMINAL_PUNCT`'s docstring). A genuinely new element -- Microsoft's two matters, each its
    own clean `TextElement` -- always ends the prior one in terminal punctuation, so it's never
    merged; only a mid-sentence cutoff triggers this.
    """
    merged: list[str] = []
    for text in raw_texts:
        if not text.strip():
            continue
        if merged and not _TERMINAL_PUNCT.search(merged[-1]):
            merged[-1] = f"{merged[-1]} {text}"
        else:
            merged.append(text)
    return merged


def _split_merged_piece(piece: str) -> list[str]:
    """Split one element's text into separate matters where the evidence supports it: a no-space
    HTML-join boundary sitting shortly before a note-reference that isn't the piece's first.

    The FIRST note-reference is always assumed to belong to the piece's own opening matter (it's
    what usually establishes the piece already has a matter in it) -- only subsequent references
    are candidates for a split. See `_MID_BLOB_SPLIT`'s docstring for why counting references
    alone (an earlier version's approach) over-splits on a matter's own internal sub-headings.
    """
    note_matches = list(_NOTE_REF.finditer(piece))
    if len(note_matches) < 2:
        return [piece]

    split_points: list[int] = []
    for note_match in note_matches[1:]:
        window_start = max(0, note_match.start() - _SPLIT_LOOKBACK_CHARS)
        window = piece[window_start : note_match.start()]
        boundary = None
        for m in _MID_BLOB_SPLIT.finditer(window):
            boundary = window_start + m.end()  # last boundary in the window wins
        if boundary is not None:
            split_points.append(boundary)

    if not split_points:
        return [piece]

    split_points = sorted(set(split_points))
    result: list[str] = []
    start = 0
    for point in split_points:
        result.append(piece[start:point])
        start = point
    result.append(piece[start:])
    return result


def segment_cam_matters(document_html: str) -> list[CamMatterResult]:
    """Extract one row per detected CAM matter from a 10-K's primary document.

    10-K only by construction -- CAMs are a feature of the AS 3101 auditor's-report opinion,
    which a 10-Q's unaudited interim statements don't carry. No `form` parameter: unlike
    `filing_sections.segment_filing`, there is no 10-Q variant to branch on: the caller decides
    whether to call this at all (only for 10-K accessions), the same way it decides which form to
    pass `segment_filing`.

    Always returns at least one `CamMatterResult` -- `status="na"` with a reason when no
    disclaimer is found, or when a disclaimer is found but nothing survives the word-count floor.
    """
    import sec_parser as sp

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=UserWarning)
            elements = sp.Edgar10QParser().parse(document_html)
    except Exception as exc:  # noqa: BLE001 -- a malformed document is a parse failure, not a crash
        return _na(f"This document could not be parsed ({exc.__class__.__name__}).")

    disclaimer_idx = None
    disclaimer_match = None
    for i, el in enumerate(elements):
        text = getattr(el, "text", "") or ""
        m = _DISCLAIMER.search(text)
        if m:
            disclaimer_idx, disclaimer_match = i, m
            break

    if disclaimer_idx is None:
        return _na(
            "No recognizable Critical Audit Matters disclaimer found in this filing's "
            "auditor's report."
        )

    scan_limit = min(disclaimer_idx + 1 + _MAX_SCAN_AHEAD, len(elements))
    end_idx = scan_limit
    skip_indices: set[int] = set()
    for i in range(disclaimer_idx + 1, scan_limit):
        el = elements[i]
        text = getattr(el, "text", "") or ""
        if _AUDITOR_SINCE.search(text):
            end_idx = i + 1  # inclusive -- this element IS the report's real closing content
            break
        # A real Item heading only counts from an actual title-classified element -- a
        # `PageHeaderElement` repeating "Item 8" on every page (confirmed happening in Microsoft's
        # real filing, still deep inside the financial statements) is cosmetic running-header
        # noise, not a section boundary.
        if isinstance(el, (sp.TitleElement, sp.TopSectionTitle)) and _ITEM_HEADING.match(
            _normalize(text)
        ):
            end_idx = i
            break
        if _REPORT_HEADING.search(text):
            lookahead = " ".join(
                getattr(elements[j], "text", "") or ""
                for j in range(i + 1, min(i + 3, len(elements)))
            )
            if _REPORT_OPENING.search(lookahead[:300]):
                end_idx = i
                break
            skip_indices.add(i)  # a running-header repeat, not a real second report -- see above

    disclaimer_el_text = getattr(elements[disclaimer_idx], "text", "") or ""
    remainder = disclaimer_el_text[disclaimer_match.end() :]
    # CONTENT only from `TextElement` (excluding `SupplementaryText`, same exclusion
    # `filing_sections.segment_filing` applies) -- `PageHeaderElement`/`EmptyElement`/etc. carry no
    # real matter prose and, left in, leak running-header fragments ("PART II", "Item 8") into a
    # matter's text -- confirmed happening in Microsoft's real filing before this fix.
    raw_texts = [remainder] + [
        (getattr(elements[i], "text", "") or "")
        for i in range(disclaimer_idx + 1, end_idx)
        if i not in skip_indices
        and isinstance(elements[i], sp.TextElement)
        and not isinstance(elements[i], sp.SupplementaryText)
    ]
    pieces = _merge_continuations(raw_texts)

    raw_matters: list[str] = [s for piece in pieces for s in _split_merged_piece(piece)]

    results: list[CamMatterResult] = []
    for raw in raw_matters:
        cleaned = _normalize(raw)
        word_count = len(_WORD.findall(cleaned))
        if word_count < _MIN_WORDS:
            continue
        results.append(
            CamMatterResult(
                ordinal=len(results) + 1,
                title_text=_extract_title(cleaned),
                cleaned_text=cleaned,
                word_count=word_count,
            )
        )

    if not results:
        return _na(
            "Matched a Critical Audit Matters disclaimer but no individual matter content could "
            "be confidently isolated."
        )
    return results
