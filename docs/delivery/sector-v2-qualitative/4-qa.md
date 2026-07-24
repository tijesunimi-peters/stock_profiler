# P4 — Qualitative view v2 (placeholder expansion) · QA report

**Stage:** 4 — QA Tester
**Branch:** `sector-v2-qualitative` (stacked on `sector-v2-compare`; not committed)
**Verdict:** ✅ **PASS — accepted at the QA-tester level** (placeholder/layout view; see manual
section). No operator hands-on gate required per the roadmap; ready to deploy on operator's call.
**Change class:** frontend-only, honest Track-2 **placeholder**. The interactions added are
wired-but-empty (they only toggle placeholder panels); no data flow, endpoint, or real logic — so
per the operator policy (2026-07-22) this qualifies for QA-tester-level acceptance. I still drove
every interaction by hand-equivalent script (below).

## Acceptance criteria — pass/fail with evidence

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1** honesty frame intact | ✅ | `qa-qual-drive`: `.pa-qual-banner` present, "TRACK 2 · NOT YET DERIVED FROM FILINGS" flag + "structured … free-text narrative … Nothing here is fabricated" copy; foot regex `derived from filings or estimated` matched. Screenshot `sectorapp-qual.png`. |
| **AC-2** no fabricated data anywhere (load-bearing) | ✅ | Scripted audit of `#viewport` **with all 7 rows expanded + all 4 reveals open**: no `%`, no `●/○`, direction chips = `["planned"]` only (no new/rising/fading/stable), zero coverage bars with fill/width/background. `NO-FABRICATION ok`. |
| **AC-3** risk-factor themes | ✅ | 7 `.pa-qual-rtrow[data-qual-theme]` rows, each with an empty dashed bar + `—` + `PLANNED` + a `Filings →` affordance; clicking each opens `.pa-qual-langpanel` → "…no filing text shown". Drove all 7. |
| **AC-4** Disclosure landscape (7 blocks) | ✅ | `.pa-qual-landscape` with exactly 7 `.pa-qual-block`; titles = `["Cybersecurity","Critical Audit Matters","Auditor landscape","Risk-factor volume","Non-GAAP & charges","Late & deficient filings","Human-capital & climate"]`; each has a mono SEC-source line + "to be defined" body, no counts. |
| **AC-5** side panels + matrix | ✅ | 3 `.pa-qual-sidecard` (Emerging/Going-concern/Litigation, "no filers shown") + matrix with 5 `.pa-qual-mcol` headers over an empty body. Screenshot. |
| **AC-6** click-to-reveal filer counts | ✅ | 4 `[data-qual-filer]` controls (matrix + Cyber/Auditor/Late blocks); opening each → `.pa-qual-filerpanel` "…none shown. No tickers are fabricated." Drove all 4. `qa-qual-allopen.png`. |
| **AC-7** "Filings →" inert stub | ✅ | Clicking `.pa-qual-filings` leaves `page.url()` unchanged; no console/page error; no navigation. |
| **AC-8** self-contained + no favorability color (light-only app) | ✅ | No external requests (e2e CSP-clean, `errors=0`). App is **light-only by design** (`prefers-color-scheme` count = 0 in `style.css`) — the "theme-aware" bar reduces to "tokens, no hard-coded colors": `git diff` of the CSS additions has **no** hex/rgb/named colors outside `var(--…)`; no favorability/good-bad class. |
| **AC-9** no regressions | ✅ | `pytest` **511 passed, 6 skipped** (matches P2/P3 baseline). Full e2e: **every page `errors=0` except the pre-existing Company-502** (`sectorapp-company`/`-refocus`, symbol=900001) — Sector/Compare/Qualitative + all non-app pages `errors=0`. |
| **AC-10** interactions don't leak fabrication | ✅ | Each of the 7 rows toggled open→closed (single-open, idempotent); reveals toggled; audit ran with everything open and found no data. `QA DRIVE: PASS`. |

