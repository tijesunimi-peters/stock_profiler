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

# Planned (beta-posture) prices as decided 2026-07-14 in docs/product/PRICING.md.
# There is no code source of truth for prices (billing isn't built yet), so this
# constant is the drift tripwire: /terms and /guide must both carry these exact
# strings. Update PRICING.md FIRST if these ever change.
_PLANNED_PRICES = ["$19/mo", "$79/mo"]


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
    # Operator legal review completed 2026-07-16: the draft banner must be GONE,
    # and no bracketed placeholders may remain on a published legal page.
    assert "Draft" not in body
    assert "placeholder" not in body.lower()
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
    for planned in _PLANNED_PRICES:
        assert planned in body, f"planned price {planned} missing from /terms"


def test_guide_page_tier_table_matches_auth_tiers(tmp_path, monkeypatch):
    # The quickstart guide (docs/product/LAUNCH_READINESS.md §5) has its own copy of the
    # tier table -- a second place the same drift could sneak in independently of /terms.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/guide")
    assert resp.status_code == 200
    body = resp.text
    for rate_str, quota_str in _EXPECTED_TIER_STRINGS:
        assert rate_str in body and quota_str in body
    for planned in _PLANNED_PRICES:
        assert planned in body, f"planned price {planned} missing from /guide"


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


def test_robots_txt_allows_pages_but_blocks_the_api(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/robots.txt")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]
    assert "Disallow: /v1/" in resp.text
    # The pages themselves must NOT be disallowed -- only the API subtree.
    assert "Disallow: /\n" not in resp.text


def test_favicon_serves_for_default_browser_requests(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        ico = client.get("/favicon.ico")
        svg = client.get("/favicon.svg")
    assert ico.status_code == 200
    assert ico.content[:4] == b"\x00\x00\x01\x00"  # ICO magic bytes
    assert svg.status_code == 200
    assert "svg" in svg.headers["content-type"]


def test_sectors_serves_the_v2_app(tmp_path, monkeypatch):
    # M2 routing swap: /sectors is canonical and now serves the v2 Sector Analytics app
    # (sector-analytics.html: #app shell + sectorapp.js), NOT the old sectors.js page.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/sectors")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    body = resp.text
    assert 'id="app"' in body
    assert "/static/sectorapp.js" in body
    assert "/static/sectors.js" not in body  # must be the app shell, not the old page


def test_sector_analytics_redirects_to_sectors_preserving_params(tmp_path, monkeypatch):
    # /sector-analytics 301-redirects to the canonical /sectors, carrying the full query
    # string (the app honors ?group=&view=&symbol=&a=&b= identically at the new URL).
    with _client(tmp_path, monkeypatch) as client:
        bare = client.get("/sector-analytics", follow_redirects=False)
        deep = client.get(
            "/sector-analytics?group=73&view=company&symbol=320193&a=73&b=60",
            follow_redirects=False,
        )
    assert bare.status_code == 301
    assert bare.headers["location"] == "/sectors"
    assert deep.status_code == 301
    assert deep.headers["location"] == "/sectors?group=73&view=company&symbol=320193&a=73&b=60"


def test_sectors_legacy_is_gone(tmp_path, monkeypatch):
    # V3-P2 (= M3 of ROADMAP_SECTOR_MIGRATION): the pre-v2 single-sector page was the rollback
    # path for the M2 swap and its retention window is over. The route AND sectors.html/css/js
    # are deleted -- keeping them alive would leave a third shell and a duplicate .plot-chart
    # declaration in the product.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/sectors-legacy")
    assert resp.status_code == 404

    # Deleted on disk too, not merely unrouted -- kept in step with the route above.
    from secfin.api.main import STATIC_DIR

    for gone in ("sectors.html", "sectors.css", "sectors.js"):
        assert not (STATIC_DIR / gone).exists(), f"{gone} should have been deleted in V3-P2"


# --- URL-as-state (V3-P2) -------------------------------------------------------------
# Every route below serves the SAME shell as its bare form; the client derives the selection from
# the path. The server deliberately does not validate {view} -- shell.js resolves an unknown slug
# to the subject's default view, and a server-side 404 would contradict that.


def test_company_view_paths_serve_the_company_shell(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        bare = client.get("/company/AAPL")
        for view in ("fundamentals", "statements", "insider", "institutional", "beneficial"):
            resp = client.get(f"/company/AAPL/{view}")
            assert resp.status_code == 200, view
            assert "text/html" in resp.headers["content-type"]
            assert resp.text == bare.text, f"/company/AAPL/{view} must serve the same shell"


def test_company_unknown_view_still_serves_the_shell(tmp_path, monkeypatch):
    # AC-21: the client falls back to the default view. The server must NOT 404 here.
    with _client(tmp_path, monkeypatch) as client:
        resp = client.get("/company/AAPL/nonsense")
    assert resp.status_code == 200
    assert "/static/company.js" in resp.text


def test_sector_group_and_view_paths_serve_the_sector_app(tmp_path, monkeypatch):
    with _client(tmp_path, monkeypatch) as client:
        bare = client.get("/sectors")
        for path in ("/sectors/35", "/sectors/35/sector", "/sectors/35/compare", "/sectors/35/xx"):
            resp = client.get(path)
            assert resp.status_code == 200, path
            assert resp.text == bare.text, f"{path} must serve the same shell"


def test_support_channel_is_reachable_from_every_page_footer(tmp_path, monkeypatch):
    # LAUNCH_READINESS §6: the feedback/support channel (GitHub issues) must be
    # linked from docs and the site footer -- assert the link, not just the page.
    with _client(tmp_path, monkeypatch) as client:
        for path in ("/", "/guide", "/explorer", "/privacy", "/terms", "/methodology"):
            resp = client.get(path)
            assert resp.status_code == 200, path
            assert "github.com/clearyfi/support" in resp.text, (
                f"{path} footer is missing the support-repo link"
            )
