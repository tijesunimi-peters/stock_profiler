"""YoY section-text similarity (Track 2 Wave A, Stage 4).

Hand-rolled cosine + Jaccard over word-count vectors -- no numpy, matching this codebase's one
other similarity precedent, `normalize/coholding.py`'s hand-rolled Jaccard
(`jaccard = shared / len(a | b)`) for 13F manager overlap.

## No "meaningfully changed" threshold in this pass

`normalize/filing_changes.py`'s own documented lesson is the direct precedent for restraint here:
a value-level restatement diff was tried and abandoned after producing 289-876 false-positive-
heavy diffs per company, dominated by boilerplate reclassification noise rather than real
restatements. This module ships only the raw `cosine_similarity`/`jaccard_similarity` scores.
MD&A boilerplate reordering could produce a spuriously low score the same way tag reclassification
did there; a "meaningfully changed" cutoff is deliberately deferred to a follow-up pass, once real
scores exist across enough filings to look at rather than guess a number now.

## Finding the prior filing

A query against the local `FilingIndexRepository`, not a cross-database attach -- this project has
one operational SQLite database. Comparison is same-form-only (10-K against 10-K, 10-Q against
10-Q): a 10-Q's often-brief "no material changes" Risk Factors section against a 10-K's full one
would produce a spurious near-zero similarity that is a FORM-TYPE artifact, not a real rewrite.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass

#: Bumped whenever the similarity computation itself changes -- a row written under an older
#: version is a cache MISS, not an answer, same convention as the other Wave A modules.
#:
#: 1 -- initial hand-rolled cosine + Jaccard over word-count vectors
SIMILARITY_SCHEMA_VERSION = 1

_WORD = re.compile(r"[a-z']+")


def _tokens(text: str) -> Counter[str]:
    return Counter(_WORD.findall(text.lower()))


@dataclass
class SimilarityResult:
    cosine_similarity: float
    jaccard_similarity: float


def compute_similarity(current_text: str, prior_text: str) -> SimilarityResult | None:
    """Cosine + Jaccard between two sections' text. None if either side has no words -- there is
    nothing to compare, not a similarity of 0."""
    current = _tokens(current_text)
    prior = _tokens(prior_text)
    if not current or not prior:
        return None

    dot = sum(count * prior.get(word, 0) for word, count in current.items())
    norm_current = math.sqrt(sum(c * c for c in current.values()))
    norm_prior = math.sqrt(sum(c * c for c in prior.values()))
    cosine = dot / (norm_current * norm_prior) if norm_current and norm_prior else 0.0

    current_vocab, prior_vocab = set(current), set(prior)
    shared = len(current_vocab & prior_vocab)
    jaccard = shared / len(current_vocab | prior_vocab)

    return SimilarityResult(cosine_similarity=cosine, jaccard_similarity=jaccard)


def find_prior_accession(
    filing_repo, cik: int, form: str, accession: str, *, search_limit: int = 20
) -> str | None:
    """The next-older filing of the SAME form for this company, by position in the filing index's
    newest-first order -- not necessarily "one fiscal year back" (a company's cadence can gap),
    but the closest prior comparable filing on file.

    Fetches `search_limit` rows rather than assuming `accession` is the newest (re-ingest/backfill
    can target an older filing, not only the latest) -- returns None if `accession` isn't found in
    that window at all, or is the oldest one on file.
    """
    filings = filing_repo.get_filings(cik, [form], search_limit)
    accessions = [f.accession for f in filings]
    if accession not in accessions:
        return None
    idx = accessions.index(accession)
    return accessions[idx + 1] if idx + 1 < len(accessions) else None