**Automated evidence commands**
- `docker compose --profile test run --rm test` → `511 passed, 6 skipped`.
- `docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e` → `sectorapp-qual
  errors=0`; only Company-502 baseline nonzero (documented).
- Custom QA drive (`scratchpad/qa_qual_drive.js`, puppeteer image vs seeded e2e-app) → `STRUCTURE
  ok` / `INTERACTIONS ok: expanded 7 rows + opened 4 reveals, all empty states` / `NO-FABRICATION
  ok` / `PAGE/CONSOLE ok` / `QA DRIVE: PASS`.

## Review questionnaire

1. **What shipped** — The Qualitative view of the Sector Analytics app, previously a thin "Track 2"
   banner, now shows the *full intended shape* of narrative-disclosure coverage as honest
   placeholders: risk-factor theme rows you can click to expand (revealing an empty "language will
   go here" panel), a new 7-block **Disclosure landscape** (cyber, CAMs, auditor, risk-volume,
   non-GAAP, late/deficient, human-capital) each citing the SEC section it will source from, side
   panels, a per-filer matrix, and "reveal the filers" controls that open honest "none shown"
   panels. A user comes away knowing exactly what's planned and that nothing is fabricated.
2. **Surfaces touched** — one page/view: `/sector-analytics` → Qualitative view. Files:
   `static/sectorapp.js` (`renderQualView` rewrite, new `wireQualView`, `QUAL_DISCLOSURE`,
   `qualReveal`, 2 state fields), `static/sectorapp.css` (`pa-qual-*` additions),
   `scripts/headless_check.js` (strengthened the qual e2e step). No API/Python surface.
3. **AC → evidence** — see the table above; every AC has a driven interaction or a named screenshot.
4. **States exercised** — *Populated* placeholder layout (the whole view, its natural state);
   *expanded* representative-language panel (drove all 7 rows); *revealed* filer panels (drove all
   4). There is no loading/error/empty-data state here — the view holds **no** data by design, so
   its single honest state is the placeholder itself. Confirmed the collapsed↔expanded toggles are
   idempotent (AC-10).
5. **Edge cases probed** — the product-specific risk here is **fabrication**, not N/A-vs-0 (there are
   no numbers to render): audited the viewport with everything open for `%`, `●/○`, fabricated
   direction chips, and filled coverage bars — **none**. N/A/N/M/429/502/restatement/13F paths are
   not reachable from this view (no data fetch); the app-wide 429/502 handling is unchanged (no
   backend touched). The one live 502 in the run is the **pre-existing Company-view baseline**, not
   this view.
