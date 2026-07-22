# Architecture — Sector Analytics app: Compare view (Phase 3)

Stage 2 (Principal Architect) handoff. Task slug: `sector-app-compare`.
Designs against `1-brief.md` (AC-1…AC-11). **Verdict: FRONTEND-ONLY** — no backend, no new endpoint,
no schema, no `normalize/`/`storage/` change. Branch off `master`, **stacked on Phase 2**
(`sector-app-company` `329388d`); the Compare view extends `sectorapp.js`.

Owner: **`senior-frontend-engineer`** (entirely `api/static/` + `scripts/`). No
`senior-backend-engineer` stage.

## Scope re-check

Track 1, no scope drift. A pure client-side **re-shape** of three already-shipped, already-loaded
Track-1 payloads into a side-by-side layout. No free text, no new base dependency, no SEC-compliance
surface, no DuckDB. The API is untouched.

## R1 — endpoint sufficiency (the frontend-only vs full-stack fork): RESOLVED → reuse, no new endpoint

Every datum the Compare view needs is already fetched by the app today:

| View element | Source (already in `sectorapp.js` state) | Shape |
|---|---|---|
| Paired **per-theme** score bars + deferred markers | `state.themeScores.sectors[]` (from `/v1/sectors/theme-scores`, all sectors, loaded once at boot) | `SectorThemeScores{group, group_label, themes[]}`; each `SectorThemeScore{theme, theme_label, scored, score 0-100, percentile, delta_vs_prior_fy, constituents[], reason}` — 5 scored + 2 deferred (`scored:false`) |
| Paired **metric-median** cards | `state.spreads[g]` (from `/sectors/{group}/spreads`, lazy per group) | `SectorSpreadProfile{group, metrics[]}`; each `MetricSpread{metric, label, unit, median, p25, p75, …}` |
| Derived **overall composite** row (optional) | derived client-side = mean of the sector's 5 scored theme `score`s | labeled "derived · mean of scored themes" (mirrors Phase 2's honest derived composite) |

