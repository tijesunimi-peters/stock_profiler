"""Embedding-cosine classification against an anchor taxonomy (Track 2 Wave B §8.4 step 4).

Wires `section_embeddings.py`'s embed/cosine/best-match primitives against
`classification_taxonomy.py`'s anchor sets. Two directions, not one, because the two consumers
ask genuinely different questions:

- **Risk themes** (`QUAL_THEMES`): does this filer's Risk Factors section touch a given theme AT
  ALL, among many short passages, possibly several themes at once? `classify_sentences` -- for
  EACH anchor, find the best-matching passage in the whole section; "present" if that best match
  clears the threshold, and the matching passage IS the excerpt (`THEME_LANG`) -- extractive,
  nothing generated.
- **CAM topics** (`CAMS`): which ONE topic does this already-segmented, single-subject CAM matter
  belong to? `classify_topic` -- the REVERSE query direction: one coherent unit of text against
  every anchor, taking the single best match (or none, if nothing clears the threshold). A CAM
  matter is never "about" more than one topic in this project's taxonomy; asking
  `classify_sentences` the other way would wrongly imply it could match several at once.

Both share the anchor-embedding step (`_anchor_vectors`, cached per-process). Keyed on the
anchors' CONTENT (each description, joined), not `id(anchors)` -- an earlier version used identity
and broke on exactly the kind of ad-hoc slice a caller might reasonably construct (e.g. testing one
anchor at a time via a fresh single-element tuple each call): CPython can and does reuse a freed
tuple's memory address for the next short-lived tuple, so `id()` silently returned a PRIOR anchor
set's cached vectors for an unrelated one -- found by a test producing identical scores for every
anchor regardless of which one was actually passed. `RISK_THEMES`/`CAM_TOPICS` remain the only
anchor sets this module is called with today, but the cache is correct for any tuple now, not just
those two by accident of being long-lived module constants.

## `classify_sentences` groups sentences into passages -- verified necessary, not a default guess

The Wave B design (`docs/ROADMAP_TRACK2.md` §8.1) flagged this as the one place worth empirical
validation before trusting the reuse, and it was right to: run against Apple's real 259-sentence
Risk Factors section, ONE SENTENCE AT A TIME, every one of the 9 `RISK_THEMES` anchors scored in a
narrow 0.71-0.87 band with no real separation, and two semantically unrelated anchors
("AI-demand dependence" and "Foundry / supply concentration") landed on the EXACT SAME best-
matching sentence. `classify_topic`'s CAM-matter classification, tested the same day against three
real matters (Apple, Microsoft x2), was NOT affected -- it correctly classified every one, with a
clean 0.06-0.12 gap between the top match and the runner-up. The difference is unit size, not the
model or the mechanism: a CAM matter is a coherent several-hundred-word passage compared against a
topic description (a passage-vs-passage comparison); a single RF sentence is often short, generic
"...could adversely affect the Company's business, financial condition and results of operations"
boilerplate that carries too little topic-specific signal on its own.

Re-running the SAME Apple section grouped into ~4-sentence passages (a paragraph-sized unit, not a
single sentence) reproduced CAM's separation: on-topic themes clustered at 0.74-0.82 with genuinely
on-topic excerpts (export controls matched a passage about "restrictive measures... rare earths and
other raw materials"; foundry/supply matched "initial capacity constraints... suppliers' yields");
themes with weak or no real support in the section (e.g. "Water / energy for fabs" -- Apple is
fabless, it doesn't operate its own fabs) correctly scored lower, 0.66-0.68. `DEFAULT_CHUNK_SIZE`
and `DEFAULT_THEME_THRESHOLD` below are set from that one filing's score distribution -- a real,
directionally-confirmed finding, but ONE filing is not a validated production threshold. Both are
explicitly provisional; re-tune against a broader real-filing sample before this ships live, same
"verify, don't assume" discipline as every other threshold in this codebase.
"""

from __future__ import annotations

from dataclasses import dataclass

from secfin.normalize.classification_taxonomy import ThemeAnchor
from secfin.normalize.section_embeddings import best_match, embed_sentences

