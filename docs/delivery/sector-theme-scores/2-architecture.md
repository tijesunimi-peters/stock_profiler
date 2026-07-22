# Architecture — Composite sector theme scores (Phase 0)

Stage 2 (Principal Architect) handoff. Designs against `1-brief.md`. **Backend-only.**
Owner: `senior-backend-engineer`. No frontend stage this phase.

Scope re-check: **Track 1, in-architecture.** Pure offline transform over already-materialized
`metric_distributions`, written to a new operational table, served cache-aside. No Track 2, no new
base dependency (see D5 — this batch needs *no* DuckDB), no weakening of SEC compliance, no DuckDB
on the request path.

---

## Decisions resolved

### D1 — direction map (`higher_is_better`), CONFIRMED, lives with the metric definitions
New module-level map in `normalize/metrics.py`, exported next to `METRIC_LABELS`/`METRIC_UNITS`
(single source of truth; guide §5 wants direction stored with the metric):

```python
# normalize/metrics.py
METRIC_DIRECTION: dict[str, bool] = {   # True = higher is more favorable
    "gross_margin": True, "operating_margin": True, "net_margin": True,
    "roa": True, "roe": True, "roic": True,
    "revenue_growth_yoy": True, "earnings_growth_yoy": True, "ocf_growth_yoy": True,
    "growth_acceleration": True,
    "interest_coverage": True, "current_ratio": True, "quick_ratio": True,
    "asset_turnover": True, "inventory_turnover": True, "fcf_margin": True,
    "debt_to_equity": False, "dso": False, "dpo": False, "ccc": False, "accruals": False,
}
def higher_is_better(metric: str) -> bool:
    return METRIC_DIRECTION[metric]   # KeyError is intended — a themed metric MUST have a direction
```
Only metrics that actually enter a theme (below) need an entry; a `KeyError` on a themed metric
is the loud failure AC-12 wants (no silent default). `net_debt`, `fcf` are **not** here — see D3.

### D3 — only scale-free metrics enter a composite (resolves the "thin Cash & investment" fork)
A z-score of per-sector **medians** across sectors is only meaningful for **scale-free** quantities
(ratios, margins, growth rates, turnovers, days). A raw dollar level (`fcf`, `net_debt`) conflates
sector *size* with health, so its cross-sector z is not interpretable. **Rule: dollar-level metrics
are excluded from scoring.** Consequences:
- **Cash & investment** = `fcf_margin`, `ocf_growth_yoy` (2 ratios — thin but honest; `fcf` dropped).
- **Financial health** = `debt_to_equity`, `interest_coverage`, `current_ratio`, `quick_ratio`
  (`net_debt` dropped for the same reason).
This is one uniform, defensible rule rather than a per-theme patch, and it makes every constituent
cross-sector-comparable.

### D2 — z → 0–100 mapping: linear, labeled, distinct from the percentile line
`score = round(clamp(50 + 15 * z_theme, 0, 100))`, where `z_theme` is the sector's equal-weight
mean of its available oriented constituent z-scores. **50 = cross-sector average; ±1σ ≈ 15 points.**
Chosen over percentile-of-z because guide §01 renders the score **and** a separate "percentile vs
all sectors" line — mapping the score itself to a percentile would make the two redundant. The
`percentile` line is computed separately (percentile rank of `z_theme` across scored sectors). The
normalization string is returned in the payload (AC-9/AC-10).

### D4 — thresholds (module constants in `normalize/themes.py`)
- `MIN_SECTORS_FOR_ZSCORE = 3` — a metric needs ≥3 sectors with a median for that (year, period)
  before its cross-sector z is defined; below that, or if the across-sector stdev ≈ 0
  (`< 1e-9`, no dispersion → all z = 0), that constituent is **excluded** that period.
- A theme is `scored` for a sector only if **≥ max(2, ceil(len(constituents)/2))** of its
  constituents are available (present median *and* z-scoreable). Otherwise the sector's theme row
  is **omitted** (endpoint reports nothing for it) — never a low/zero score.

### D5 — the batch is pure-Python, NOT DuckDB (deliberate divergence from the brief's "clone")
The sibling batches (`peer_ranks`, `peer_distribution`, `sector_dupont`, `sector_lifecycle`) use
DuckDB **because they aggregate `metric_values` / `raw_facts` (millions of rows).** This batch's
input is `metric_distributions` — *already* the output of that DuckDB stage, only a few thousand
median rows. Re-attaching DuckDB to z-score a handful of medians would pull in the `analytical`
extra for no benefit. So `analytical/sector_theme_scores.py` reads via the
`MetricDistributionRepository` and writes via the new repo in **plain Python** — still an **offline
batch, invoked by `python -m`, never on the live request path** (guardrails 6/7 satisfied; there is
simply no DuckDB to keep off the path). Documented here so QA/review see it as intentional, not an
omission. It stays in `analytical/` because it *is* a cross-sector analytical transform.

