"""Tests for the frames bulk-ingest job (secfin.ingest.frames_backfill), no network."""

from __future__ import annotations

from secfin.ingest import frames_backfill as frames_backfill_module
from secfin.normalize.mapping import candidate_tags
from secfin.sec.frames import FrameFact
from secfin.storage.sqlite_repository import SQLiteRawFactRepository


def _fake_fetch_frame_factory(facts_by_tag: dict[str, list[FrameFact]], calls: list[tuple]):
    async def _fake_fetch_frame(client, tag, period, unit="USD"):
        calls.append((tag, period))
        return facts_by_tag.get(tag, [])

    return _fake_fetch_frame


async def test_ingest_concept_writes_facts_for_every_candidate_tag(tmp_path, monkeypatch):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    calls: list[tuple] = []
    tags = candidate_tags("net_income")
    target_tag = tags[0]
    facts_by_tag = {
        target_tag: [
            FrameFact(
                cik=320193,
                entity_name="Apple Inc.",
                value=1000.0,
                accession="acc-1",
                period_start="2023-01-01",
                period_end="2023-12-31",
            )
        ]
    }
    monkeypatch.setattr(
        frames_backfill_module, "fetch_frame", _fake_fetch_frame_factory(facts_by_tag, calls)
    )

    tally = await frames_backfill_module._ingest_concept(
        client=None, repo=repo, concept="net_income", fiscal_year=2023, fiscal_period="FY"
    )

    assert tally[target_tag] == 1
    assert calls == [(tag, "CY2023") for tag in tags]  # every candidate tag gets fetched
    rows = repo.get_raw_facts(320193)
    assert len(rows) == 1
    assert rows[0].gaap_tag == target_tag
    assert rows[0].frame == "CY2023"
    repo.close()


async def test_ingest_concept_continues_after_one_tag_fails(tmp_path, monkeypatch):
    repo = SQLiteRawFactRepository(tmp_path / "secfin.db")
    tags = candidate_tags("revenue")
    assert len(tags) > 1  # revenue has multiple candidate tags to exercise this path

    async def _flaky_fetch(client, tag, period, unit="USD"):
        if tag == tags[0]:
            raise RuntimeError("simulated SEC error")
        return [
            FrameFact(
                cik=1,
                entity_name="Some Co",
                value=42.0,
                accession="acc-2",
                period_start="2023-01-01",
                period_end="2023-12-31",
            )
        ]

    monkeypatch.setattr(frames_backfill_module, "fetch_frame", _flaky_fetch)

    tally = await frames_backfill_module._ingest_concept(
        client=None, repo=repo, concept="revenue", fiscal_year=2023, fiscal_period="FY"
    )

    assert tally[tags[0]] == 0
    assert tally[tags[1]] == 1
    repo.close()


async def test_run_frames_backfill_skips_non_screenable_concepts(tmp_path, monkeypatch):
    async def _boom(client, tag, period, unit="USD"):
        raise AssertionError("should not fetch a non-screenable concept")

    monkeypatch.setattr(frames_backfill_module, "fetch_frame", _boom)

    # "gross_profit" is a real canonical concept but not in SCREENABLE_CONCEPTS.
    await frames_backfill_module.run_frames_backfill(
        fiscal_year=2023,
        fiscal_period="FY",
        concepts=["gross_profit"],
        db_path=str(tmp_path / "secfin.db"),
    )