- **`/v1/sectors/theme-scores` returns all sectors** (`state.themeScores`, comment already says "all
  sectors") → both A and B come from the one payload; no per-sector call.
- **`/sectors/{group}/spreads`** is already lazily fetched + cached in `state.spreads[g]` by the
  Sector-view drill-down; Compare just ensures it for **both** A and B.
- **`MetricSpread` carries no `higher_is_better`** → the frontend carries a **client-side direction
  map** for the "lower is better" text marker — the **established pattern** (Phase 2's `CO_DIR`,
  Sector view's drill-down). Display-only; the API still owns the numbers.

No gap → **no new endpoint, no `routes.py`/`schema.py`/`storage/` change.**

## R2 — metric set for the median cards: RESOLVED

Cards are driven by **`state.spreads[g].metrics[]`** — the same liquidity/solvency + headline set the
Sector-view drill-down already renders (each row carries `label`, `unit`, `median`). The card set =
the metrics **present for both A and B** (intersection, in the payload's order); a metric a sector
lacks renders an **honest N/A** cell on that side (AC-5/AC-8). Carry a client direction map (reuse /
mirror the Sector-view drill-down's map or Phase 2's `CO_DIR`, extended to the spread metrics) for the
"lower is better" marker. Do **not** invent metrics with no seeded median.

## R3 — same-sector / unset-B: RESOLVED

- **B unset** (only A pinned): render A's column + an **honest prompt** on the B side ("Pick a second
  sector to compare") — no placeholder numbers, no half-drawn bars.
- **A == B**: allowed (identical bars, gap 0) — no special-casing, no error; it's a valid if
  uninteresting comparison. (No "winner", so identical bars are harmless.)
- **Neither set on entering Compare**: default `compareA` to the current `selectedGroup()` (so the
  view is never blank), prompt for B.

## R4 — gap-label emphasis: RESOLVED (non-verdict)

Signed gap label per theme row: `"<leading-sector-abbrev> +N"`. Emphasis is **ink weight only** —
`|gap| ≥ 10` → full `--ink`; else `--muted`. **Never** favorability color, never a ✓/winner mark.
Bars are always **true-length** (`width = score/100 * 100%`), so the eye reads the raw gap.

## R5 — fixture: RESOLVED (no change needed)

`seed_fixture.py` `_THEME_SCORE_DEMO` already seeds **4 groups**: `73` (all 5 themes), `60` (4 —
omits operating_efficiency), `35` & `28` (3 each); `_SECTOR_SPREADS` seeds `net_margin` for every
group + liquidity/solvency for some, with **`28` deliberately given no liquidity/solvency rows**. This
covers every honest state the Compare view must show:

- **A=73 vs B=60** → the primary demo: 5 vs 4 scored themes (operating_efficiency **absent for B** →
  "not scored"/N/A on B's side), plus the 2 deferred themes "not scored" for both. Both have spreads.
- **A=73 vs B=28** → 28's thin themes (growth/cash/op-eff absent) + **no liquidity/solvency spreads**
  → metric-card **N/A** cells.

The e2e only needs **URL presets** to land on these pairs (see frontend §e2e). No seeding change.

## Frontend design (senior-frontend-engineer) — `api/static/`

Invoke **`/frontend-design:frontend-design`** first for the paired-bar / metric-card look **within**
the paper-terminal system (tokens only, **no favorability color**; A `--accent`, B `--gaap` are the
only two hues and they mean **identity**).

### `static/sectorapp.js`

1. **URL presets** (for the pin flow + e2e), parsed in the same place Phase 2 reads `?symbol=`/`?view=`:
   `?view=compare`, `?a=<group>`, `?b=<group>` → set `state.view/compareA/compareB`. (Groups are SIC
   prefixes, e.g. `73`.)
2. **Rewire `togglePin`** (currently parks `compareA` and stays on Sector — line ~208): set
   `state.compareA = selectedGroup()` **and** `state.view = "compare"`, then re-render. The button's
   pinned state is on when `selectedGroup() === compareA || selectedGroup() === compareB` (the control
   bar already computes `pinned` at line ~280 — extend it to include `compareB`). (AC-6.)
3. **Replace the compare stub** (line ~329 `renderStub(... "Sector compare" ...)`) with
   **`renderCompareView(vp)`**:
   - **A/B selectors** — two sector pickers (reuse the control-bar combobox/`<select>` pattern), each
     with a leading identity chip: **A = `--accent`, B = `--gaap`**. Changing either sets
     `compareA`/`compareB` and re-renders. A caption states the color is **identity, not a ranking —
     "No winner is declared."** (AC-2/AC-3.)
   - **`ensureCompareData()`** — for each set group in `{compareA, compareB}`, ensure
     `state.spreads[g]` (reuse the existing lazy `/sectors/{g}/spreads` fetch + cache at ~176;
     `themeScores` is already global). Render loading state until both resolve.
   - **Derived overall composite row** (top): A and B each = mean of that sector's **scored** theme
     `score`s, true-length bars, **labeled "derived · mean of scored themes · not a ranked position"**
     (honest, mirrors Phase 2). (AC-4 honesty.)
   - **Per-theme rows** — iterate the app's `THEMES` order (mirrored client-side, as Phase 1/2
     already do): for each theme, look up A's and B's `SectorThemeScore`.
     - both `scored` → **paired true-length bars** (`width = score/100*100%`), score value at each
       bar end, **signed gap label** (R4).
     - a **deferred** theme (`scored:false`), or a theme **absent for a sector** (e.g. op-efficiency
       for banks) → an **honest "not scored" / "—" row** for that side — **never a 0 bar**. (AC-4/AC-8.)
     - Carry the scoring's **provisional** framing (a small "provisional" note, as the Sector view does).
   - **Metric-median cards** — for each metric present in **both** `state.spreads[A]` and
     `state.spreads[B]` (intersection, payload order): a card with the metric `label`, a **"lower is
     better" text marker** if the client direction map says inverted, A's and B's **raw median** at the
     bar end, bar length **normalized per metric** (`median / max(aMed, bMed) * 100%`), A `--accent` /
     B `--gaap`. A metric a sector lacks → **N/A** cell (AC-5/AC-8). Unit-aware formatting via
     `P.fmt`.
   - **Honest states** (AC-9): B unset → A column + "Pick a second sector to compare"; a sector with
     **no theme scores at all** → its bars all read "not scored" (never broken); both-empty →
     `P.states.empty`.
4. **`wireCompareView()`** — attach the A/B selector `change` handlers (called from the existing
   `wireShell`/post-render wiring, like `wireCompanyView`).

**No favorability tokens** (`--positive/--caution/--negative`) referenced anywhere (AC-10) — only
`--accent` (A) and `--gaap` (B), plus neutral ink/border tokens.

### `static/sectorapp.css`

`.pa-cmp-*` styles, **tokens only**: A/B legend chips, the paired-bar track (`.pa-cmp-bar-a` bg
`--accent`, `.pa-cmp-bar-b` bg `--gaap`), the gap label (full `--ink` vs soft `--muted`), the
metric-card grid, the "lower is better"/"not scored"/"N/A" text markers, and the **mobile reflow**
(paired rows + cards stack to one column at ≤900/390px, `overflow-x` contained). `--positive/
--caution/--negative` **never referenced** (AC-10).

### `scripts/headless_check.js`

Add shots (mirroring the Phase 2 additions), each waiting for the compare bars to render:
- `sectorapp-compare` → `/sector-analytics?view=compare&a=73&b=60` (paired bars + metric cards; 60
  missing op-efficiency → "not scored" on B).
- `sectorapp-compare-nab` → `/sector-analytics?view=compare&a=73` (B unset → honest prompt).
- `sectorapp-compare-na` → `/sector-analytics?view=compare&a=73&b=28` (28 → metric-card N/A cells).
- `sectorapp-compare-pin` → land on `/sector-analytics?group=73`, click `#paPin`, then set B (a
  driven click) → exercises the pin flow (AC-6).

### `docs/REDESIGN_SECTOR_APP.md`

Flip Phase 3 status to **BUILT** with the branch + a one-line summary.

## Acceptance criteria → concrete checks

| AC | Check |
|----|-------|
| AC-1 | `?a=73&b=60` renders paired composite/theme bars + metric cards; changing a selector recomputes (drive a `change`). |
| AC-2 | Every A element uses `--accent`, every B element `--gaap`; a legend states identity-not-ranking. Computed styles confirm the two hues. |
| AC-3 | No "win"/✓/rank text; bars are true-length (`width` ∝ score, not normalized to a winner); gap label signed with leading-sector abbrev; `|gap|≥10` = ink weight only. |
| AC-4 | 5 scored theme rows + derived composite show bars for both; the 2 deferred themes + op-efficiency-for-60 render "not scored"/"—", **no 0 bar**; "provisional" present. |
| AC-5 | Metric cards show A & B raw medians at bar end, per-metric normalized length, "lower is better" text marker on inverted (e.g. `debt_to_equity`); no color flip. |
| AC-6 | On `/sector-analytics?group=73`, `#paPin` → `view=compare`, `compareA=73`, pinned state; picking B completes the pair. |
| AC-7 | `compareA/compareB` persist: Compare → Sector → Compare keeps the pair (driven). |
| AC-8 | Real seeded aggregates; 60's missing op-efficiency + 28's missing spreads render N/A/"not scored", never 0; no fabricated coverage/winner. |
| AC-9 | B unset → prompt; a no-scores sector → honest "not scored", not a broken chart. |
| AC-10 | grep `sectorapp.js/css` → no `--positive/--caution/--negative` referenced; no CDN/React/Tailwind added; 390px overflow=0 (driven). |
| AC-11 | `docker compose build api` → e2e PASS errors=0, screenshots eyeballed; `pytest` green (no Python change → pure regression check). |

## Handoff → Senior Frontend Engineer

Frontend-only, branch off `master` stacked on `sector-app-company` `329388d`. Build the Compare view
in `sectorapp.js`/`sectorapp.css` per above (reuse the three loaded payloads — **no new endpoint**),
add the URL presets + rewire `#paPin`, add the four e2e shots, flip the doc. Verify: `pytest` green
(regression), `docker compose build api` → e2e headless check, **eyeball** the four compare shots +
mobile, and confirm the Sector/Company views + `/sectors` still render. No favorability color; A=accent
/ B=gaap identity only; no winner; N/A/"not scored" never 0.
