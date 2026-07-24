# P6a — Sector Insider flow — QA report

Stage 4 (QA Tester). Branch: `sector-insider-flow`. Verified against the ACs in `1-brief.md`;
implementation in `3-implementation.md`. Full-stack, both sides landed.

**Verdict: PASS — operator CONFIRMED** (interactive walk-through 2026-07-24; see
`4b-manual-verification.md`). No defects. **QA cycle 1:** the operator asked for a quicker-read cue on
the net figure → a **direction arrow (↑/↓/→) + single neutral accent tint** was added (not green/red;
no favorability-color deviation) and re-verified in fresh screenshots. One pre-existing, unrelated
e2e failure documented below (not a blocker).

## Pass/fail per acceptance criterion

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 parser captures `transaction_code`; P/S distinct from M/A/G/F | ✅ | `pytest tests/test_insider.py` PASSED (`test_form4_...` asserts M/F; `test_transaction_code_captures_open_market...` asserts S; `test_form3_holding_has_no_transaction_code`) |
| AC-2 net counts only open-market P/S; grants/exercises/gifts/tax excluded | ✅ | `test_batch_open_market_only_grouping_window_and_exclusions` PASSED (A/M/G/F contribute 0) |
| AC-3 value = Σ(shares×price) USD; missing-price excluded but counted | ✅ | same test: null-price P excluded from `buys`, `excluded_no_price_count`++; live: group 35 `excluded_no_price_count: 2`, group 73 `: 1` |
| AC-4 SIC grouping from `company_profiles`; no-profile CIK excluded, no crash | ✅ | batch test (cik=4 no profile → excluded, no crash); `peer_basis: "SIC 2-digit"` on every response |
| AC-5 trailing window anchored on transaction_date; window fields stored/reported | ✅ | batch test (out-of-window txn excluded); live: `window.start 2026-04-01`, `end 2026-06-30`, `label "last 90 days"` |
| AC-6 endpoint returns full contract; reads only materialized store | ✅ | live drive of `/v1/sectors/35/insider-flow`: all fields present, `transaction_count 42 = buy+sell`, `derived true`; **200 offline** (no live SEC — would be 502) |
| AC-7 unseeded group → honest N/A, never fabricated 0 | ✅ | live: group 28 → `has_data false`, `net/buys/sells null`, `as_of null`, `window.start null` |
| AC-8 uncovered group → consistent empty semantics | ✅ | live: group 99 (nonexistent) → 200, `has_data false`, `net null` (same as sibling `/sectors/{group}/*`) |
| AC-9 card shows net + breakdown + counts + window | ✅ | screenshot `sectorapp.png`: "−$8.3M NET SELLING · Buys $2.6M · Sells $10.9M · 40 transactions · 22 filers · 1 with no reported price excluded · last 90 days" |
| AC-10 no-data sector → N/A state, never $0/NaN | ✅ | screenshot `sectorapp-insider-na.png`: "No insider data for this sector yet … Shown as N/A, not zero." |
| AC-11 theme-aware, CSP-safe, matches STYLE_GUIDE | ✅ | card reuses `.pa-card` shell + mono tokens; e2e is CSP-strict and passed errors=0 for both insider shots (a CSP/asset violation fails the check) |
| AC-12/13 derived-rollup + reporting-lag + coverage + P/S-only; **no** 13F caveat | ✅ | live caveat scan: all 4 correct caveats present; banned 13F/long-only/45-day/snapshot language = **NONE**; `derived true` |
| AC-14 no individual insider named | ✅ | card renders only sector aggregate (net/buys/sells/counts); no owner field surfaced |
| AC-15 pytest green (incl. existing insider tests) + e2e green | ✅ | **530 passed**; all 6 insider-flow tests **ran** (not skipped); insider e2e shots errors=0 |
| AC-16 SEC compliance untouched; no live SEC on request path | ✅ | endpoint returns **HTTP 200 with SEC unreachable** (offline sandbox) → confirms materialized-store read only; no throttle/User-Agent change in diff |