6. **Honesty contract** — caveats present (banner + per-card "to be defined" tags + closing "Nothing
   … derived … or estimated."); **nothing is labeled as derived because nothing is derived** —
   every cell is an explicit placeholder; no missing value rendered as `0` (there are no values); no
   ticker/count/excerpt fabricated even inside expanded panels ("No tickers are fabricated." stated
   in the reveal copy and verified true); no over-claiming/alpha/timing/price language. `Filings →`
   does not pretend to work (inert, no error).
7. **Deltas from the brief** — none material. AC-8's "dark theme" clause is moot: this app has **no**
   dark theme (light-only design system), so I verified the equivalent — token-only, no hard-coded
   colors — which is what the brief actually intends ("theme-aware … token-driven"). All ACs were
   verifiable by automation/scripted driving; nothing left unverified.
8. **Residual risk** — very low. This view has no data path and no destructive action. The only
   thing a human might weigh is subjective: does the fuller placeholder *feel* honest rather than
   like a tease of unshipped features? The copy is explicit and repeated, and the screenshots read
   as "mapped-out roadmap," so I judge it fine. Worst case if wrong: a user mistakes a placeholder
   for real data — mitigated by every cell reading `—`/`planned`/`to be defined`/`none shown`.

## UI/UX review

- **States**: the placeholder *is* the state and it renders intentionally — dashed "blueprint"
  cards, muted mono labels; every empty region says what it will hold and that nothing is shown.
- **Legibility & layout**: with all reveals + a row open (`qa-qual-allopen.png` / `sectorapp-qual.png`)
  nothing clips or overflows; the 7-block landscape grid wraps cleanly; the reveal panels wrap
  inside their cards; matrix headers align. Mobile grid rules collapse the cols to one column.
- **Copy**: sentence case, active voice, consistent vocabulary ("to be defined", "none shown",
  "planned"); the reveal/language copy gives direction, not mood; no over-claiming.
- **Affordances & a11y**: rows are `role="button"` `tabindex="0"` with Enter/Space handlers and a
  `focus-visible` ring; reveal controls carry `aria-expanded` + a rotating caret; the `Filings →`
  affordance is visually secondary (muted, dashed underline) so it doesn't imply it works.
- **Consistency**: reuses the existing `pa-qual-*` idiom and the app's tokens; matches the "paper
  terminal" language and the honesty vocabulary of the shipped views. No favorability color.

## Manual UI verification

**Classification: pure placeholder/layout with wired-but-empty toggles → accepted at the
QA-tester level** (the scripted driving pass + eyeballed screenshots below stand in for the operator
hands-on step, per the 2026-07-22 policy for non-logic changes). The operator MAY still run this in
a few minutes if they want eyes on it; it is **not** a blocking gate for this view.

Script (open `/sector-analytics`):
1. Click **Qualitative** in the view rail → the banner "TRACK 2 · NOT YET DERIVED FROM FILINGS"
   renders with the structured-only / "Nothing here is fabricated" copy. *(AC-1)*
2. Click a **risk-factor theme row** (e.g. "Profitability & returns") → an inline panel opens reading
   "Representative language will appear here … to be defined · no filing text shown". Click again →
   it closes. *(AC-3/AC-10)*
3. Click **"Filings →"** on any row → nothing happens (no navigation, no error). *(AC-7)*
4. Scroll to **Disclosure landscape** → confirm 7 blocks, each with a title, a SEC-source line, and a
   "to be defined" body; no numbers/%/dots. *(AC-4)*
5. Click **"Reveal the filers"** on Cybersecurity (and the matrix's "Reveal the filers behind these
   signals") → a panel opens reading "…none shown. No tickers are fabricated." — never a ticker.
   *(AC-6)*
6. Scan the whole view → no figure, %, ●, direction word, ticker, or excerpt anywhere; closing line
   "Nothing on this view is derived from filings or estimated." *(AC-2)*

**Operator outcome:** ✅ **Confirmed (2026-07-24)** — operator hand-ran the full questionnaire
interactively (13/13 rows ✅); see `4b-manual-verification.md`. The one observation (empty far-right
sidebar) was confirmed **by design** (Qualitative has no right rail per the v2 prototype), not a defect.

## Defects

- **None from this change.**
- **Pre-existing (not P4):** `sectorapp-company` / `sectorapp-company-refocus` (Company view,
  `symbol=900001`) throw **502 Bad Gateway** in the e2e sandbox (cache-miss → SEC unreachable),
  keeping the overall e2e exit non-zero. Documented in `docs/delivery/sector-v2-compare/4-qa.md`
  (AC-9, "reproduced on clean base, out of P3 scope"). My diff touches no Company code; the qual
  page is `errors=0`. **Do not read the raw e2e exit code as a P4 defect.** (Separately worth the
  operator's attention for the Company view, but out of scope here.)

## Handoff

✅ **PASS — accepted at the QA-tester level.** `pytest` 511 passed / 6 skipped; e2e Qualitative +
all Sector/Compare pages `errors=0`; scripted end-to-end drive of every interaction confirms honest
empty states and **no fabricated data** anywhere. Frontend-only, no backend/route/data change.
**Ready to deploy on the operator's call** (branch not yet committed; commit + deploy remain
operator-gated). Next roadmap step is **P5 — Filings view** (which will wire the currently-inert
`Filings →` stubs).