---

## Theme model — `normalize/themes.py` (NEW, single source of truth)

```python
from secfin.normalize.metrics import METRIC_DIRECTION  # ensures every constituent has a direction

# key -> (label, [constituent metric keys]) — ORDERED, matches guide §01 scorecard order.
THEMES: dict[str, tuple[str, tuple[str, ...]]] = {
    "profitability":       ("Profitability & returns",
        ("gross_margin", "operating_margin", "net_margin", "roa", "roe", "roic")),
    "growth":              ("Growth",
        ("revenue_growth_yoy", "earnings_growth_yoy", "ocf_growth_yoy", "growth_acceleration")),
    "financial_health":    ("Financial health",
        ("debt_to_equity", "interest_coverage", "current_ratio", "quick_ratio")),
    "cash_investment":     ("Cash & investment",
        ("fcf_margin", "ocf_growth_yoy")),
    "operating_efficiency":("Operating efficiency",
        ("inventory_turnover", "dso", "dio", "dpo", "ccc", "asset_turnover")),
}
# Emitted by the ENDPOINT as scored:false markers (never materialized as empty rows).
DEFERRED_THEMES: dict[str, tuple[str, str]] = {
    "accounting_quality": ("Accounting quality",
        "Needs restatement / material-weakness / late-filing signals not yet ingested (Track-2 / "
        "filing-metadata)."),
    "structure_activity": ("Structure & activity",
        "Needs S-1 / Form 15 / 8-K / insider / institutional flow not yet sector-aggregated."),
}
THEME_LABELS = {k: v[0] for k, v in {**THEMES, **DEFERRED_THEMES}.items()}
MIN_SECTORS_FOR_ZSCORE = 3
def min_constituents(n: int) -> int: return max(2, (n + 1) // 2)
```
Note `dio` is not in the D1 direction map above — it must be added (`"dio": False`): higher days
inventory-outstanding is unfavorable, like `dso`/`dpo`/`ccc`. (Engineer: include `dio` in
`METRIC_DIRECTION`.)

---

## Storage — parent + child tables (mirrors the lifecycle_components / sector_lifecycle split)

`storage/sector_theme_score_repository.py` (ABC + NamedTuples), `sqlite_…` impl.

