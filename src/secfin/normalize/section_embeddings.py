"""Sentence-level embeddings for filing section text (Track 2 Wave B, embedding infra).

Design: `docs/ROADMAP_TRACK2.md` §8.1. Classification (risk themes, CAM topics, litigation
categories -- none of it built yet) scores a filing's SENTENCES against a small curated set of
category anchor vectors; this module is the shared piece both sides need -- split a section's
already-parsed `cleaned_text` into sentences (Wave A's own boundary definition,
`sec.filing_sections.split_sentences`, reused rather than re-defined), embed each one, and give a
plain cosine-similarity primitive to score with. No taxonomy, no anchor corpus, and no wiring into
the ingest pipeline lives here yet -- this module is the embedding/similarity primitive only.

`fastembed` (ONNX Runtime, no torch) is the model runtime -- an operator decision, 2026-08-26,
over reusing `section_similarity.py`'s hand-rolled word-count-vector cosine: real risk-factor and
CAM language repeats across filers closely enough that literal term-overlap works passably for
Wave A's filing-vs-prior-filing YoY diffing, but scoring a sentence against a BRIEF category
description needs semantic match, not just shared vocabulary. Pinned model:
`BAAI/bge-small-en-v1.5` (~130MB, fastembed's own flagship small model) -- small enough to bake
into the `narrative` image without materially changing its footprint versus `sec-parser` alone.

Both `fastembed` and `numpy` are imported LAZILY, inside the functions that need them -- same
discipline `sec/filing_sections.py` uses for `sec_parser` (`import sec_parser as sp` inside
`segment_filing`, not at module scope) -- so importing this module never requires the `narrative`
extra to be installed; only calling `embed_sentences` or the similarity helpers does.
"""

from __future__ import annotations

#: Bumped whenever the embedding model (or its pinned version) changes in a way that invalidates
#: previously-stored vectors -- a row written under an older version reads as a cache MISS, same
#: convention as SECTIONS_SCHEMA_VERSION / METRICS_SCHEMA_VERSION / SIMILARITY_SCHEMA_VERSION.
#:
#: 1 -- BAAI/bge-small-en-v1.5 via fastembed==0.8.0, 384-dim.
EMBEDDINGS_SCHEMA_VERSION = 1

#: fastembed's flagship small model; picked for size (~130MB) over larger/more-accurate options --
#: see the module docstring. Pinned here, not just in pyproject.toml's version pin, because the
#: two-part identity -- library version AND model name -- together determine what a stored vector
#: means; either changing invalidates every stored embedding (bump EMBEDDINGS_SCHEMA_VERSION).
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"

#: BAAI/bge-small-en-v1.5's output width. Not stored per-row (would be redundant); kept here as
#: the single source of truth the SQLite repository's BLOB (de)serialization sizes against.
EMBEDDING_DIM = 384

_model = None  # lazily constructed, one instance per process -- fastembed loads the ONNX model file


def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding

        _model = TextEmbedding(model_name=EMBEDDING_MODEL_NAME)
    return _model


def embed_sentences(sentences: list[str]) -> list[list[float]]:
    """Embed each sentence independently, preserving input order.

    One call per filing section at ingest time (Stage 5) -- never on the live request path. Empty
    input returns an empty list without loading the model, so a section with no sentences (an
    `na`-status Stage 2 result) never pays the model-load cost.
    """
    if not sentences:
        return []
    model = _get_model()
    return [vec.tolist() for vec in model.embed(sentences)]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two embedding vectors.

    BGE models embed pre-normalized, so a dot product alone would do for two `fastembed` vectors
    -- computed generally instead (dividing by both norms) since a checked-in anchor vector could
    in principle come from a different pipeline someday, and the extra cost is negligible.
    """
    import numpy as np

    va, vb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    norm_a, norm_b = float(np.linalg.norm(va)), float(np.linalg.norm(vb))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


def best_match(query: list[float], candidates: list[list[float]]) -> tuple[int, float]:
    """Index into `candidates` and the similarity score of whichever is closest to `query`.

    Used both directions by the (not-yet-built) classifier: which theme a sentence best matches
    (few candidates -- the taxonomy's anchor vectors), and which sentence best represents a
    matched theme (many candidates -- a whole section). Raises `ValueError` on an empty candidate
    list -- there is no meaningful "best of nothing", and a caller silently getting index 0 back
    would be a worse bug than a loud failure here.
    """
    if not candidates:
        raise ValueError("best_match: candidates must be non-empty")
    scores = [cosine_similarity(query, c) for c in candidates]
    best_i = max(range(len(scores)), key=lambda i: scores[i])
    return best_i, scores[best_i]
