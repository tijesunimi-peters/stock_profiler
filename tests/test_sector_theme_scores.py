"""Tests for the composite sector THEME-SCORE feature (sector-overview redesign, Phase 0).
No network, no DuckDB (the batch is pure Python over metric_distributions).

Covers the architecture's AC -> check table:
  * scoring math -- z-score orientation (AC-2), the 0-100 mapping (AC-1), percentile;
  * `compute_scores` -- N/A exclusion + theme omission (AC-6), rank density (AC-3),
    prior-FY delta null path (AC-4), decomposition rows (AC-5);
  * the batch end-to-end over a seeded metric_distributions db (formula reproducibility);
  * `higher_is_better` fails loudly for an unknown metric (AC-12), themes all have a direction;
  * `GET /v1/sectors/theme-scores` -- deferred markers (AC-7), decomposition (AC-5), caveats +
    normalization + no-verdict language (AC-9/AC-10), honest empty, and the route-ordering
    regression (must not be swallowed by /sectors/{group}).
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient

from secfin.analytical.sector_theme_scores import (
    _oriented_z_by_sector,
    _percentile_rank,
    _score_from_z,
    compute_scores,
    run_sector_theme_scores,
)
from secfin.config import settings
from secfin.normalize.metrics import METRIC_DIRECTION, higher_is_better
from secfin.normalize.themes import THEMES, min_constituents
from secfin.storage.metric_distribution_repository import MetricDistributionRow
from secfin.storage.sector_theme_score_repository import (
    SectorThemeComponentRow,
    SectorThemeScoreRow,
)
from secfin.storage.sqlite_metric_distribution_repository import (
    SQLiteMetricDistributionRepository,
)
from secfin.storage.sqlite_sector_theme_score_repository import (
    SQLiteSectorThemeScoreRepository,
)

_BROWSER = {"Sec-Fetch-Site": "same-origin"}


# --------------------------------------------------------------------------------------
# scoring math
# --------------------------------------------------------------------------------------


def test_oriented_z_higher_is_better_and_inverted():
    # medians [10, 20, 30] -> mean 20, pstdev sqrt(200/3) ~= 8.1650 -> z ~= [-1.2247, 0, +1.2247]
    m = {"A": 10.0, "B": 20.0, "C": 30.0}
    hi = _oriented_z_by_sector(m, "net_margin")  # higher is better
    assert hi["A"] == pytest.approx(-1.22474, abs=1e-4)
    assert hi["B"] == pytest.approx(0.0, abs=1e-9)
    assert hi["C"] == pytest.approx(1.22474, abs=1e-4)
    # AC-2: for a lower-is-better metric the sign flips -- the LOWER median is the more favorable.
    lo = _oriented_z_by_sector(m, "debt_to_equity")  # lower is better
    assert lo["A"] == pytest.approx(1.22474, abs=1e-4)  # lowest d/e -> highest oriented z
    assert lo["C"] == pytest.approx(-1.22474, abs=1e-4)
    assert lo["A"] == -hi["A"]


def test_oriented_z_excludes_too_few_sectors_or_no_dispersion():
    assert _oriented_z_by_sector({"A": 1.0, "B": 2.0}, "net_margin") == {}  # < 3 sectors
    assert _oriented_z_by_sector({"A": 5.0, "B": 5.0, "C": 5.0}, "net_margin") == {}  # no spread


def test_score_from_z_mapping_and_clamp():
    assert _score_from_z(0.0) == 50  # cross-sector average
    assert _score_from_z(1.0) == 65  # +1 sigma ~= +15
    assert _score_from_z(-1.0) == 35
    assert _score_from_z(10.0) == 100  # clamped
    assert _score_from_z(-10.0) == 0


def test_percentile_rank_endpoints_and_middle():
    pop = [-1.0, 0.0, 1.0]
    assert _percentile_rank(-1.0, pop) == pytest.approx(100 * 0.5 / 3)
    assert _percentile_rank(1.0, pop) == pytest.approx(100 * 2.5 / 3)
    assert _percentile_rank(0.0, pop) == pytest.approx(50.0)


# --------------------------------------------------------------------------------------
# compute_scores (the pure core)
# --------------------------------------------------------------------------------------


def _profitability_medians():
    """3 sectors, the 'profitability' theme via 3 of its 6 constituents (meets min_constituents=3).
    Distinct medians per sector so the ranks are unambiguous."""
    metrics = ("net_margin", "roa", "roe")
    per_sector = {"35": (0.30, 0.30, 0.30), "60": (0.20, 0.20, 0.20), "52": (0.10, 0.10, 0.10)}
    by_metric: dict[str, dict[str, float]] = {m: {} for m in metrics}
    peer_counts: dict[str, int] = {}
    for g, vals in per_sector.items():
        peer_counts[g] = 10
        for m, v in zip(metrics, vals, strict=True):
            by_metric[m][g] = v
    return {(2024, "FY"): by_metric}, {(2024, "FY"): peer_counts}


def test_compute_scores_formula_rank_and_decomposition():
    medians, peer_counts = _profitability_medians()
    parents, components = compute_scores(medians, peer_counts)
    prof = {p.peer_group: p for p in parents if p.theme == "profitability"}
    assert set(prof) == {"35", "60", "52"}

    # AC-3: dense ranks 1..3, most-favorable (highest medians) first; rank_of == 3.
    assert prof["35"].rank == 1 and prof["52"].rank == 3
    assert all(p.rank_of == 3 for p in prof.values())
    assert prof["35"].score > prof["60"].score > prof["52"].score

    # AC-1: score reproduces 50 + 15*mean(oriented z's). All 3 constituents share the same medians,
    # so composite z == the single-metric oriented z; recompute it independently.
    exp_z = _oriented_z_by_sector({"35": 0.30, "60": 0.20, "52": 0.10}, "net_margin")
    assert prof["35"].score == _score_from_z(exp_z["35"])
    assert prof["35"].composite_z == pytest.approx(exp_z["35"])

    # AC-5: decomposition present -- one component row per included constituent, carrying median +
    # oriented_z + direction.
    comp35 = [c for c in components if c.peer_group == "35" and c.theme == "profitability"]
    assert {c.metric for c in comp35} == {"net_margin", "roa", "roe"}
    assert prof["35"].constituent_count == 3
    assert all(c.higher_is_better for c in comp35)
    assert all(c.oriented_z == pytest.approx(exp_z["35"]) for c in comp35)


def test_compute_scores_omits_theme_below_min_constituents():
    """AC-6: a sector with too few available constituents is OMITTED for that theme -- not a low
    score, not a zero. Sector 52 has only ONE profitability constituent (< min 3); the other three
    sectors keep every constituent z-scoreable (each metric spans >= 3 sectors)."""
    by_metric = {
        "net_margin": {"35": 0.30, "60": 0.20, "52": 0.10, "70": 0.25},  # all 4
        "roa": {"35": 0.30, "60": 0.20, "70": 0.25},  # 52 missing
        "roe": {"35": 0.30, "60": 0.20, "70": 0.25},  # 52 missing -> 52 has only net_margin
    }
    peer_counts = {"35": 10, "60": 10, "52": 10, "70": 10}
    parents, _ = compute_scores({(2024, "FY"): by_metric}, {(2024, "FY"): peer_counts})
    prof = {p.peer_group for p in parents if p.theme == "profitability"}
    assert prof == {"35", "60", "70"}  # 52 omitted entirely (1 constituent < min 3)
    assert min_constituents(6) == 3


def test_compute_scores_prior_fy_delta_null_when_no_prior():
    """AC-4: delta is score(Y) - score(Y-1), else None when there is no prior FY (never 0)."""
    by_metric_2023 = {
        "net_margin": {"35": 0.10, "60": 0.20, "52": 0.30},  # 35 worst in 2023
        "roa": {"35": 0.10, "60": 0.20, "52": 0.30},
        "roe": {"35": 0.10, "60": 0.20, "52": 0.30},
    }
    by_metric_2024 = {
        "net_margin": {"35": 0.30, "60": 0.20, "52": 0.10},  # 35 best in 2024
        "roa": {"35": 0.30, "60": 0.20, "52": 0.10},
        "roe": {"35": 0.30, "60": 0.20, "52": 0.10},
    }
    pc = {"35": 10, "60": 10, "52": 10}
    medians = {(2023, "FY"): by_metric_2023, (2024, "FY"): by_metric_2024}
    peer_counts = {(2023, "FY"): pc, (2024, "FY"): pc}
    parents, _ = compute_scores(medians, peer_counts)
    by = {(p.fiscal_year, p.peer_group): p for p in parents if p.theme == "profitability"}
    # 2023 has no prior FY -> None (assert explicitly, not 0)
    assert by[(2023, "35")].delta_vs_prior_fy is None
    # 2024 improved for 35 (worst -> best) -> positive delta = score_2024 - score_2023
    d = by[(2024, "35")].delta_vs_prior_fy
    assert d is not None
    assert d == pytest.approx(by[(2024, "35")].score - by[(2023, "35")].score)
    assert d > 0


# --------------------------------------------------------------------------------------
# direction map (AC-12) and theme wiring
# --------------------------------------------------------------------------------------


def test_higher_is_better_defined_for_all_constituents_and_raises_unknown():
    for _label, metrics in THEMES.values():
        for m in metrics:
            assert isinstance(higher_is_better(m), bool)  # every constituent has a direction
    with pytest.raises(KeyError):
        higher_is_better("not_a_real_metric")  # loud failure, no silent default
    # dollar-level metrics are deliberately NOT in the map (excluded from scoring)
    assert "fcf" not in METRIC_DIRECTION
    assert "net_debt" not in METRIC_DIRECTION


# --------------------------------------------------------------------------------------
# batch end-to-end over a seeded metric_distributions db (no DuckDB)
# --------------------------------------------------------------------------------------


def _dist(group, metric, year, med, n=10):
    return MetricDistributionRow(
        peer_group=group,
        fiscal_year=year,
        fiscal_period="FY",
        metric=metric,
        peer_count=n,
        min=med / 2,
        p25=med * 0.75,
        median=med,
        p75=med * 1.25,
        max=med * 1.5,
    )


def test_batch_materializes_and_reads_back(tmp_path):
    db = str(tmp_path / "b.db")
    dist = SQLiteMetricDistributionRepository(db)
    dist.bulk_upsert(
        [
            _dist("35", "net_margin", 2024, 0.30),
            _dist("60", "net_margin", 2024, 0.20),
            _dist("52", "net_margin", 2024, 0.10),
            _dist("35", "roa", 2024, 0.30),
            _dist("60", "roa", 2024, 0.20),
            _dist("52", "roa", 2024, 0.10),
            _dist("35", "roe", 2024, 0.30),
            _dist("60", "roe", 2024, 0.20),
            _dist("52", "roe", 2024, 0.10),
        ]
    )
    dist.close()

    n = run_sector_theme_scores(db)
    assert n > 0

    repo = SQLiteSectorThemeScoreRepository(db)
    try:
        assert repo.latest_fy_year() == 2024
        rows = repo.list_for_period(2024, "FY")
        prof = {r.peer_group: r for r in rows if r.theme == "profitability"}
        assert set(prof) == {"35", "60", "52"}
        assert prof["35"].rank == 1
        # score reproduces the formula from the seeded medians
        exp_z = _oriented_z_by_sector({"35": 0.30, "60": 0.20, "52": 0.10}, "net_margin")
        assert prof["35"].score == _score_from_z(exp_z["35"])
        comps = repo.components_for_period(2024, "FY")
        assert any(c.peer_group == "35" and c.metric == "net_margin" for c in comps)
    finally:
        repo.close()


# --------------------------------------------------------------------------------------
# endpoint
# --------------------------------------------------------------------------------------


def _configure(tmp_path, monkeypatch) -> str:
    db = str(tmp_path / "api.db")
    monkeypatch.setattr(settings, "secfin_db_path", db)
    monkeypatch.setattr(settings, "sec_user_agent", "clearyfi-test test@example.com")
    return db


def _seed_scores(db: str) -> None:
    repo = SQLiteSectorThemeScoreRepository(db)
    parents = [
        SectorThemeScoreRow("35", 2024, "FY", "profitability", 10, 3, 1.0, 65, 83.3, 1, 2, 4.0),
        SectorThemeScoreRow("60", 2024, "FY", "profitability", 10, 3, -1.0, 35, 16.7, 2, 2, None),
        # 35 also has a growth score; 60 does NOT (theme absent for 60 -> AC-6)
        SectorThemeScoreRow("35", 2024, "FY", "growth", 10, 2, 0.5, 58, 100.0, 1, 1, None),
    ]
    components = [
        SectorThemeComponentRow("35", 2024, "FY", "profitability", "net_margin", True, 0.30, 1.0),
        SectorThemeComponentRow("35", 2024, "FY", "profitability", "roe", True, 0.30, 1.0),
    ]
    repo.bulk_upsert(parents, components)
    repo.close()


def test_endpoint_returns_scores_deferred_markers_and_decomposition(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    _seed_scores(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/theme-scores", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["fiscal_year"] == 2024  # defaulted to latest materialized FY
    assert body["normalization"]  # the 0-100 method is stated (AC-9)
    assert body["caveats"]
    joined = " ".join(body["caveats"]).lower()
    assert "not yet scored" in joined  # deferred-themes caveat (AC-7)
    # AC-10: descriptive, not a verdict -- the caveats frame a score as a POSITION and explicitly
    # disclaim a good/bad/buy/sell verdict.
    assert "position" in joined
    assert "not a" in joined and "verdict" in joined

    sectors = {s["group"]: s for s in body["sectors"]}
    assert set(sectors) == {"35", "60"}
    themes35 = {t["theme"]: t for t in sectors["35"]["themes"]}
    # five backable themes appear only where scored; the two deferred ALWAYS appear as markers.
    assert themes35["profitability"]["scored"] is True
    assert themes35["profitability"]["score"] == 65
    assert themes35["profitability"]["rank"] == 1
    assert themes35["accounting_quality"]["scored"] is False
    assert themes35["accounting_quality"]["score"] is None
    assert themes35["accounting_quality"]["reason"]
    assert themes35["structure_activity"]["scored"] is False

    # AC-5: decomposition carried with median + oriented_z + label + direction
    cons = themes35["profitability"]["constituents"]
    assert {c["metric"] for c in cons} == {"net_margin", "roe"}
    nm = next(c for c in cons if c["metric"] == "net_margin")
    assert nm["median"] == pytest.approx(0.30)
    assert nm["oriented_z"] == pytest.approx(1.0)
    assert nm["higher_is_better"] is True
    assert nm["label"]

    # AC-6: growth is present for 35 but ABSENT for 60 (not scored:false, not zero).
    themes60 = {t["theme"]: t for t in sectors["60"]["themes"]}
    assert "growth" in themes35
    assert "growth" not in themes60
    # 60 still ends with the two deferred markers
    assert themes60["accounting_quality"]["scored"] is False


def test_endpoint_empty_db_is_honest_200(tmp_path, monkeypatch):
    db = _configure(tmp_path, monkeypatch)
    SQLiteSectorThemeScoreRepository(db).close()  # create the (empty) tables
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/theme-scores", headers=_BROWSER)

    assert resp.status_code == 200
    body = resp.json()
    assert body["sectors"] == []  # honest empty, not an error, not fabricated rows
    assert body["caveats"]


def test_theme_scores_route_not_swallowed_by_group_param(tmp_path, monkeypatch):
    """Regression: /sectors/theme-scores must resolve to the theme-scores route, not
    /sectors/{group} with group='theme-scores'. The theme-scores response has `normalization`; a
    group series has `points`."""
    db = _configure(tmp_path, monkeypatch)
    _seed_scores(db)
    from secfin.api.main import app

    with TestClient(app) as client:
        resp = client.get("/v1/sectors/theme-scores", headers=_BROWSER)

    assert resp.status_code == 200
    assert "normalization" in resp.json()
    assert "points" not in resp.json()


def test_no_dollar_level_metric_is_a_constituent():
    """Guard the scale-free rule: no themed constituent is a raw $ level."""
    dollar_level = {"fcf", "net_debt", "eps_basic", "eps_diluted", "share_count"}
    for _label, metrics in THEMES.values():
        assert not (set(metrics) & dollar_level)


def test_score_from_z_is_finite_on_extremes():
    for z in (-1e9, -3.0, 0.0, 3.0, 1e9):
        s = _score_from_z(z)
        assert 0 <= s <= 100 and math.isfinite(s)