```sql
CREATE TABLE IF NOT EXISTS sector_theme_scores (      -- one row per (sector, period, live theme)
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    theme TEXT NOT NULL,
    peer_count INTEGER NOT NULL,        -- max constituent peer_count for the sector (context)
    constituent_count INTEGER NOT NULL, -- constituents that were included in the average
    composite_z REAL NOT NULL,          -- equal-weight mean of oriented constituent z's
    score INTEGER NOT NULL,             -- 50 + 15*z, clamped [0,100]
    percentile REAL NOT NULL,           -- percentile rank of composite_z across scored sectors
    rank INTEGER NOT NULL,              -- 1 = most favorable
    rank_of INTEGER NOT NULL,           -- scored sectors for this theme+period
    delta_vs_prior_fy REAL,             -- score - prior-FY score; NULL if no prior (never 0-as-missing)
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period, theme)
);
CREATE INDEX IF NOT EXISTS idx_sts_period ON sector_theme_scores (fiscal_year, fiscal_period);

CREATE TABLE IF NOT EXISTS sector_theme_components (  -- decomposition (guide §9a), one per constituent
    peer_group TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_period TEXT NOT NULL,
    theme TEXT NOT NULL,
    metric TEXT NOT NULL,
    higher_is_better INTEGER NOT NULL,  -- 0/1, carried for the UI (orientation, not color)
    median_value REAL NOT NULL,         -- the sector median that fed the z (auditability)
    oriented_z REAL NOT NULL,           -- signed so higher = more favorable
    PRIMARY KEY (peer_group, fiscal_year, fiscal_period, theme, metric)
);
CREATE INDEX IF NOT EXISTS idx_stc_period ON sector_theme_components (fiscal_year, fiscal_period);
```
Only **included** constituents get a component row (an excluded/N/A constituent is simply absent —
AC-6). Repo methods: `bulk_upsert(parents, components)`, `clear()`,
`list_for_period(year, period)`, `components_for_period(year, period)`, `latest_fy_year()`
(coverage-aware, copy `sector_dupont`'s), `count()`, `close()`. **No JSON blobs; typed columns
only.** Full recompute = `clear()` then `bulk_upsert` (like the siblings).

One helper to add to the **distribution** repo interface + sqlite impl:
`list_for_metric_all_periods(metric) -> list[MetricDistributionRow]` (all (group, fy, period) rows
for one metric) — the batch's only read primitive. Small, justified, keeps SQL in storage.

---

## Batch — `analytical/sector_theme_scores.py` (NEW, pure-Python offline)

Algorithm (all in Python; `statistics.mean` / `statistics.pstdev`):
1. For every metric in any theme, `dist_repo.list_for_metric_all_periods(metric)`; bucket into
   `medians[(fy, period)][metric][peer_group] = median`.
2. Per `(fy, period)`, per metric: across the sectors that have a median, compute mean+pstdev;
   skip the metric if `< MIN_SECTORS_FOR_ZSCORE` sectors or `pstdev < 1e-9`. Else
   `z = (median - mean)/pstdev`, then **orient**: `oriented_z = z if higher_is_better(metric) else -z`.
3. Per `(fy, period)`, per sector, per theme: collect the theme's available oriented z's; if
   `>= min_constituents(len(constituents))`, `composite_z = mean(oriented_z's)`,
   `score = round(clamp(50 + 15*composite_z, 0, 100))`; emit a parent (pending rank/percentile/delta)
   + one component row per included constituent.
4. Per `(fy, period, theme)`: rank scored sectors by `composite_z` desc (rank 1 = most favorable),
   set `rank`, `rank_of`, and `percentile` (percentile rank of `composite_z` among scored sectors).
5. `delta_vs_prior_fy`: for FY rows, join `(sector, theme, Y)` to `(sector, theme, Y-1)`;
   `score(Y) - score(Y-1)` or `None`. (Quarterly periods: leave `None` this phase — FY is the axis.)
6. `repo.clear()`, `repo.bulk_upsert(parents, components)`. Log counts.
CLI: `python -m secfin.analytical.sector_theme_scores` (`--sic-digits`, `--min-size` are irrelevant
here — the grouping is already baked into `metric_distributions`; expose none or a no-op `--period`).

---

## Serve — `GET /v1/sectors/theme-scores` (cache-aside, no aggregation)

`routes.py`: `get_sector_theme_score_repo(request)` dep (reads `app.state.sector_theme_score_repo`);
handler mirrors `get_sectors`:

```
GET /v1/sectors/theme-scores?year=<int|null>&period=FY
```
- `resolved_year = year or repo.latest_fy_year()`.
- Read `list_for_period` + `components_for_period`; group components under parents by
  `(peer_group, theme)`.
- Build one `SectorThemeScores.sectors[]` entry per sector present, each with a `themes[]` list:
  the **5 live themes in `THEMES` order** (scored:true, with constituents), then the **2
  `DEFERRED_THEMES`** appended as `scored:false` markers with their reason (AC-7). A live theme that
  a sector didn't qualify for is simply **absent from that sector's list** (AC-6) — not scored:false,
  not zero.
- `normalization` string (D2 wording) + `caveats = _THEME_SCORE_CAVEATS` (below). Empty `sectors`
  is a valid honest result (AC-9).

`_THEME_SCORE_CAVEATS = _PEER_CAVEATS + [` a line naming the normalization (equal-weight
constituents; z-score of per-sector medians; 50 = cross-sector average, ±1σ ≈ 15 pts); a line that
scores are **positions vs other sectors, not good/bad verdicts** (AC-10); a line that dollar-level
metrics are excluded (only scale-free constituents scored); a line that two themes are **not yet
scored** and why; the existing "N/A excluded, never a low value" line is already in `_PEER_CAVEATS`.` `]`

**Response schema — `normalize/schema.py`:**
```python
class ThemeConstituent(BaseModel):
    metric: str; label: str; higher_is_better: bool
    median: float; oriented_z: float
class SectorThemeScore(BaseModel):
    theme: str; theme_label: str; scored: bool
    score: int | None = None; percentile: float | None = None
    rank: int | None = None; rank_of: int | None = None
    delta_vs_prior_fy: float | None = None
    constituents: list[ThemeConstituent] = []
    reason: str | None = None            # set only when scored is False
