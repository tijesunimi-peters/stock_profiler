# Implementation — Sector Analytics app: Compare view (Phase 3)

**Frontend-only** (per `2-architecture.md` R1 — no backend/endpoint/schema). Branch:
**`sector-app-compare`**, stacked on Phase 2 (`sector-app-company` `329388d`). Uncommitted.

## Frontend (Senior Frontend Engineer) — DONE

The Compare view (altitude 3) in the `/sector-analytics` app: **sector-vs-sector**, reusing the
three payloads the app already loads — `state.themeScores` (all sectors' per-theme 0-100 scores) +
`state.spreads[group]` (per-metric medians). **No new endpoint.** **No favorability color** — A =
`--accent` (terracotta), B = a self-contained slate-blue token, **categorical identity only**; bars
are **true-length** and **no winner is declared**.

- **`static/sectorapp.js`**
  - **URL presets** `?view=compare&a=<group>&b=<group>` (parsed next to the existing `?symbol=`/
    `?view=company` presets) to land on a pair (used by e2e + shareable).
  - **`togglePin` rewired**: the control-bar "pin to compare" now sets `compareA = current sector`
    **and** `view = "compare"` (was a parked no-op); the pinned state also lights when the current
    sector equals `compareB`.
  - **`ensureSpreads(group)` + `ensureCompareData()`**: lazily fetch `/sectors/{g}/spreads` for A and
    B (cache in `state.spreads`, reusing the Sector-view fetch shape).
  - **`renderCompareView`** (replaces the compare stub):
    - Two **`<select>` A/B selectors** with identity chips (A terracotta, B blue); changing either
      sets `compareA`/`compareB` and recomputes. A caption states the color is **identity, not a
      ranking — "no winner is declared."**
    - **`cmpThemesHtml`** — a **derived composite** row (mean of each sector's scored theme scores,
      labeled "derived · not a ranked position") + one row per theme in canonical order: paired
      **true-length** bars (`width = score/100`), score at bar end, a **signed gap label** ("<lead
      abbrev> +N", full `--ink` when `|gap| ≥ 10` else `--muted` — **ink weight, not color**). A
      **deferred** theme, or a theme **absent for a sector** (e.g. operating-efficiency for banks),
      renders an honest **"not scored"** row — **never a 0 bar**. Provisional framing carried.
    - **`cmpMetricsHtml`** — paired **metric-median cards** over the **union** of A's and B's
      `spreads.metrics` (so a sector missing a metric shows an honest **N/A** cell): each card =
      metric label + a **"lower is better"** text marker (from a client direction map; `CO_DIR`) +
      A/B bars **normalized per metric** (`|median| / max(|a|,|b|)`) with the **raw median** at the
      bar end.
    - **Honest states**: B unset → "Pick a second sector (B) to compare against <A>"; neither theme
      score → an honest empty; A==B allowed (identical bars, gap "even").
  - **`wireCompareView`**: the A/B `<select>` change handlers.
- **`static/sectorapp.css`** — `.pa-cmp-*` styles, **tokens only**. A/B identity via a local
  `--pa-cmp` custom prop (`.pa-cmp-idA{--pa-cmp:var(--accent)}`, `.pa-cmp-idB{--pa-cmp:var(--pa-b)}`,
  `--pa-b:#3d6a8a` defined on `.pa-app`). Paired bar tracks, gap label (strong/soft ink),
  metric-card grid, "lower is better"/"not scored"/"N/A" markers, mobile reflow (cards → 1 col at
  900px; selectors stack at 560px). **`--positive/--caution/--negative` never referenced.**
- **`scripts/headless_check.js`** — `sectorapp-compare` (73 vs 60), `sectorapp-compare-nab` (B
  unset), `sectorapp-compare-na` (73 vs 28), `sectorapp-compare-pin` (Pin → pick B).
- **`docs/REDESIGN_SECTOR_APP.md`** — Phase 3 flipped to BUILT.

### Note: self-contained B color (a bug found + fixed in self-verify)

The page loads **only** `style.css` + `sectorapp.css` (the app deliberately does **not** load
`app.css`), so the architecture's suggested `--gaap-color` (defined in `app.css`) was **undefined**
→ the first e2e render showed **invisible B bars**. Fixed by defining a **local** `--pa-b: #3d6a8a`
token on `.pa-app` (the same slate blue, self-contained) and pointing B's identity at it. Re-verified
blue B bars render. (Pre-existing, out of scope: `sectorapp.css` also references a few Phase-1 tokens
not in `style.css` — `--ext`, `--shadow`, `--accent-wash` — which degrade to no-op; unchanged here.)

### Verified (frontend)

- **`pytest` 511 passed, 6 skipped** — no regression (frontend-only; no Python change).
- **e2e headless check PASS, errors=0** on all four compare shots.
- **Eyeballed:**
  - `sectorapp-compare` (73 vs 60): A terracotta / B blue paired bars; Financial health gap
    "Business Services +17" full ink, smaller gaps soft; **Operating efficiency "not scored" for B**
    (banks omit it — no 0 bar); Accounting quality + Structure & activity "not yet scored" for both
    with reasons; metric cards with A/B medians, **N/A** on ROA/Revenue/Earnings for banks, **"lower
    is better"** on Debt to Equity. Composite labeled **derived**.
  - `sectorapp-compare-nab` (B unset): honest "Pick a second sector (B)…" prompt, no numbers.
  - `sectorapp-compare-pin`: Pin on group 73 → jumps to Compare with A pinned → picking B renders
    the full comparison; control bar shows "✓ PINNED TO COMPARE".

### For QA to probe

- Drive the **A/B selectors** (change either → recompute); the **pin flow**; **`compareA/compareB`
  persist** across view switches (Compare → Sector → Company → Compare); **no favorability color**
  (computed styles — A `--accent`, B `#3d6a8a`, no green/red); the **"lower is better"** text marker
  on `debt_to_equity`; **N/A** cells (73 vs 28) + **"not scored"** rows never 0; **mobile 390px**
  reflow (cards + selectors stack, no overflow — not covered by the render check); the Sector +
  Company views and `/sectors` still render.
