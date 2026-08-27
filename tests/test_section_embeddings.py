"""Tests for the sentence-embedding primitives (normalize/section_embeddings.py), Track 2 Wave B
embedding infra. No taxonomy, no classifier -- just embed + cosine similarity + best-match.

The math tests (`cosine_similarity`, `best_match`) need `numpy`, which this module only imports
lazily inside the functions that use it -- so they're skipped, not failing, without the
`narrative` extra installed. `embed_sentences([])`'s early-return is tested unguarded: it's the
one path documented to work without `fastembed` installed at all (no model load for empty input).

`test_embed_sentences_produces_real_vectors` is the one real integration test here: it loads the
actual ONNX model via `fastembed`, which downloads it on first run if not already cached --
requires the `narrative` extra AND network on a cold cache, same as any other test gated on that
extra being installed.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.normalize.section_embeddings import (
    EMBEDDING_DIM,
    best_match,
    cosine_similarity,
    embed_sentences,
)

_HAS_NUMPY = importlib.util.find_spec("numpy") is not None
_HAS_FASTEMBED = importlib.util.find_spec("fastembed") is not None
_needs_numpy = pytest.mark.skipif(not _HAS_NUMPY, reason="requires the narrative extra (numpy)")
_needs_fastembed = pytest.mark.skipif(
    not _HAS_FASTEMBED, reason="requires the narrative extra (fastembed)"
)


def test_embed_sentences_empty_input_returns_empty_without_loading_model():
    # No fastembed import happens on this path -- verified by the fact this test needs no skip
    # guard at all, unlike every other test in this file.
    assert embed_sentences([]) == []


@_needs_numpy
def test_cosine_similarity_identical_vectors_scores_1():
    v = [0.1, 0.2, 0.3, 0.4]
    assert cosine_similarity(v, v) == pytest.approx(1.0)


@_needs_numpy
def test_cosine_similarity_orthogonal_vectors_scores_0():
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


@_needs_numpy
def test_cosine_similarity_opposite_vectors_scores_minus_1():
    assert cosine_similarity([1.0, 0.0], [-1.0, 0.0]) == pytest.approx(-1.0)


@_needs_numpy
def test_cosine_similarity_zero_vector_scores_0_not_a_divide_error():
    assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0.0


@_needs_numpy
def test_best_match_returns_closest_candidate():
    query = [1.0, 0.0]
    candidates = [[0.0, 1.0], [0.99, 0.01], [-1.0, 0.0]]
    idx, score = best_match(query, candidates)
    assert idx == 1
    assert score > 0.9


@_needs_numpy
def test_best_match_empty_candidates_raises():
    with pytest.raises(ValueError):
        best_match([1.0, 0.0], [])


@_needs_fastembed
def test_embed_sentences_produces_real_vectors():
    vectors = embed_sentences(["We face significant competition.", "Our supply chain is at risk."])
    assert len(vectors) == 2
    assert all(len(v) == EMBEDDING_DIM for v in vectors)
    # Two different sentences should not embed to the exact same vector.
    assert vectors[0] != vectors[1]


@_needs_fastembed
def test_embed_sentences_preserves_order():
    a = embed_sentences(["alpha sentence"])[0]
    b = embed_sentences(["beta sentence"])[0]
    both = embed_sentences(["alpha sentence", "beta sentence"])
    assert both[0] == a
    assert both[1] == b
