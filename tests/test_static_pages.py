"""Smoke tests for the legal/trust static pages (docs/product/LAUNCH_READINESS.md §4):
privacy policy, terms of service, the "data, not investment advice" disclaimer, and the
data source & methodology page.

Same pattern as test_app_auth_wiring.py's `_client` helper -- these routes don't touch
SEC or the DB at all (plain FileResponse), but building the app still needs a writable
db path for its lifespan-managed repositories.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from secfin.auth.tiers import TIERS
from secfin.config import settings

# Derived from auth/tiers.py rather than hand-copied, so that a future change to a
# tier's limits (adding a tier, changing a number) breaks this test immediately if the
# published copy isn't updated to match -- catching drift at the source of truth
# instead of only catching a typo made once at write time.
_EXPECTED_TIER_STRINGS = [
    (f"{limits.rate_limit_per_sec} req/sec", f"{limits.daily_quota:,} req/day")
    for limits in TIERS.values()
]


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setattr(settings, "secfin_db_path", str(tmp_path / "test.db"))
    from secfin.api.main import app

    return TestClient(app)


def test_privacy_page_serves_and_names_what_is_collected(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/privacy")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    body = resp.text
    assert "Draft" in body  # not presented as final/binding legal certainty
    assert "Email address" in body
    assert "API key" in body


def test_terms_page_matches_published_tier_limits(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/terms")
    assert resp.status_code == 200
    body = resp.text
    # Numbers must match auth/tiers.py exactly, not be guessed -- and not just match
    # today's numbers by coincidence: derived from TIERS itself (see module docstring).
    assert len(_EXPECTED_TIER_STRINGS) == 3, "update this test if a tier was added/removed"
    for rate_str, quota_str in _EXPECTED_TIER_STRINGS:
        assert rate_str in body and quota_str in body
    assert "No SLA at launch" in body or "no uptime" in body.lower()


def test_guide_page_tier_table_matches_auth_tiers(tmp_path, monkeypatch):
    # The quickstart guide (docs/product/LAUNCH_READINESS.md §5) has its own copy of the
    # tier table -- a second place the same drift could sneak in independently of /terms.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/guide")
    assert resp.status_code == 200
    body = resp.text
    for rate_str, quota_str in _EXPECTED_TIER_STRINGS:
        assert rate_str in body and quota_str in body


def test_disclaimer_page_carries_the_13f_derived_delta_caveat(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/disclaimer")
    assert resp.status_code == 200
    body = resp.text
    assert "not a record of trades" in body or "not a transaction feed" in body
    assert "45-day" in body
    assert "investment advice" in body.lower()


def test_methodology_page_states_source_and_not_covered(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/methodology")
    assert resp.status_code == 200
    body = resp.text
    assert "SEC EDGAR" in body
    assert "No prices" in body or "no prices" in body.lower()
    assert "US SEC registrants only" in body or "US-only" in body


def test_disclaimer_is_reachable_from_every_page_footer(tmp_path, monkeypatch):
    # Guardrail 2: the disclaimer must be linked from the footer, not just exist.
    with _client(tmp_path, monkeypatch) as client:
        for path in ("/", "/guide", "/explorer"):
            resp = client.get(path)
            assert resp.status_code == 200, path
            assert '/disclaimer' in resp.text, f"{path} footer is missing a /disclaimer link"
