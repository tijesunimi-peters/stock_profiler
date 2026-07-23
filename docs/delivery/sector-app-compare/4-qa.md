# QA — Sector Analytics app: Compare view (Phase 3)

Stage 4 (QA Tester). Branch: **`sector-app-compare`** (stacked on Phase 2 `sector-app-company`
`329388d`; uncommitted). Verdict: **PASS — ready to deploy** (automated + manual UI verification
complete; operator-gated).

> Retrofit note (2026-07-22): the review questionnaire + manual UI verification sections were added
> after the QA-Tester skill gained those requirements. The operator ran the manual click-through on
> 2026-07-22 against the seeded `:8001` instance — **all 8 steps confirmed, no change requests.**

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

## Review questionnaire

1. **What shipped.** A **sector-vs-sector** Compare view (altitude 3): pick two sectors (A and B) and
   read their composite + per-theme health as **paired true-length bars** with a signed gap label,
   plus **paired metric-median cards**. A = terracotta, B = blue — **identity only**; **no winner**.
   "Pin to compare" jumps here from a Sector with A pre-pinned.
2. **Surfaces touched.** **Frontend-only.** The Compare view in `sectorapp.js` (`renderCompareView`,
   A/B `<select>`s, `cmpThemesHtml`/`cmpMetricsHtml`, the rewired `#paPin`, `?view=compare&a=&b=`
   presets) + `sectorapp.css` (`.pa-cmp-*`, A `--accent` / B local `--pa-b`). **Reuses** the existing
   `/v1/sectors/theme-scores` (all sectors) + `/sectors/{group}/spreads`; no new endpoint/schema/backend.
3. **AC → evidence.** All **11 ACs PASS** (per-AC table). Artifacts: `sectorapp-compare.png` (73 vs 60),
   `-nab` (B unset), `-na` (73 vs 28), `-pin`; the **19/19** scripted driving pass; computed styles A
   `rgb(192,112,58)` / B `rgb(61,106,138)`; true-length check (Financial health A 61 = 448px > B 44 = 323px).
4. **States exercised.** Populated (73 vs 60), **B-unset prompt** ("Pick a second sector"), N/A-heavy
   (73 vs 28), the **pin flow**; loading until both sectors' spreads resolve; **not-scored** rows
   (banks' operating-efficiency + the two deferred themes).
5. **Edge cases probed.** N/A-never-0: banks' missing medians → **N/A cells**; operating-efficiency
   absent for banks → **"not scored" zero-width bar** (never a 0-value bar); A==B allowed (gap "even").
   13F/restatement/multi-class/429/upstream-502 — **N/A** (reads materialized sector aggregates only).
6. **Honesty contract.** No favorability color — A/B are **categorical identity** only (computed
   neutral terracotta + slate blue, no green/red); **no winner** (true-length bars; signed gap by ink
   weight, `|gap|≥10` fuller); composite labeled **derived · not a ranked position**; "lower is
   better" a **text** marker; N/A never 0; provisional framing carried. *(NB: F4 will later add
   directional color here too, paired with the arrows — see followups.)*
7. **Deltas from the brief.** None material — all 11 ACs met. Automation gaps: the **by-hand** A/B
   selector change + **pin-to-compare** flow were driven by script/URL preset, not real clicks —
   closed by the manual step below.
8. **Residual risk.** By-hand selector switching, the pin flow, and mobile reflow — all confirmed in
   the manual step. Biggest worry (a broken state when B is unset or a sector lacks all medians) —
   **not observed**; both render honest states.

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

## Manual UI verification (operator-run, 2026-07-22)

Run against the seeded `:8001` instance. Eight hands-on steps — **all confirmed, no change requests:**

1. **Renders** (`?view=compare&a=73&b=60`) — A/B selectors + paired composite/theme bars + metric
   cards. → **Confirmed.**
2. **A/B identity** — A terracotta / B blue used consistently; "identity, not a ranking · no winner
   is declared". → **Confirmed.**
3. **Recompute** — changing B (→ 28) updates every bar, gap label, and card. → **Confirmed.**
4. **True-length + signed gap** — bars proportional to score; gap names the leader; no winner/rank
   wording. → **Confirmed.**
5. **Not-scored** — banks' operating-efficiency + the two deferred themes read "not scored" with no
   0 bar. → **Confirmed.**
6. **Metric cards** — raw A/B medians, "lower is better" on Debt to Equity, honest N/A cells. →
   **Confirmed.**
7. **Pin-to-compare** — from `?group=73`, Pin jumps to Compare with A pinned (pinned state shown),
   ready to pick B. → **Confirmed.**
8. **Mobile 390px** — selectors, bars, and cards reflow cleanly, no horizontal scroll. → **Confirmed.**

**Outcome:** the built behaviour is confirmed on every step; **no defects, no change requests**. The
Compare view is fully verified by hand.

## Handoff

**Verdict: PASS.** (Manual UI verification complete 2026-07-22 — all 8 steps confirmed, no change
requests.) All 11 acceptance criteria met; full suite green; e2e green + eyeballed; the
honesty contract holds (no favorability color, no winner, N/A/"not scored" never 0, composite labeled
derived, real Track-1 aggregates). Frontend-only — no backend/endpoint/schema change, no DuckDB / raw
SQL, no new remote dependency; the Sector/Company views and `/sectors` are untouched.

**Ready to deploy** — deployment stays operator-gated. Operator's next options: commit the
`sector-app-compare` branch, then proceed to Phase 4 (Qualitative "Coming — Track 2" stub). No
defects require a loop back to engineering.
