# QA — Sector Analytics app: Compare view (Phase 3)

Stage 4 (QA Tester). Branch: **`sector-app-compare`** (stacked on Phase 2 `sector-app-company`
`329388d`; uncommitted). Verdict: **PASS — ready to deploy** (operator-gated).

Tested against AC-1…AC-11 in `1-brief.md`, the design in `2-architecture.md`, and the engineer
handoff in `3-implementation.md`. Evidence is from the running feature — the full `pytest` suite, the
Docker e2e headless render check, a scripted behavioral driving pass, and eyeballed screenshots.

## How verified

- **pytest (fresh, Docker):** **511 passed, 6 skipped** — no regression (frontend-only; no Python
  change, confirmed by `git diff --name-only`: only `sectorapp.js/css`, `headless_check.js`, docs).
- **e2e headless render check** (`docker compose build api` → `--profile e2e`): **PASS, errors=0**,
  including the four compare shots (`sectorapp-compare`, `-nab`, `-na`, `-pin`).
- **Behavioral driving pass** — a puppeteer script over the live `e2e-app`: **19/19 checks PASS**
  (computed styles, true-length bars, selector recompute, persistence, pin flow, N/A-never-0, mobile).
- **Screenshots eyeballed:** `sectorapp-compare` (73 vs 60), `-nab` (B unset), `-pin` (pin flow),
  and `qa-compare-mobile` (390px).

## Per-acceptance-criterion verdict

- **AC-1 — A & B render paired composite/theme bars + metric cards; recompute on selector change.**
  **PASS.** `?a=73&b=60` renders 8 theme rows (composite + 5 + 2 deferred) + 9 metric cards; driving
  `#cmpSelB` 60→28 recomputes (N/A count 3→8, caption re-names B).
- **AC-2 — A/B distinguished by categorical color only (A `--accent`, B blue), identity not good/bad.**
  **PASS.** Computed styles: A bars `rgb(192,112,58)` (terracotta), B bars `rgb(61,106,138)` (slate
  blue) — distinct, neither green/red; a legend states "mark identity only — not good vs bad".
- **AC-3 — no winner declared; true-length bars; signed gap by ink weight.** **PASS.** No winner/
  victory language anywhere (the only "winner" token is the honest "no winner is declared"); bars are
  true-length (Financial health A=61 renders 448px wide vs B=44 at 323px — proportional, not
  winner-normalized); gap labels signed with the leading sector's abbrev, `|gap|≥10` in full ink
  ("Business Services +17") vs soft ink for small gaps — weight, not color.
- **AC-4 — composite + 5 themes scored for both; 2 deferred "not scored"; provisional.** **PASS.**
  Composite row labeled **derived**; the two deferred themes render "not yet scored" for both with
  reasons and **zero-width bars** (never a fabricated 0); the provisional note is present.
- **AC-5 — metric cards: raw A/B medians, per-metric normalized bars, "lower is better" text marker.**
  **PASS.** 9 cards; raw medians at bar end (e.g. Net Margin A 11.0% / B 22.0%); **"LOWER IS BETTER"**
  text chip on Debt to Equity (no color flip).
- **AC-6 — pin-to-compare.** **PASS.** On `/sector-analytics?group=73`, `#paPin` → Compare view with
  `compareA=73` and the button showing "✓ PINNED TO COMPARE"; picking B completes the pair.
- **AC-7 — compareA/compareB persist across view switches.** **PASS.** Compare → Sector → Company →
  Compare keeps A=73, B=60.
- **AC-8 — real aggregates; N/A / "not scored" never 0; no fabricated coverage/winner.** **PASS.**
  Operating-efficiency shows A scored (38%) but **B "not scored"** with a zero-width bar (banks omit
  it); banks' missing ROA/Revenue/Earnings medians render **N/A cells** (never 0); 73-vs-28 surfaces
  8 N/A cells (28 has no liquidity/solvency spreads). All values are the seeded Track-1 aggregates.
- **AC-9 — honest empty/degenerate states.** **PASS.** B unset → "Pick a second sector (B) to compare
  against Business Services" (no numbers); the Sector view (scorecard) and the old `/sectors` page
  still render.
- **AC-10 — no favorability color; CSP-safe; mobile 390px reflow.** **PASS.** No
  `--positive/--caution/--negative` referenced; no new CDN/remote dep (frontend reuses vendored
  assets; `sector-analytics.html` unchanged on this branch); 390px reflow stacks the cards + selectors
  with measured horizontal overflow **= 0**.
- **AC-11 — build → e2e passes (eyeballed) + pytest green.** **PASS.** `docker compose build api` →
  e2e PASS errors=0; screenshots eyeballed; pytest 511/6.

## UI/UX review

- **States.** Populated, B-unset, "not scored", and N/A each render intentionally. A theme a sector
  can't be scored on ("not scored") and a metric it lacks (N/A) are honest and visibly distinct from
  a real low value — no zero masquerading as data.
- **Legibility & layout.** The paired A/B bars read cleanly on a shared spine; gap labels sit at the
  row head without crowding; metric cards form a tidy two-column grid that collapses to one column
  on mobile with no clipping or horizontal bleed.
- **Copy.** Honest and active: "A and B are colors of identity, not a ranking · no winner is
  declared"; the composite is "derived … not a ranked position"; the caption spells out
  "bar length normalized per metric · value shown raw · N/A where a sector has no comparable median".
  No good/bad or over-claiming language.
- **Affordances.** Both selectors are standard, reachable `<select>`s; the pin button reflects its
  state; the identity chips (A/B) repeat consistently across selectors, legend, bars, and cards.
- **Honesty contract.** Direction is conveyed by the "lower is better" text marker + the raw value,
  never color; the two identity hues are categorical only; deferred/absent → "not scored"/N/A.

### Minor / cosmetic (non-blocking)

- The engineer found and fixed a real bug during self-verify: the app doesn't load `app.css`, so the
  architecture's `--gaap-color` was undefined and B bars were invisible on the first render; fixed
  with a self-contained `--pa-b` token. Verified blue B bars render.
- Pre-existing (out of scope, unchanged here): `sectorapp.css` references a few Phase-1 tokens not in
  `style.css` (`--ext`, `--shadow`, `--accent-wash`) that degrade to no-ops; not introduced by this
  change and not touched.

## Handoff

**Verdict: PASS.** All 11 acceptance criteria met; full suite green; e2e green + eyeballed; the
honesty contract holds (no favorability color, no winner, N/A/"not scored" never 0, composite labeled
derived, real Track-1 aggregates). Frontend-only — no backend/endpoint/schema change, no DuckDB / raw
SQL, no new remote dependency; the Sector/Company views and `/sectors` are untouched.

**Ready to deploy** — deployment stays operator-gated. Operator's next options: commit the
`sector-app-compare` branch, then proceed to Phase 4 (Qualitative "Coming — Track 2" stub). No
defects require a loop back to engineering.
