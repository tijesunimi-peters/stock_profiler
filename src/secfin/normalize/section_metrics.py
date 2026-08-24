"""Derived tone and readability metrics over a filing section's text (Track 2 Wave A, Stage 3).

No network, no LLM, no DB -- pure computation over the `cleaned_text` `sec/filing_sections.py`
already extracted and stored.

## The word list is AFINN, not Loughran-McDonald -- and the fields are named accordingly

The plan for this stage originally called for the Loughran-McDonald Master Dictionary (positive /
negative / uncertainty / litigious / constraining / weak-modal / strong-modal). **Checked, not
assumed, during implementation (2026-08-23): the LM dictionary is not freely redistributable** --
`sraf.nd.edu`'s own download page routes to `mailto:loughranmcdonald@gmail.com?subject=LM%20
Dictionary%20License`, a license-by-request gate, not an open file. Bundling it into this repo
without that license would misrepresent unlicensed data as available for commercial use, and
recreating LM's own curated word lists from memory would just be an unlicensed derivative of the
same editorial work under a different name -- so neither path is taken.

**What ships instead, on operator direction (2026-08-23):**

- **Positive / negative tone**: AFINN-165 (`normalize/afinn_wordlist.txt`, checked into git
  verbatim) -- Finn Årup Nielsen's general-purpose sentiment word list, Apache-2.0 licensed,
  fetched from its canonical source (github.com/fnielsen/afinn) and redistributed here under that
  license. It is a GENERAL sentiment lexicon (originally built for microblog text), not a
  finance-domain one -- weaker than LM's 10-K-tuned word choices, and the caveat travels with
  every reading built on it. Citation: Finn Årup Nielsen, "A new ANEW: evaluation of a word list
  for sentiment analysis in microblogs", 2011.
- **Weak/strong modal**: the standard English modal auxiliary verbs, categorized by degree of
  certainty they express -- this is ordinary grammar (a closed, ~10-word set), not a licensed
  dataset, and is NOT a reproduction of LM's own modal-word curation.
- **Uncertainty and litigious tone are NOT computed.** No genuinely open, freely-redistributable
  word list for either was found. Shipping a self-authored substitute and calling it "uncertainty"
  or "litigious" tone would invite exactly the same false-precision problem as fabricating the LM
  list itself -- these fields are simply absent rather than approximated.
- **Fog index and Flesch-Kincaid** are unaffected by any of this -- pure syllable-counting
  formulas, no word list of any kind.

Table/column names reflect this honestly: `tone_positive`/`tone_negative` (not `lm_positive`),
`weak_modal`/`strong_modal`, `fog_index`, `flesch_kincaid`. There is no `lm_uncertainty` /
`lm_litigious` / `lm_constraining` column.
"""

from __future__ import annotations

import functools
import re
from dataclasses import dataclass
from pathlib import Path

#: Bumped whenever the word list or the scoring formula changes in a way that would change output
#: for sections already scored -- a row written under an older version reads as a cache MISS (see
#: storage/sqlite_section_metric_repository.py), forcing a re-score and heal. Same convention as
#: sec/filing_sections.py's SECTIONS_SCHEMA_VERSION / sec/cover.py's COVER_SCHEMA_VERSION.
#:
#: 1 -- initial AFINN tone (positive/negative) + modal-verb + Fog/Flesch-Kincaid scoring
METRICS_SCHEMA_VERSION = 1

_WORDLIST_PATH = Path(__file__).parent / "afinn_wordlist.txt"

#: The standard English modal auxiliary verbs -- ordinary grammar, not a licensed word list.
#: "Strong" modals commit to a claim; "weak" modals hedge it. Loughran-McDonald's own weak/strong
#: modal categories are built on the same underlying set of English modals; this is not a
#: reproduction of their curation, just the closed set any grammar reference gives.
_STRONG_MODAL = frozenset({"will", "must", "shall"})
_WEAK_MODAL = frozenset({"may", "might", "could", "should", "would", "can"})

_WORD = re.compile(r"[A-Za-z']+")
_VOWEL_GROUP = re.compile(r"[aeiouy]+")
_SENTENCE_END = re.compile(r"[.!?]+(?:\s|$)")


@functools.lru_cache(maxsize=1)
def _afinn_scores() -> dict[str, int]:
    """word (lowercase) -> valence score (-5..+5). Loaded once, from the checked-in AFINN-165
    file -- no network, no pandas, plain stdlib."""
    scores: dict[str, int] = {}
    with _WORDLIST_PATH.open(encoding="utf-8") as f:
        for line in f:
            word, _, score = line.strip().partition("\t")
            if word and score:
                scores[word] = int(score)
    return scores


def _syllables(word: str) -> int:
    """A standard heuristic: count vowel groups, drop a trailing silent 'e', floor at 1."""
    w = word.lower()
    groups = len(_VOWEL_GROUP.findall(w))
    if w.endswith("e") and not w.endswith(("le", "ue")) and groups > 1:
        groups -= 1
    return max(1, groups)


@dataclass
class TextMetrics:
    tone_positive: float | None  # AFINN positive-word rate (0-1), None if the section has no words
    tone_negative: float | None
    weak_modal: float | None
    strong_modal: float | None
    fog_index: float | None  # None if the section has no sentences
    flesch_kincaid: float | None


def compute_text_metrics(text: str) -> TextMetrics:
    """Derive tone and readability metrics from a section's cleaned text.

    A rate (hits / total words), not a raw count -- comparable across sections of different
    length, same reasoning `docs/ROADMAP_TRACK2.md` gives for every LM-style score.
    """
    words = _WORD.findall(text)
    if not words:
        return TextMetrics(None, None, None, None, None, None)

    afinn = _afinn_scores()
    n = len(words)
    lower = [w.lower() for w in words]
    tone_positive = sum(1 for w in lower if afinn.get(w, 0) > 0) / n
    tone_negative = sum(1 for w in lower if afinn.get(w, 0) < 0) / n
    weak_modal = sum(1 for w in lower if w in _WEAK_MODAL) / n
    strong_modal = sum(1 for w in lower if w in _STRONG_MODAL) / n

    sentences = max(1, len(_SENTENCE_END.findall(text)))
    syllables = [_syllables(w) for w in words]
    total_syllables = sum(syllables)
    complex_words = sum(1 for s in syllables if s >= 3)

    fog_index = 0.4 * ((n / sentences) + 100 * (complex_words / n))
    flesch_kincaid = 0.39 * (n / sentences) + 11.8 * (total_syllables / n) - 15.59

    return TextMetrics(
        tone_positive=tone_positive,
        tone_negative=tone_negative,
        weak_modal=weak_modal,
        strong_modal=strong_modal,
        fog_index=fog_index,
        flesch_kincaid=flesch_kincaid,
    )