#: A paragraph-sized unit, not a single sentence -- see the module docstring for why per-sentence
#: classification failed to discriminate between themes on a real Risk Factors section.
DEFAULT_CHUNK_SIZE = 4

#: Set from Apple's real chunked score distribution (on-topic themes: 0.74-0.82; weak/absent
#: themes: 0.66-0.68) -- a real gap, but a single filing's data point. Provisional; needs
#: validation against a broader sample before treating as a production default.
DEFAULT_THEME_THRESHOLD = 0.70

#: Set from three real CAM-matter classifications (Apple, Microsoft x2), all correct, all with a
#: 0.06+ gap to the runner-up -- comfortably above this floor. Also provisional for the same
#: single-session-sample reason as DEFAULT_THEME_THRESHOLD, though the observed margin is wider.
DEFAULT_TOPIC_THRESHOLD = 0.70

_anchor_vector_cache: dict[tuple[str, ...], list[list[float]]] = {}


def _anchor_cache_key(anchors: tuple[ThemeAnchor, ...]) -> tuple[str, ...]:
    return tuple(a.description for a in anchors)


def _anchor_vectors(anchors: tuple[ThemeAnchor, ...]) -> list[list[float]]:
    key = _anchor_cache_key(anchors)
    cached = _anchor_vector_cache.get(key)
    if cached is None:
        cached = embed_sentences([a.description for a in anchors])
        _anchor_vector_cache[key] = cached
    return cached


def _group_sentences(sentences: list[str], chunk_size: int) -> list[str]:
    if chunk_size <= 1:
        return sentences
    return [
        " ".join(sentences[i : i + chunk_size]) for i in range(0, len(sentences), chunk_size)
    ]


@dataclass
class ThemeMatch:
    theme_name: str
    matched: bool
    similarity: float
    excerpt: str | None  # the best-matching passage, only set when matched


def classify_sentences(
    sentences: list[str],
    anchors: tuple[ThemeAnchor, ...],
    threshold: float = DEFAULT_THEME_THRESHOLD,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> list[ThemeMatch]:
    """One `ThemeMatch` per anchor -- whether THIS section touches it, and if so, which passage.

    `sentences` are grouped into `chunk_size`-sentence passages before embedding (see the module
    docstring for why single-sentence classification doesn't discriminate). Pass `chunk_size=1` to
    disable grouping and classify sentence-by-sentence -- kept explicit, not the default, since
    that's the configuration verified NOT to work well on real data.

    Empty `sentences` returns every anchor as unmatched without loading the model (mirrors
    `section_embeddings.embed_sentences`'s own empty-input short-circuit).
    """
    if not sentences:
        return [ThemeMatch(a.name, False, 0.0, None) for a in anchors]
    passages = _group_sentences(sentences, chunk_size)
    passage_vectors = embed_sentences(passages)
    results = []
    for anchor, anchor_vec in zip(anchors, _anchor_vectors(anchors), strict=True):
        best_i, score = best_match(anchor_vec, passage_vectors)
        matched = score >= threshold
        excerpt = passages[best_i] if matched else None
        results.append(ThemeMatch(anchor.name, matched, score, excerpt))
    return results


@dataclass
class TopicClassification:
    topic_name: str | None  # None when nothing clears the threshold -- never a forced guess
    similarity: float


def classify_topic(
    text: str, anchors: tuple[ThemeAnchor, ...], threshold: float = DEFAULT_TOPIC_THRESHOLD
) -> TopicClassification:
    """The single best-matching anchor for ONE coherent unit of text (a CAM matter), or none.

    Unlike `classify_sentences`, this embeds `text` as a single unit (not split or grouped) -- a
    CAM matter's title, description, and audit-response prose together identify its topic; no
    fragment within it should be scored in isolation against the whole taxonomy. Verified
    end-to-end against three real CAM matters -- see the module docstring.
    """
    vec = embed_sentences([text])[0]
    best_i, score = best_match(vec, _anchor_vectors(anchors))
    if score < threshold:
        return TopicClassification(None, score)
    return TopicClassification(anchors[best_i].name, score)
