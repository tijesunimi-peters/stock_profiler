# QA — v2 P2: Company view

Stage 4 (QA Tester). Task slug: `sector-v2-company`. Branch: `sector-v2-company` (off `sector-v2`).
Frontend-only.

**Verdict: PASS at the QA-tester level — PENDING operator hands-on manual UI verification.** This is an
**interactive** change (sparkline click-to-expand, per-metric trend toggle, focal-change trend reset), so
per the manual-gate policy the operator hands-on step is required before commit/deploy.

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 Sparklines real | ✅ | `GET /v1/companies/320193/metrics/net_margin/history?frequency=quarterly` → **11 points**, unit ratio, as-restated, quarterly (HTTP 200). `sectorapp-company-trend.png`: every AAPL row shows a sparkline + neutral label (`↑ 8q`/`↓ 8q`). |
| AC-2 na/nm as gaps, never 0 | ✅ | Same response carries **2 gap points (`value:null`)** — helper breaks the line at gaps, never 0/interpolated. Synthetic `900001` history = 0 points → honest "no trend yet" (`sectorapp-company.png`), not a flat line. |
| AC-3 Click-to-expand | ✅ | `sectorapp-company-trend.png`: clicking Net Margin's `.pa-dp-spark` opened its `.pa-dp-trend` panel (2024→2026, "As-restated · quarterly"). Per-metric `coTrendOpen`; reset on focal change (`selectFocal`/`selectFocalCik`/`clearFocalToDefault`). e2e clicked+waited on `.pa-dp-trend`. |
| AC-4 Segment/geo placeholder | ✅ | `sectorapp-company*.png`: 2-col by-segment/by-region card, "— to be defined; no figures shown" + ASC 280 note. Grep: only honest phrases, **no %/digit/●**. |
| AC-5 Filing history placeholder | ✅ | Card with "flags — placeholder" chip + honest body ("no filings shown, nothing fabricated"). Grep clean. |
| AC-6 Header context pill real | ✅ | `sectorapp-company-trend.png`: "11 peers · SIC 35" (real, from `focalPeers`/`focalGroup`); breadcrumb + dropdown intact; no fabricated sub-industry. |
| AC-7 No favorability color (except F4) | ✅ | Grep: `--positive`/`--negative` appear **only** in `.pa-tile-delta.pos/.neg` (Sector chip). Sparkline/trend neutral `--ink-soft`, single `--accent` last dot; "lower is better" is text. |
| AC-8 Honesty rails | ✅ | N/A never 0 (gaps confirmed via response); composite card labeled "derived · avg of the theme percentiles above (not a ranked position)"; rail P-values derived; no price/mcap anywhere. |
| AC-9 Regression | ✅ | e2e rendered `sectorapp-company-default/empty/refocus`, `sectorapp` (Sector), `sectorapp-compare*`, `sectorapp-qual`, and `sectors*` all `errors=0`; F2 dropdown + dot-refocus + `focalCik` persistence + honest states intact. |
| AC-10 Verify | ✅ / ⚠︎ | `pytest` **511 passed, 6 skipped**; e2e **HEADLESS CHECK PASS** (exit 0) + eyeballed. 390px reflow covered by CSS (`.pa-co-body` stacks, `.pa-sg-body` 1-col, `.pa-dp-headright` wraps) — **operator to confirm on a real 390px viewport** in the manual step. |

## Review questionnaire

1. **What shipped** — In the Company view, each peer-distribution row now carries a small trailing
   sparkline for the focal filer; clicking it opens an inline 8-quarter trend chart. Two new cards
   (segment/geographic mix, filing history & flags) show the prototype's shape as honest placeholders.
2. **Surfaces touched** — `/sector-analytics` Company view (`renderCompanyView`, `coDotPlotHtml`,
   `wireCompanyView` + new `coSparkHtml`/`coTrendLabel`/`coTrendPanelHtml`/`ensureCompanyHistory` and
   two placeholder fns) in `sectorapp.js`; `sectorapp.css`; `seed_fixture.py`; `headless_check.js`. It
   consumes the existing `GET /v1/companies/{symbol}/metrics/{metric}/history` — no backend change.
3. **AC → evidence** — see the table above; each AC ties to a driven response body or a named screenshot.
4. **States exercised** — *populated* (AAPL `?symbol=320193`: sparklines + expanded trend);
   *honest-empty* (synthetic `900001`: "no trend yet" on every row); *placeholder* (both new cards);
   *loading* (history in-flight renders no sparkline until it arrives, then re-renders). Error path:
   a history fetch failure keeps the empty series → "no trend yet" (code path; degrades without breaking).
5. **Edge cases probed** — **N/A vs 0**: the net_margin series carries 2 `value:null` gap points that
   render as line breaks, never 0; short/absent series (`900001`) shows "no trend yet", not a padded or
   flat line. The metric-history endpoint is a per-company read (no 13F multi-class/PRN relevance here).
   Not re-tested this phase: 429/502 (unchanged endpoint).
