"""Tests for embedding-cosine classification (normalize/theme_classifier.py), Track 2 Wave B §8.4
step 4.

`_group_sentences` and the anchor-cache-key fix are pure-Python and run unguarded. The rest needs
`fastembed` (real model inference), same gating as `test_section_embeddings.py`. The real-quality
verification for this module is documented in its own module docstring -- run against Apple's real
Risk Factors section and three real CAM matters, not reproduced here (a live network fetch has no
place in the regular test suite) -- so these tests check the MECHANISM is correct (grouping,
thresholding, the anchor-cache regression) using small, clearly-differentiated synthetic content,
not that the classification is high-quality on real filing prose.
"""

from __future__ import annotations

import importlib.util

import pytest

from secfin.normalize.classification_taxonomy import CAM_TOPICS, RISK_THEMES, ThemeAnchor
from secfin.normalize.theme_classifier import (
    _anchor_vectors,
    _group_sentences,
    classify_sentences,
    classify_topic,
)

_HAS_FASTEMBED = importlib.util.find_spec("fastembed") is not None
_needs_fastembed = pytest.mark.skipif(
    not _HAS_FASTEMBED, reason="requires the narrative extra (fastembed)"
)


# ============================================================ _group_sentences, no model needed

def test_group_sentences_chunk_size_1_returns_unchanged():
    sentences = ["One.", "Two.", "Three."]
    assert _group_sentences(sentences, chunk_size=1) == sentences


def test_group_sentences_groups_into_passages():
    sentences = ["One.", "Two.", "Three.", "Four.", "Five."]
    assert _group_sentences(sentences, chunk_size=2) == ["One. Two.", "Three. Four.", "Five."]


def test_group_sentences_empty_input():
    assert _group_sentences([], chunk_size=4) == []


# ============================================================ taxonomy content sanity

def test_risk_themes_match_qual_themes_names():
    # These MUST match clearyfi_frontend/app/data/qualitative.ts's QUAL_THEMES exactly -- see
    # classification_taxonomy.py's module docstring for why this isn't a fresh list.
    names = {a.name for a in RISK_THEMES}
    assert names == {
        "Foundry / supply concentration",
        "Export controls & geopolitics",
        "Customer concentration",
        "Cyclical demand / inventory",
        "Talent & skilled labor",
        "Capital intensity",
        "IP & patent litigation",
        "AI-demand dependence",
        "Water / energy for fabs",
    }


def test_cam_topics_include_the_existing_fixture_names():
    names = {a.name for a in CAM_TOPICS}
    assert {
        "Revenue recognition (multiple-element)",
        "Inventory valuation / excess & obsolete",
        "Goodwill & intangible impairment",
        "Income taxes / uncertain positions",
        "Business-combination purchase accounting",
    }.issubset(names)


# ============================================================ end-to-end, needs fastembed

@_needs_fastembed
def test_anchor_cache_does_not_collide_across_different_anchor_sets():
    """Regression test for the id()-based cache bug: two DIFFERENT anchor tuples, each freshly
    constructed (so a naive identity-based cache could plausibly alias them via memory reuse),
    must never return each other's vectors.
    """
    a = (ThemeAnchor("Alpha", "A description about alpha topics and alpha-related concerns."),)
    b = (ThemeAnchor("Beta", "A totally different description about beta topics and beta risk."),)
    va = _anchor_vectors(a)
    vb = _anchor_vectors(b)
    assert va != vb


@_needs_fastembed
def test_classify_sentences_empty_input_returns_all_unmatched():
    matches = classify_sentences([], RISK_THEMES)
    assert len(matches) == len(RISK_THEMES)
    assert all(not m.matched and m.similarity == 0.0 and m.excerpt is None for m in matches)


@_needs_fastembed
def test_classify_sentences_finds_a_clearly_relevant_theme():
    sentences = [
        "We rely on a limited number of third-party foundries to manufacture our chips.",
        "If a key foundry partner experiences a disruption, our production could be delayed.",
        "Our headquarters building is leased under a long-term real estate arrangement.",
    ] * 2  # chunk_size default is 4; repeat so grouping has enough material to work with
    matches = classify_sentences(sentences, RISK_THEMES, threshold=0.5, chunk_size=1)
    by_name = {m.theme_name: m for m in matches}
    assert by_name["Foundry / supply concentration"].matched
    assert by_name["Foundry / supply concentration"].excerpt is not None


@_needs_fastembed
def test_classify_sentences_high_threshold_matches_nothing():
    sentences = ["We rely on third-party foundries for chip manufacturing."]
    matches = classify_sentences(sentences, RISK_THEMES, threshold=0.999, chunk_size=1)
    assert all(not m.matched for m in matches)


@_needs_fastembed
def test_classify_topic_finds_a_clearly_relevant_topic():
    text = (
        "Revenue Recognition. The Company recognizes revenue upon transfer of control of "
        "promised goods or services to customers, in an amount that reflects the consideration "
        "the Company expects to receive for those goods and services under multiple-element "
        "arrangements."
    )
    result = classify_topic(text, CAM_TOPICS, threshold=0.5)
    assert result.topic_name == "Revenue recognition (multiple-element)"


@_needs_fastembed
def test_classify_topic_high_threshold_returns_none_not_a_forced_guess():
    text = "Revenue Recognition. The Company recognizes revenue upon transfer of control."
    result = classify_topic(text, CAM_TOPICS, threshold=0.999)
    assert result.topic_name is None
