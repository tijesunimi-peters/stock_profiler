"""Tests for derived tone/readability metrics (normalize/section_metrics.py) + its store.

No network, no sec-parser needed -- pure computation over the checked-in AFINN word list.
"""

from __future__ import annotations

from secfin.normalize.section_metrics import compute_text_metrics
from secfin.storage.sqlite_section_metric_repository import SQLiteSectionMetricRepository


def test_empty_text_returns_all_none_not_zero():
    """No words is "nothing to measure", not a real 0 -- a company with an empty section should
    never look identical to one whose tone is neutral."""
    m = compute_text_metrics("")
    assert m == compute_text_metrics("   ")
    assert m.tone_positive is None
    assert m.fog_index is None


def test_positive_and_negative_words_move_the_expected_direction():
    positive = compute_text_metrics("excellent wonderful great success achievement")
    negative = compute_text_metrics("terrible awful disaster failure crisis")
    assert positive.tone_positive > positive.tone_negative
    assert negative.tone_negative > negative.tone_positive


def test_modal_verbs_are_categorized_by_the_closed_grammar_set():
    m = compute_text_metrics("The Company must comply. We shall maintain controls. It may happen.")
    assert m.strong_modal > 0
    assert m.weak_modal > 0


def test_more_complex_words_raise_the_fog_index():
    simple = compute_text_metrics("The cat sat on the mat. It was a nice day. We had fun.")
    complex_ = compute_text_metrics(
        "The organization's comprehensive regulatory compliance obligations necessitate "
        "substantial administrative infrastructure investments. Sophisticated methodologies "
        "facilitate operational efficiency improvements."
    )
    assert complex_.fog_index > simple.fog_index


def test_repo_roundtrip_and_schema_version_healing(tmp_path):
    from secfin.normalize.section_metrics import METRICS_SCHEMA_VERSION

    repo = SQLiteSectionMetricRepository(str(tmp_path / "m.db"))
    metrics = compute_text_metrics("The Company faces significant risk and uncertainty.")
    repo.upsert_metrics(1, "acc-1", "RF", metrics)

    got = repo.get_metrics(1, "acc-1", "RF")
    assert got.tone_negative == metrics.tone_negative
    assert repo.get_metrics(1, "acc-1", "LEGAL") is None

    repo._conn.execute(
        "UPDATE section_metrics SET schema_version = ? WHERE cik = 1 AND accession = 'acc-1'",
        (METRICS_SCHEMA_VERSION - 1,),
    )
    repo._conn.commit()
    assert repo.get_metrics(1, "acc-1", "RF") is None
    repo.close()