6. **Honesty contract** — N/A never 0 (gaps); derived numbers labeled (composite "derived", rail P##,
   sparkline label is a neutral factual descriptor, not a verdict); placeholders carry no fabricated
   figure/filer/%/●/date/flag; no price/market/over-claiming copy; trend caption states "as-restated ·
   quarterly · gaps = N/A or N/M periods (not interpolated)".
7. **Deltas from the brief** — none material. Filing history is a full placeholder (operator decision).
   Could not fully automate: the *felt* interaction (click response, focal-change collapse, 390px touch
   layout) — deferred to the manual step.
8. **Residual risk** — the sparkline/trend only populate for filers with multi-quarter raw facts; most
   synthetic fixture filers honestly show "no trend yet" (correct, but a human should confirm it reads as
   intentional, not broken). Worst-if-wrong: a trend rendering *through* an N/A gap (would misstate
   history) — verified not happening (2 gaps in the driven response, line breaks at them).

## UI/UX review

Clean, restrained extension of the shipped Company view. The sparkline sits naturally in the row header
opposite the value; neutral line + single accent last-dot ties "latest" to the focal diamond without
implying good/bad. The expand panel is a quiet inset that reuses the tested `trendChart` (with its own
honest empty state). Both placeholders match the P1 dashed-muted treatment and read unmistakably as
"not yet" — no chance of being taken for data. Copy is plain and honest ("no trend yet", "to be defined;
no figures shown"). No overflow or clipped labels at 1280; the header cluster wraps. Consistent with the
paper-terminal system and the STYLE_GUIDE.

## Manual UI verification (required — interactive change)

Open **http://localhost:8001/sector-analytics?view=company&symbol=320193** (AAPL, reseeded) in a wide
window:

1. **Sparklines present** — each metric row (Net Margin, Return on Equity, …) shows a small sparkline
   with a neutral label like `↑ 8q` / `↓ 8q` on the right, before the value. *Expected:* real trajectories,
   neutral line, one accent dot at the end; no red/green.
2. **Click a sparkline** (e.g. Net Margin) — an inline "Trailing 8-quarter trend" panel opens below the
   row with a line chart + "As-restated · quarterly" caption. Click again → it closes. *Expected:* only
   that metric's panel toggles.
3. **Open two different metrics' trends**, then **switch focal** (click a peer dot, or pick another
   company in the breadcrumb dropdown). *Expected:* the open trends collapse for the new filer (no stale
   panel), and the new filer's sparklines/values load.
4. **Honest-empty case** — open **?symbol=900001**. *Expected:* every row shows "no trend yet" (italic,
   muted) instead of a sparkline — never a flat/zero line — and the dots/values still render.
5. **Placeholders** — scroll to "Segment & geographic mix" and "Filing history & flags". *Expected:* both
   read as unmistakable placeholders ("to be defined; no figures shown" / "no filings shown"); no numbers,
   segments, dates, or flags.
6. **Context pill** — the header shows "N peers · SIC 35" (real) next to the breadcrumb. *Expected:* real
   count, no fabricated sub-industry name.
7. **Mobile 390px** — narrow the window to ~390px. *Expected:* the header + row-right cluster wrap, the
   segment/geo card stacks to one column, no horizontal scroll.
8. **Regression** — switch to Sector / Compare / Qualitative views and back; open `/sectors`. *Expected:*
   all render; the Sector right rail + scopes still work.

Record outcome here: operator ran the script (2026-07-24) — all checks PASS, with two polish notes now
fixed (below).

## Refinements from operator manual verification (2026-07-24)

- **Trend gridlines** — operator noted the expanded 8-quarter trend had no gridlines. Added a subtle
  horizontal (value bands) + vertical (per-quarter) grid behind `.trend-svg` via `--rule` gradients,
  consistent with the box-whisker dot-plots. Re-verified in `sectorapp-company-trend.png`.
- **Company view right rail** — operator noted "nothing on the right" on the Company view (the P0 rail
  was Sector-only, leaving empty space). Resolved (operator chose the focal-snapshot option): the shell
  now shows a right rail on the Company view too — a **"Filer snapshot"** card (focal name · ticker ·
  its own SIC peer group · peer count · period — the FOCAL's context, never the possibly-mismatched
  dropdown sector) + a company-specific "how to read this" card. Hidden < 1240px like the Sector rail.
  Re-verified in `sectorapp-company-trend.png` (Apple Inc. · SIC 35 · 11 peers; Ticker "—" honest for a
  raw-CIK focal). e2e HEADLESS CHECK PASS, no regressions.

## Handoff

**PASS at the QA-tester level; awaiting operator hands-on manual UI verification** (interactive gate).
On operator sign-off → the `sector-v2-company` branch is ready to commit; the v2 sequence continues at
P3 (Compare view). No defects found. `:8001` reseeded to the current fixture for the manual pass.