class SectorThemeScores(BaseModel):      # a sector + its theme list
    group: str; group_label: str
    themes: list[SectorThemeScore] = []
class SectorThemeScoreList(BaseModel):
    fiscal_year: int; fiscal_period: FiscalPeriod; peer_basis: str
    normalization: str
    caveats: list[str] = Field(default_factory=list)
    sectors: list[SectorThemeScores] = Field(default_factory=list)
```

`main.py`: `app.state.sector_theme_score_repo = SQLiteSectorThemeScoreRepository(settings.secfin_db_path)`
next to `sector_dupont_repo`, and `.close()` in the finally block.

---

## Files to touch

**New:** `normalize/themes.py`; `analytical/sector_theme_scores.py`;
`storage/sector_theme_score_repository.py`; `storage/sqlite_sector_theme_score_repository.py`;
tests `tests/test_sector_theme_scores.py` (batch/unit) + endpoint test (extend the sectors route test).
**Edit:** `normalize/metrics.py` (`METRIC_DIRECTION` + `higher_is_better`, incl. `dio`);
`storage/metric_distribution_repository.py` + `sqlite_…` (`list_for_metric_all_periods`);
`normalize/schema.py` (4 models); `api/routes.py` (dep + endpoint + `_THEME_SCORE_CAVEATS`);
`api/main.py` (wire + close).
**Docs (guardrail 3):** `docs/DATA_MODEL.md` (tables, direction map, normalization),
`docs/ROADMAP_SECTOR_ANALYTICS.md` + `docs/REDESIGN_SECTOR_OVERVIEW.md` (Phase 0 status),
`CLAUDE.md` repo-layout lines (`normalize/themes.py`, `analytical/sector_theme_scores.py`,
the two new tables/repos, the new route).

---

## AC → concrete check

| AC | Check |
|----|-------|
| AC-1 | Unit: hand-built medians → expected score; endpoint spot-check reproduces a stored score from `metric_distributions`. |
| AC-2 | Unit: two sectors, one metric `higher_is_better=False`; lower median ⇒ higher `oriented_z`. Real spot-check on `debt_to_equity` or `ccc`. |
| AC-3 | Unit + real: `rank` dense 1..`rank_of`, ordered by `composite_z` desc; rank 1 is the most-favorable sector. |
| AC-4 | Unit: sector with prior-FY ⇒ `delta = score_Y - score_{Y-1}`; sector without prior-FY ⇒ `delta is None` (assert not 0). |
| AC-5 | Endpoint returns `constituents[]` with metric/label/median/`oriented_z`/`higher_is_better`; `normalization` present. |
| AC-6 | Unit: a constituent with no distribution is absent from `constituents` and not averaged; a theme under `min_constituents` is absent from the sector (not scored:false, not 0). |
| AC-7 | Endpoint: every sector's `themes` ends with `accounting_quality` + `structure_activity`, `scored:false`, `reason` set, no score. |
| AC-8 | Real: a sector absent from `metric_distributions` (below `secfin_peer_min_size=5`) never appears. |
| AC-9 | Endpoint: `caveats` non-empty incl. normalization + not-a-verdict + deferred-themes lines; empty-DB → `sectors: []`, still 200. |
| AC-10 | Grep the payload/caveats for any "good/bad/buy/winner" claim — absent; normalization stated. |
| AC-11 | No `import duckdb` anywhere on the request path; endpoint reads via repo; no raw SQL in `routes.py`. |
| AC-12 | Unit: `higher_is_better("<themed metric>")` defined for all; a fabricated themed metric with no direction raises `KeyError`. |
| AC-13 | `pytest` green (Docker); new tests added; e2e unaffected (no UI). |
| AC-14 | Real (hydrated volume): run the batch; Profitability/Growth/Operating efficiency populate broadly, Financial health legitimately sparse; hand spot-check one sector/theme. |
| AC-15 | Docs diffs present. |

---

## Handoff → `senior-backend-engineer`

Branch off `master` (`sector-theme-scores`). Order: metrics direction map + themes.py →
distribution-repo read helper → storage (repo + sqlite + tables) → batch → schema models →
endpoint + main wiring → docs → tests. Self-verify with `pytest` in Docker, then run the batch on a
hydrated volume for AC-14 (per `ROADMAP_SECTOR_ANALYTICS.md` infra note — real data is in the
backup, not the stub `secfin.db`; **prod batch run is a deferred DevOps step**). No frontend stage.
