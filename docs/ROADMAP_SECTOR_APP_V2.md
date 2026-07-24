# Roadmap — Sector Analytics app **v2**

Status: **planning (2026-07-24).** Owner: operator + delivery pipeline.
Reference: `docs/design/sector-app-prototype-v2/` (updated prototype: `HANDOFF.md` §5/§9,
`prototype.dc.html`, `CLAUDE.md`). Supersedes the v1 target of `docs/REDESIGN_SECTOR_APP.md` at the
layout level (the shipped v1 app stays as the base to evolve).

## What v2 is

An updated prototype that **re-architects the Sector view** and **substantially expands** every view,
adding a **5th view (Filings)**. It resolves the second-opinion flags on the Sector view (merged
distribution, full-width decomposition, feed pulled out of flow) and adds a right rail + a 960px
content cap. Same "paper terminal" language + honesty rails.

## Locked decisions (operator, 2026-07-24)

1. **Keep the F4 favorability color** (scorecard trend-delta chip). The v2 prototype + its `CLAUDE.md`
   reaffirm **no** favorability color; **we intentionally deviate** and keep the F4 color per the
   `STYLE_GUIDE §1` exception (color accompanies the arrow/position, value neutral). Recorded here so
   it isn't "corrected" back to the prototype. Everything else honors the prototype's no-color rule.
2. **Drop the M1 parity charts** (DuPont tree · ROE/DuPont trend · lifecycle CCC trend) from the
   Sector view to match v2. → The **`sector-parity` branch (M1) is superseded and will NOT be merged
   as-is**; those three charts come out. (Consequence: when `/sectors` is retired for the app, the
   old page's DuPont/ROE/lifecycle are **not** carried over — the operator's accepted tradeoff.)
3. **Track-2 stays placeholders** (standing directive): the expanded Qualitative *Disclosure
   landscape*, representative filing language, and the new *Filings* view are **honest placeholder
   layouts** — replicate the shape, never fabricate figures/filers/excerpts.

## Impact on prior/in-flight work

- **v1 fidelity work (on `master`)** — the base to evolve into v2 (Sector/Company/Compare/Qualitative).
- **Migration roadmap (`ROADMAP_SECTOR_MIGRATION.md`)** — **M1 (parity port) is superseded** by decision
  2 (the `/sectors` target is now v2, which omits DuPont/ROE/lifecycle). **M2 (routing swap) + M3
  (decommission) still apply, but move to AFTER the v2 build** — you don't retire `/sectors` until the
  v2 app is the agreed superset-minus-the-dropped-charts. Mark M1 obsolete; keep M2/M3.
- **`sector-parity` branch** — do **not** merge. Abandon (or cherry-pick nothing) — its DuPont/ROE/
  lifecycle are dropped. (Its `?range=`/decomp-default plumbing is also gone unless a v2 block needs it.)

## Buildability — Track-1 (real now) vs Track-1-not-aggregated vs Track-2 (placeholder)

| v2 element | Classification | Notes |
|---|---|---|
| Scorecard · decomposition · peer strip · distribution (this-theme/all-metrics) | **Track-1 real** | already shipped (v1); re-arrange |
| **Insider flow** (sector net buy/sell, Forms 3/4/5) | **Track-1, not aggregated** | insider data is **per-CIK only** — no sector-level endpoint. Needs backend aggregation → **placeholder** until then |
| **Geographic revenue mix** (ASC 280) | **Track-1, not ingested** | no sector segment/geo aggregate → **placeholder** (or a backend spike) |
| Company **sparklines** (8-quarter metric trend) | **Track-1 real** | per-company metric history exists |
| Company **segment & geographic mix** (ASC 280) | **Track-1, not ingested** | verify company-hub segments; likely **placeholder** at sector app |
| Company **filing history & flags** | **partly Track-1** | filing metadata (10-K/10-Q/8-K/Form 4 dates) is available per CIK; restatement/material-weakness flags are Track-2 → mixed; **placeholder** the flags |
| Compare **profile radar** (7 themes) | **Track-1 real** | from theme scores |
| Compare **overlaid IQR spread** per metric | **Track-1 real** | from `spreads` |
| Qualitative **Disclosure landscape** (cyber/CAMs/auditor/RF-volume/non-GAAP/late/human-capital) | **Track-2** | **placeholder layout** |
| Qualitative **representative language** + click-to-reveal tickers | **Track-2** | **placeholder** |
| **Filings view** (5th) | **Track-2** | **placeholder layout** (breadcrumb + form tabs + paginated list, all "to be defined") |
| Shell: 960px cap · sticky right rail (snapshot + feed + how-to-read) | **frontend** | Track-2 feed → placeholder in the rail |