## Review questionnaire

1. **What shipped** — The Sector view's "Insider flow" card is now real: for the selected SIC
   sector it shows a trailing-90-day **open-market** net buy/sell (e.g. "−$8.3M · NET SELLING"),
   the buys-vs-sells split, transaction/filer counts, and the window — or an honest "No insider
   data … N/A, not zero" when the sector has none. The number is uncolored; direction is a word.

2. **Surfaces touched** — New `GET /v1/sectors/{group}/insider-flow`; the Sector view's Insider-flow
   card in `sectorapp.js` (+ CSS); a new offline batch `analytical/sector_insider_flow.py` and its
   `sector_insider_flow` store; the insider parser/schema/cache gained a `transaction_code` field.

3. **AC → evidence** — see the table above; every AC maps to a named test, a live response, or a
   named screenshot.

4. **States exercised** — **Populated**: drove groups 35 (net buying +$12.4M), 73 (net selling
   −$8.3M, the default-sector screenshot), 60 (net **0** with data → distinct from N/A). **Empty/
   N/A**: group 28 (seeded empty) live + `sectorapp-insider-na.png`; group 99 (nonexistent) live.
   **Loading/error**: the fetch caches an honest empty on failure (code path + `_error` marker);
   render check passed with no bare undefined/NaN.

5. **Edge cases probed** — **N/A vs 0**: unseeded sector → `null`/N/A card (not $0); a real net of
   **0 with data** (group 60) correctly reads "$0 · NET FLAT", *distinct* from N/A — the honest
   boundary. **Missing price**: excluded from sums, surfaced as `excluded_no_price_count`
   (live: 1–2). **Grants/exercises/gifts/tax** (M/A/G/F): excluded from the net (batch test).
   **Upstream-SEC**: endpoint is offline-only (no SEC on the path) — returns 200 with SEC
   unreachable, so no 502/503 path applies to it (correct by design). **Not applicable**:
   restatements / multi-class / PRN / option 13F rows (this is Forms 3/4/5 aggregation, not 13F);
   429 (unauthenticated public route, same as sibling sector endpoints).

6. **Honesty contract** — Caveats present (4/4, correct). Derived labeled (`derived: true` + "Derived
   rollup" in the card foot + "DERIVED aggregate" caveat). **No missing value shown as 0** (N/A card
   verified; net=0-with-data kept distinct). **No 13F derived-trade language** (long-only/45-day/
   snapshot scan = clean) — correct, since Forms 3/4/5 are reported transactions. No fabricated
   precision; the Geographic-mix placeholder beside it stays a dashed honest placeholder (P6b).

7. **Deltas from the brief** — None material. Window fixed at 90 days (the brief's recommendation;
   configurable via `secfin_insider_flow_window_days` + `--window-days`). Everything automatable was
   verified by test + live drive; the *felt* interaction (sector switch recomputing the card, hover
   caveats, theme) is the operator hands-on step below.

8. **Residual risk** — Lowest-worry: the math/caveats (tested + driven). What a human should confirm:
   that switching sectors in the live app swaps the card between populated ↔ N/A cleanly, the net
   figure stays legible/uncolored in **dark** theme, and the caveat hover reads correctly. Coverage
   caveat (D-4): on the real prod volume, sectors may read N/A until the insider cache is re-warmed
   with the new `transaction_code` parser — that's the honest, correct state, not a bug.

## UI/UX review