**Rule for placeholders (unchanged):** replicate the layout; every data cell an unmistakable "— / to
be defined / planned"; never a fabricated figure, filer, count, %, ●, or excerpt.

## Phasing — one `/deliver` iteration per view (branch off `master`, stacked)

**P0 — Shell v2 (frontend-only).** Content cap 960px; the sticky **262px right rail** (≥1240px) with
**Sector snapshot** + the **"What's moving" Track-2 feed placeholder** (moved out of the Sector flow) +
a **"how to read this"** note. Keep the view rail + control bar. (The sub-industry pills stay a
placeholder for now.)

**P1 — Sector view v2 (frontend-only) — the big re-arch.** Three numbered scopes:
- **01 Health scorecard** — tiles (keep the F4 delta color) + **peer strip directly under the grid** +
  **Geographic revenue mix** (placeholder) + **Insider flow** (placeholder until aggregated).
- **02 What drives it** — **decomposition full-width, open by default** + **Biggest shifts**.
- **03 Distribution** — one merged block with a **[This theme] / [All metrics] toggle** (`drillScope`),
  reusing the existing spreads.
- Removes the v1 2-col decomp/DuPont row, the drop-in DuPont/ROE/lifecycle (decision 2), and the
  in-flow feed placeholder (now in the right rail).

**P2 — Company view v2 (frontend-only).** Add **sparklines** (real; click-to-expand 8-quarter trend),
**segment & geographic mix** (placeholder), **filing history & flags** (filing dates real where
available; flags placeholder). Carry the F1/F2/F3 follow-ups still open.

**P3 — Compare view v2 (frontend-only).** Add the **7-theme profile radar** (real) + **overlaid IQR
spread** per metric (real); keep the v1 paired bars + no-winner + A/B identity.

**P4 — Qualitative view v2 (frontend-only, placeholder).** Expand the placeholder layout to the v2
shape: representative-language rows, the **Disclosure landscape** blocks, per-filer matrix, click-to-
reveal — **all placeholders**, keeping the "Track 2 · not yet derived" framing.

**P5 — Filings view v2 (frontend-only, placeholder).** The new 5th view: breadcrumb + form-type tabs +
paginated filing list — a **placeholder** reached from the Qualitative "Filings →" stubs.

**P6 — Backend spikes (optional, later).** If the operator wants **Insider flow** and/or **Geographic/
segment mix** to be *real* rather than placeholders: sector-level aggregation jobs/endpoints (13F-style
batch for insider net-flow by sector; ASC 280 segment ingest). Scoped separately — Track-1 but new
data work; **not required** for the v2 UI (placeholders hold the layout).

**P7 — Migration M2/M3** (from `ROADMAP_SECTOR_MIGRATION.md`): once v2 is agreed, do the routing swap
(`/sectors` → the app + redirect + legacy flag) and later decommission the old page.

Each Pn is a `/deliver` iteration with its own brief/architecture/QA; **interactive** views get the
operator hands-on gate, **placeholder/layout-only** ones may be accepted at the QA-tester level.

## Honesty deviations recorded

- **F4 color kept** despite the v2 prototype's no-color rule (operator, 2026-07-24) — the single
  intentional deviation; everything else honors the prototype.
- All Track-2 features render as **honest placeholders** (no fabricated data), per the standing directive.

## Open decisions

- **R1 — Insider flow + Geographic mix: placeholder or backend now?** Recommend **placeholder** in
  P1 (keeps the UI moving); optionally real via **P6** backend spikes later. Operator call.
- **R2 — sub-industry pills** — v2 uses them to narrow peer count / rank basis / context pill; we have
  no SIC-4 backend. Keep the **placeholder** (F6) or scope the data. Operator call.
- **R3 — DuPont/ROE/lifecycle** — confirmed **dropped** (decision 2). If ever wanted back, they'd be a
  separate opt-in block, not part of v2.
- **R4 — order of P1…P5** — recommend **P0 → P1** first (biggest change + resolves the flags), then
  P2/P3 (real additions), then P4/P5 (placeholders). Operator may reprioritize.

## Sequence at a glance

**P0 shell → P1 Sector (re-arch) → P2 Company → P3 Compare → P4 Qualitative (placeholder) → P5 Filings
(placeholder) → [P6 backend spikes if wanted] → P7 migration swap.** F4 color kept throughout; Track-2
stays placeholders; DuPont/ROE/lifecycle dropped.