- **States** all render intentionally: populated (signature net figure), N/A (explicit "No insider
  data … not zero"), loading (spinner), error (honest empty). The net=0-with-data case is kept
  distinct from N/A — a subtle but correct honesty call.
- **Legibility/layout**: card fits the narrow (2fr) right column of the geo/insider row; no overflow
  or clipping in the screenshots; the row collapses to one column at mobile width (existing
  `.pa-geo-row` breakpoint).
- **Copy**: sentence case, plain, direction as a word ("NET SELLING"), not a verdict; empty copy
  gives direction ("Shown as N/A, not zero"), no alpha/timing/price over-claiming.
- **Consistency**: reuses `.pa-card` + the mono/token vocabulary and the 27px mono figure size that
  echoes the scorecard tile score; value-neutral color honors the no-favorability rule (the F4 color
  stays the scorecard-chip exception). The real card is solid vs the dashed geo placeholder — an
  honest visual distinction.

## Defects

None.

### Pre-existing, unrelated e2e failure (NOT a blocker, NOT this change)

The overall `HEADLESS CHECK` exits **FAIL** in this sandbox, but **only** on `sectorapp-company`
(errors=8) and `sectorapp-company-refocus` (errors=14) — the Company-view shots for the **synthetic**
filer `?symbol=900001`. Every other shot, including both insider shots and the real-filer company
shots (`sectorapp-company-default`, `sectorapp-company-trend` @ 320193), is **errors=0**.

- **Root cause**: the company-view **sparkline** fetches `/v1/companies/900001/metrics/net_margin/
  history` (pre-existing code, `sectorapp.js:1260`, **not in this branch's diff**). For a synthetic
  filer with no seedable history it misses the cache and falls through to SEC, which is **unreachable
  in this no-network sandbox → 502** (a graceful 404 with network). Confirmed by direct curl:
  `/v1/companies/900001/metrics/net_margin/history` → 502 while `/v1/sectors/35/insider-flow` → 200.
- **Why it's not this change**: `git diff master -- static/` never touches the history-fetch path; a
  frontend change cannot make a backend endpoint 502; it reproduces deterministically and is a
  network/fixture condition that predates this branch. QA should re-run the e2e in a **networked**
  environment, where these company shots return to green.

## Manual UI verification

Run against a seeded local app (`docker compose --profile e2e up -d e2e-app`, then open
`http://localhost:8000/sectors` — or `docker compose up api` on a real volume). Numbered script:

1. Open `/sectors` (default sector). **Expect**: the "Insider flow" card (right of "Geographic
   revenue mix") shows a **signed net** figure (e.g. "−$8.3M") with a direction word (NET SELLING),
   "Buys … · Sells …", "N transactions · M filers", and hint "Forms 3/4/5 · last 90 days". (AC-9)
2. Confirm the net figure is **not** colored green/red — direction is the word only. (AC-11/honesty)
3. Read the card foot: "Derived rollup · reporting lag · open-market P/S only"; **hover** it → the
   full 4-caveat list appears; none mention 13F / long-only / 45-day / snapshot. (AC-12/13)
4. Switch the sector dropdown to **Chemicals & Allied Products** (group 28). **Expect**: the card
   swaps to "No insider data for this sector yet … Shown as N/A, not zero." — **no $0, no NaN**. (AC-10)
5. Switch to a sector with data and back; confirm the card recomputes cleanly each time (no stale
   figure, no flML flash of the wrong sector). (interaction)
6. Toggle **dark theme** (OS/browser prefers-color-scheme). **Expect**: net figure + labels legible;
   card border/tokens adapt; no hard-coded light-only color. (AC-11)
7. Narrow the window to mobile width. **Expect**: the geo/insider row stacks to one column; the card
   doesn't overflow or clip; the net figure stays readable. (layout)

Until the operator runs this and signs off (`4b-manual-verification.md`), the verdict stays
**PASS — pending manual UI verification**.

## Handoff

**PASS — pending operator manual UI verification.** No defects. Ready to deploy **after** the
operator completes `4b-manual-verification.md` (interactive change → hands-on required). The overall
e2e FAIL is the documented pre-existing company-view network artifact, not this change — re-run in a
networked env to confirm green there. Pointer for the operator: `docs/delivery/sector-insider-flow/
4b-manual-verification.md`.
