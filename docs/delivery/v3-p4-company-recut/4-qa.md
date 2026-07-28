# 4 — QA report: V3-P4, Company re-cut (Overview + Financial history)

**Branch:** `v3-p4-company-recut` · **Stage 4 (QA Tester)** · 2026-07-27
**Verdict: PASS — pending operator re-verification** (interactive change → hands-on gate is blocking)
**QA cycles: 4** — four operator hands-on rounds; 18 fidelity items in total, all fixed and re-verified below. Cycles 3–4 were **operator-approved scope additions** (the comparison tray and the right rail), not repeat failures of the same defect.

Tested by **exercising the running feature** against the **live API with real data** (not the
synthetic e2e fixture), plus the fixture-based headless suite. 74 driven assertions across three
scripted browser sessions, every screenshot eyeballed.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| 1 rail reads Overview · Financial history · Insider · Institutional · 13D/G | ✅ | driven: rail DOM = `[[hub,Overview],[history,Financial history],[insider,Insider],[institutional,Institutional],[beneficial,13D/G]]`. No "Fundamentals"/"Statements" label anywhere |
| 2 `/company/AAPL` → Overview, URL normalizes | ✅ | driven: active view `hub`, URL becomes `/company/AAPL/hub` |
| 3 every legacy URL lands correctly | ✅ | driven **14 URLs individually**: `/hub`,`/history`,`/fundamentals`→hub,`/statements`→**history**,`?tab=fundamentals`→hub,`?tab=statements`→history,`/nonsense`→hub,`/insider`,`/institutional`,`/beneficial`, and `?stmt=income|balance|cashflow|segments`→history with that statement selected |
| 4 Back/Forward walk views | ✅ | driven: hub→history→insider, back=history, back=hub, forward=history |
| 5 Insider/Institutional/13D-G untouched | ✅ | driven: all three render (5807 / 4002 / 407 chars); renderers not modified |
| 6 identity fields all resolve, none blank | ✅ | AAPL `[Registrant=Apple Inc., CIK=320193, SIC=3571 · Electronic Computers, FYE=Sep 27, Earliest=FY2009 Q3, Periods=68]`; **AAR CORP shows only 4 fields** — the two it can't resolve are omitted, not blank (`emptyRp=0`) |
| 7 EX-21 placeholder: zero data rows, nothing fabricated | ✅ | driven: `anyRowNodes=0`, `hasPercent=false`, `hasJurisdictionWords=false`. Only digits in the block are from the strings "EX-21" and "10-K" — form names, not data |
| 8 condensed tabs, 4 columns, N/A never 0 | ✅ | driven AAPL: tabs `[income,balance,cashflow]`, `cols=4`, `naCells=5`, **`zeroCells=0`**; tab switch re-renders (35 rows). JPM screenshot shows real FY2022–FY2025 columns |
| 9 one merged snapshot surface | ✅ | driven: `tiles=30`, `.glance-tile`=0, `.metric-card`=0 — both old surfaces gone. Tile count **equals the API's own metric count (30)** |
| 10 every tile has status + basis; drained never 0 | ✅ | driven: 0 tiles missing status/basis; every drained tile reads `N/A`/`N/M` |
| 11 drawer opens with chart + how-it's-computed | ✅ | driven: drawer `dt`s = `[Formula, Basis, Restatement, As of]`, chart SVG present, `aria-expanded="true"` |
| 12 peer position + honesty note | ✅ | driven: 7 peer bars (`98th pctile · 169 peers`), both notes present ("not a good/bad verdict", "direction … not favorability") |
| 13 compare action deep-links | ✅ | driven: opened `gross_margin` tile → clicked compare → view=`history`, `gross_margin` selected |
| 14 "On this page" lists snapshot groups | ✅ | driven: 6 links matching the 6 groups |
| 15 30 metrics in 6 groups; 4th refused visibly | ✅ | driven: `chips=30 groups=6`; selecting a 4th leaves legend at 3 **and** flags the footer ("maximum") — not silent |
| 16 legend: latest value + working remove | ✅ | driven: 3 entries with `["12.8%","$129.2B","27.2%"]`; remove → 2 |
| 17 range tabs re-render | ✅ | driven all three: 8q/20q/5y each become active and redraw an SVG |
| 18 line breaks at gaps; "N of M disclosed" | ✅ | driven: caption `20 of 20 period-values disclosed`; on a gap-bearing series `3 of 5 … — a break in a line is a period with no computable value, not a zero` (see `/components` shot) |
| 19 mixed-units warning | ✅ | driven: overlaying `fcf` (USD) + `net_margin` (ratio) → "Mixed units (ratio, USD) share one axis — read shape, not level." Same-unit overlays show none |
| **20 statement surface moved INTACT** | ✅ | **driven piece by piece:** table (21 rows) · filing-provenance header · source-tag audit column (21 tag rows, 21 badges, normal table hides) · raw-JSON toggle (valid JSON) · exact-value reveal (`$416.2B`→`$416,161,000,000`) · income 21 / balance 34 / cashflow 14 rows · segments spike |
| 21 authored at container width, no clipping | ✅ | driven: `svg width=820` vs `container=820`; no horizontal page bleed (`scrollWidth==clientWidth`) |
| 22 **no basis toggle**; basis stated | ✅ | driven: no control labelled "As filed"/"As restated" anywhere; footer states as-restated + why an as-filed series isn't servable |
| 23 no missing value rendered as 0 | ✅ | swept `.mtile-value`,`.cond-amt`,`.hist-latest` on hub+history for AAPL, **AAR CORP and JPM** → **zero** bare `0`/`$0` |
| 24 derived figures reach provenance | ✅ | every tile's drawer carries formula/basis/restatement/as-of + reason; **all 30 tile values matched the API's own status/value** |
| 25 disclosures on both views | ✅ | both views carry `financials_floor` + `not_advice` (2 `<li>` each) |
| 26 no prototype number anywhere | ✅ | every rendered tile value traced to `/metrics`; no hardcoded figures in the new renderers |
| 27 pytest | ✅ | **572 passed, 9 skipped, 0 failed** |
| 28 e2e no worse than baseline | ✅ | **42 shots (37+5), 0 threw, exactly 2 with errors** — the same pre-existing `sectorapp-company` (8) / `-refocus` (13–14). Baseline: `0-e2e-baseline.md` |
| 29 new shots per view | ✅ | `company-hub`, `company-history`, `company-history-range`, `company-legacy-fundamentals`, `company-legacy-tab` |
| 30 no console errors | ✅ | zero across the full drive (the only 404 logged was my deliberate unknown-ticker probe) |

**30/30 pass.**

### Two initial "failures" that were my own bad assertions, not defects

Recorded because they're the kind of thing that gets mistaken for a bug:

1. **AC-7 "digits present in the EX-21 block."** The digits were `21` and `10` — from the strings
   "EX-21" and "10-K". Re-checked structurally: zero row nodes, no `%`, no jurisdiction names.
2. **AC-25 "no disclosures."** I read `innerText` of a **collapsed** `<details>`, which excludes the
   body. Both items are present on both views.
3. **"JPM renders 0 tiles."** A timing artifact — JPM's tiles appear at **2204ms**, my probe
   measured at 1600ms. With a proper wait: 30 tiles, 12 drained, 0 zeros.

---

## Review questionnaire

**1. What shipped.** `/company/{symbol}` is re-cut from two data-type tabs into two time-horizon
views. **Overview** answers "how is this company doing now" — who the registrant is, a condensed
four-year statement, and every computed metric as a clickable tile that opens its own arithmetic.
**Financial history** answers "how has this moved" — pick any metric, overlay up to three, switch
range, with the full statement tables underneath.

**2. Surfaces touched.** New: `GET /companies/{symbol}/profile`, `GET
/companies/{symbol}/statements/{statement}/condensed`. Views `hub` + `history` replacing
`fundamentals` + `statements`. New shared builders `ClearyFi.metricTile` and
`ClearyFi.metricSeriesChart`. `shell.js` view list + alias map; `/components` gained both builders
and the Plot script it had always been missing.

**3. AC → evidence.** Table above; every row is a driven interaction, a response body, or a named
screenshot. No AC was accepted on inspection alone.

**4. States exercised.** *Loading* — watched JPM's tile grid resolve at 2.2s and the drawer's
"Loading history" before its chart. *Populated* — AAPL, JPM, AAR CORP. *Empty* — AAR CORP has no
sparkline on any tile (too few trend points) and renders none rather than a flat line; the
`/components` series demo renders the empty case. *Error* — `/company/ZZZZNOPE/hub` gives the
honest 404 recovery state ("We don't carry ZZZZNOPE… Try AAPL / Data coverage"), not a crash.

**5. Edge cases probed.** **N/A vs N/M vs 0** — JPM (a bank) has 12 structurally-drained tiles
showing both `N/A` and `N/M`, and zero of them render as 0; AAPL's condensed income statement has 5
genuine `N/A` cells (Apple stopped breaking out `interest_expense` after FY2023) and 0 zeros.
**Restatements** — every series is one labelled as-restated basis, stated in the footer; latest-filed
wins as before. **Thin company** — AAR CORP: 30 tiles, no sparklines, identity card drops the two
fields it can't resolve rather than blanking them. **Unknown ticker** → 404 recovery state. **429**
— hit our own limiter while scripting curl checks; it returns 429 rather than failing open (the UI
path uses the same-origin header). 13F/multi-class rows are P5's views, untouched here.

**6. Honesty contract.** Caveats on both views. Every tile carries a status glyph + basis, and its
drawer the formula, basis, restatement basis, as-of, and the reason for any flag. **No missing value
renders as 0 anywhere** — checked across three companies. The EX-21 block states plainly that it is
an untagged exhibit and contains not one fabricated entity, jurisdiction or percentage. **No
as-filed/as-restated toggle exists**; the basis is stated with an explanation of why the alternative
isn't offered. Movement arrows are explicitly labelled direction, not favorability. Peer bars carry
the "position, not a verdict" note.

**7. Deltas from the brief.** None material. Two operator decisions taken mid-build are reflected:
`balanceMatrix` is not used in the condensed card (all three tabs are the prototype's table), and
the metric grid merged into the snapshot rather than staying a separate card grid. One scope
addition the architect found: four metrics (`equity_multiplier`, `dio`, `dpo`, `ccc`) that the API
has always computed but the page never rendered are now visible. Everything was verifiable by
automation; nothing is deferred to the manual pass for lack of evidence — the manual pass is for
*felt* behaviour.

**8. Residual risk.** The riskiest thing here is what a human will notice and a script won't:
whether the merged snapshot **reads** better than the card grid it replaced, and whether the open
tile taking the whole row feels right or jarring. Second, `?trend=<metric>` moved from opening a
card panel to opening a tile drawer — behaviourally equivalent, but worth one hands-on click.
Third: the alias map is a single point of failure for every indexed `/statements` URL; it is covered
by a driven e2e assertion that will fail loudly if it regresses, which is the protection I'd want.

---

## UI/UX review

**Good.** Section numbering (01/02) encodes the reading order the section rail navigates, so it
carries information rather than decorating. The tile grid gives a genuine 5-second read that the
28-card grid never did. Drained tiles stay visible and labelled instead of disappearing. The
statement surface arrived intact, with its audit column and raw-JSON affordances — the trust
features survived the move. Copy is active-voice and names what the reader controls ("click to
overlay, up to three"; "Open in Financial history").

**Six defects I found by eyeballing screenshots — all fixed before this report**, and every one was
green on the exit code:
1. Unfilled trailing grid cells rendered as large beige blocks that read as broken tiles.
2. Y-axis ticks clipped/unformatted (`00000000 −`) whenever overlaid series had different units.
3. The disclosed-period count was stated twice (caption + footer).
4. An open drawer stretched its row-mates into tall empty columns and squeezed its own chart.
5. The drawer chart ignored its container width (a §12.6 violation in the new code).
6. `/components` never loaded Plot, so every Plot builder silently rendered "no data" there.

**Accessibility.** Tiles are real `<button>`s with `aria-expanded` that toggles, visible
`:focus-visible` outlines, and the remove control carries an `aria-label` naming its series.

**Theme.** The product ships a single light theme by design (no `prefers-color-scheme` anywhere in
the CSS), so there is no dark pass to run. All new styles are token-driven.

**Nit, not a defect.** The N/A tile reserves its sparkline slot, leaving a small gap. That is
deliberate — it keeps tile baselines aligned across a row.

---

## Manual UI verification

**Classification: interactive / logic change → operator hands-on is REQUIRED and blocking.** This
adds new controls (tiles, drawer, metric picker, range tabs), changes routing, and moves a whole
surface between views.

Open **http://localhost:8000/company/AAPL** (the `api` container is running; `docker compose up -d
api` if not).

1. Land on `/company/AAPL` → Overview renders; URL becomes `/company/AAPL/hub`.
2. Read §01 → registrant name, CIK, SIC, fiscal year-end all populated; **no blank or `—` field**.
3. Read the Consolidated subsidiaries block → column heads present, **no data rows**, and copy
   explaining EX-21 is an untagged exhibit.
4. Condensed statements → click **Balance**, then **Cash flow** → each re-renders with four FY
   columns; any `N/A` cell is grey text, **never `0`**.
5. Scroll to Financial snapshot → click any tile → it expands to the full row and shows the
   formula/basis/restatement + a chart. Click again → collapses.
6. Find **Interest Coverage** (or any drained tile) → reads `N/A` with a `∅` glyph, not `0`.
7. In an open drawer click **Open in Financial history →** → lands on Financial history with that
   metric already selected.
8. In the picker click two more metrics → all three overlay, legend shows three with latest values.
   Click a **fourth** → refused, and the footer flags the maximum.
9. Click a legend **×** → that series disappears, others remain.
10. Click **8 quarters**, then **5 fiscal years** → chart redraws each time; axis labels legible.
11. Read the footer → states the basis is as-restated. **Confirm there is no As-filed/As-restated
    toggle anywhere.**
12. Scroll down → the full statement table; click **Show your work** → source tags with US-GAAP/EXT
    badges; click **View raw JSON** → valid JSON; click a value → exact figure.
13. Visit `/company/AAPL/statements` (the old URL) → lands on **Financial history**.
14. Visit `/company/AAPL?tab=fundamentals` → lands on **Overview**.
15. Use browser **Back** twice, then **Forward** → views follow correctly.
16. Visit `/company/JPM/hub` → many tiles read N/A or N/M (a bank); confirm **none reads 0**.
17. Visit `/company/ZZZZNOPE` → honest not-found with recovery links.
18. Tab through the snapshot → focus outlines visible on tiles; Enter opens a drawer.

**Operator outcome:** _pending_ — see `4b-manual-verification.md`.

---

## Defects

**None open.** Six found during implementation by eyeballing screenshots (listed above), all fixed
and re-verified.

**Pre-existing, not this change** (present identically on `master`):
- `sectorapp-company` / `sectorapp-company-refocus` console errors — CIK-900001 502s on the
  synthetic fixture. Count drifts run to run (8 / 13–14).
- The Institutional "similar portfolios" graph has colliding node labels — V3-P5 owns that view.

---

## Handoff

**Verdict: PASS — pending operator manual UI verification.** 30/30 acceptance criteria verified by
driving the running feature; `pytest` 572 green; e2e 42 shots with no new failure against the
recorded `master` baseline.

**Not ready to deploy yet** — this is an interactive change, so the operator hands-on gate is
blocking. Run **`4b-manual-verification.md`**. On a confirmed sign-off this unlocks a *deploy
request* (DevOps is a separate, operator-gated stage) — it is not itself a deployment.


---

# QA cycle 1 — operator hands-on findings (2026-07-27)

The operator ran `4b-manual-verification.md`. **Batches 2 and 4 passed as written** (the honesty
core — N/A never 0, tile drawers, condensed tabs; and the statement surface + routing + edges).
**Batches 1 and 3 failed on prototype fidelity** — 13 items. All were design-fidelity gaps, not
data or honesty defects: nothing rendered a wrong number, and no criterion in the honesty set
regressed.

Four items were ambiguous, so they were put back to the operator rather than guessed at (the
V3-P1 lesson). Their answers are recorded in `_active.md` and drove the fixes below.

| # | Operator finding | Fix | Verified |
|---|---|---|---|
| 1 | Masthead not the prototype's | Title + mono subtitle beneath + right-hand mono meta + single rule (`:76-83`) | `.co-mast-sub` present, right meta reads `AAPL · Electronic Computers · CIK 320193` |
| 2 | `sector › ticker` header missing | Breadcrumb `sector › Company Name [TICKER]` over a 2px rule on both views (`:801-812`) | `Electronic Computers › Apple Inc. AAPL` |
| 3 | Period dropdown is leftover chrome | Retired from both company views | `#controls` hidden |
| 4 | Status-legend strip is leftover | Retired (the prototype explains status per value) | `#legend` empty |
| 5 | Statement-type pill row is leftover | Retired from the page bar; tabs moved **into** the statement card (`:889-895`) | 4 in-card tabs, top strip hidden |
| 6 | Financial history period dropdown | Moved into the statement card's own header | `#stmt-period-select` inside the card |
| 7 | Condensed tabs unlike the prototype | Separate rounded `.pbtn` buttons with a gap, not a joined pill group | 3 `.cond-tabs .pbtn` |
| 8 | Statement rows missing charts | Each row with ≥2 reported values opens its own trend, drawn from the values **already in the row** — no extra request, so the chart cannot disagree with the numbers above it | 22 chartable rows; row opens an SVG, `aria-expanded=true` |
| 9 | EX-21 section not the prototype's | Ported the fuller layout — eyebrow counts + closing note — with **dashes** where the prototype shows figures, since EX-21 is untagged and a count would be fabricated | `EX-21 · — entities · — organized outside the U.S.` |
| 10 | Percentile should be a number | Position bar removed; percentile rendered as text | 0 `.pos-bar`, reads `98th pctile · 169 peers` |
| 11 | Metric graph x-axis clipped | `marginBottom` 40→64, tick count scaled to width (~1 per 78px), rotation −40° | 0 tick labels outside the SVG box, explorer **and** tile drawer |
| 12 | Collapsed trend should be shaded | Sparkline gained an area fill (`--accent-wash`, prototype `microSpark`). Shading is **per segment**, so a gap stays a hole — a continuous fill would re-assert the continuity the broken line denies | 26 shaded sparklines |
| 13 | "On this page" not the prototype's pattern | Moved into the **view rail** as numbered "Sections" with a left-edge active marker (`:247-257`) | `01 Profitability … 06 Per-share` in the rail |

**Plus one defect I found while re-verifying:** the entity bar's "Last filed" rendered `—` on
Overview, because it only resolved when a full statement loaded (which Overview never does). The
condensed response already names the filing behind its newest column — now used. Reads
`10-K · 2025-10-31`.

### Cycle-1 re-verification

| Check | Result |
|---|---|
| Targeted fidelity drive (19 assertions over all 13 items) | **19/19 pass** |
| Full acceptance drive re-run | all ACs still pass |
| `pytest` | **572 passed, 9 skipped** |
| e2e | **42 shots, 0 threw, 2 with errors** — the same pre-existing pair |
| Screenshots re-eyeballed | `qa2-hub.png`, `qa2-history.png`, `qa2-drawer.png` |

**Three stale assertions in my own drive script**, not defects — recorded so they aren't
re-investigated: AC-7's "digits" are from the strings "EX-21"/"10-K"; AC-25 read `innerText` of a
**collapsed** `<details>`; AC-14 still queried the old sidebar selector after the Sections nav
moved to the rail (the cycle-1 script confirms all 6 numbered entries render).

**Nothing in the honesty set regressed:** N/A still never renders as 0 (AAPL, JPM, AAR CORP), the
EX-21 block still carries zero fabricated cells, and there is still no basis toggle.


---

# QA cycle 2 — operator round-2 findings (2026-07-27)

Round 2 confirmed R1–R4 fixed. Three further fidelity items, plus one defect I found while
re-verifying them.

### ⚠️ Scope gate fired on one item — flagged, not built

The operator asked for the prototype's **"What the company does · 10-K Item 1"** card. **Item 1
(Business) is narrative free text**, which is Track 2 — `CLAUDE.md` guardrail 1 says flag it, don't
build it. Making it real needs an LLM summarization path with a recurring per-token cost, and that
is a deliberate operator decision, not something this phase can grant by implication.

**So it ships with the prototype's shape and an honest empty state** — the card, its eyebrow, and a
"Read Item 1 on EDGAR ↗" link, with no summary and **no segment mix pills** (those would be
fabricated). Verified: `hasSegmentPills=false`, body is the "Not available" copy, the only digits
present come from the strings "10-K" and "Item 1".

| # | Operator finding | Fix | Verified |
|---|---|---|---|
| 14 | "What the company does" card missing | Added as an **honest Track-2 placeholder** (above) | card present, `Not available`, no invented text or pills |
| 15 | Section source should be on the same line as the title | `secHead()` puts number + title + source in one flex row (`:835-839`) | `01 Identity & structure  cover page · EX-21 · 10-K Item 1` |
| 16 | Tile/drawer should match the prototype: YoY, "+ chart", clickable value; drawer like the prototype's | Tile rebuilt to `:971-977` — the **value** is the affordance (dashed cue) and opens the drawer, `+ chart` is a separate action carrying the metric to Financial history. Drawer rebuilt to `:983-1005` — title · latest · change on the left, range control on the right, chart, notes, then provenance | 30 cued values, 30 `+ chart` buttons, drawer has title/latest/change + 2 range tabs + chart + notes + provenance; range switch redraws |

**One honesty deviation, deliberate and flagged.** The prototype labels the tile's movement figure
**"YoY"**, and it can: its series is 8 quarters, so its comparison point is genuinely four quarters
back. **Ours is not** — `/metrics` returns the *intra-year* quarters of the selected period (≤4
points), so first→last is change across the fiscal year, not year-over-year. Printing "YoY" would
be a false claim about our own data. The **form** matches the prototype (arrow + signed percent);
the **label** states what was actually measured: `↑ +0.8% · 4 quarters`. Verified no "YoY" string
appears in the snapshot.

**Defect I found while re-verifying:** the drawer's *Quarters* range rendered **73 x-axis labels
overlapping into an unreadable smear**. Cause: Plot's `ticks: N` is advisory on a `point` scale and
does not thin the domain. Fixed by handing the axis an explicit, evenly-spaced tick list sized to
~78px separation (`xTicks()`), anchored on the newest period. Now 9 clean labels over 73 points;
nothing clipped at any range, in the drawer or the explorer.

### Cycle-2 re-verification

| Check | Result |
|---|---|
| Cycle-2 targeted drive | all fidelity assertions pass |
| Tick/clipping drive (drawer annual + quarterly, explorer 8q/20q/5y) | **0 clipped labels at every range**; 73 → 9 ticks |
| Honesty re-sweep (AAPL · JPM) | JPM drained tiles read `N/A`/`N/M`, are **not** clickable, carry no `+ chart`, and **no value renders as 0** |
| `pytest` | **572 passed, 9 skipped** |
| e2e | **42 shots, 0 threw, 2 with errors** — the same pre-existing pair |
| Screenshots re-eyeballed | `qa3-hub.png`, `qa4-drawer-quarterly.png` |

**Two more stale assertions in my drive script**, not defects: the biz-card regex was
case-sensitive against CSS-uppercased text, and its "digits" check tripped on "10-K"/"Item 1" —
the same false positive EX-21 produced.


---

# QA cycle 3 — operator round-3 finding (2026-07-27)

Round 3 confirmed the Track-2 placeholder call and the honest movement label. One finding:

> *"The +chart is directing to the financial history page instead of opening a bottom drawer like
> in the prototype"*

### This is a deliberate scope addition, not a missed requirement

The brief **explicitly scoped the comparison tray OUT**: *"Multi-metric overlay is fully reachable
from Financial history's own picker, so the tray adds state complexity without adding capability.
The snapshot tile's compare action deep-links into Financial history instead."* The operator has
now asked for it, which reverses that call — recorded here so the brief and the build don't
silently disagree.

**Built** (prototype `:1653-1677`): `+ chart` no longer navigates. It drops the metric into a
drawer pinned to the bottom of the viewport — "Comparison chart", up to three chips with per-chip
removes, Clear / Hide, an overlaid chart, and *Open in Financial history →* which hands the
selection to the explorer. The tile's button reads back as **✓ in chart**. The tray lives outside
`#view`, so it **persists across Overview ↔ Financial history**.

**One deliberate deviation from the prototype's CSS.** The prototype declares the tray
`position: sticky; bottom: 0` at the end of the content column, which means it is only visible once
you have scrolled to the bottom of a very long page — defeating the point of assembling a
comparison *while reading*. Ours is fixed to the viewport bottom, spanning the content column, with
the page reserving room beneath so nothing is trapped under it.

**Defect found while verifying it:** *Open in Financial history* silently did nothing when the tray
was used **from** Financial history — `selectTab()` early-returns when the view is already active,
so the new selection never re-rendered. Fixed by re-rendering the explorer directly in that case.
This is the kind of bug only a driven test finds: the button looked fine and threw nothing.

### Cycle-3 verification

| Check | Result |
|---|---|
| Tray drive (14 assertions) | **14/14** — opens without navigating · pinned · chips · 3-metric overlay · 4th refused visibly · persists across views · hand-off to the explorer · chip × · Hide/Show · Clear · buttons reset |
| New e2e shot `company-tray` | added and driven (clicks `+ chart`, asserts the drawer opens and the tile reads "in chart") — **errors=0** |
| `pytest` | **572 passed, 9 skipped** |
| e2e | **43 shots, 0 threw, 2 with errors** — still only the pre-existing pair |
| Screenshot | `qa5-tray.png` — three overlaid series, readable axis, honest caption |

**⚠️ Cycle cap reached.** This is the third fix→QA cycle. Per the delivery rules, a further defect
round does not get a fourth silent loop — it goes back to the operator as a scoping conversation.


---

# QA cycle 4 — operator round-4 finding (2026-07-28)

Round 4 confirmed the comparison tray (T1–T8 all good). One finding:

> *"All good but there is no right column like in the prototype"*

### Escalated rather than looped — and the operator chose the scope

The 3-cycle cap had been reached, so this did **not** get a silent fourth fix. The rail was sized
and put back as a scoping decision: the prototype's right rail is a **Filing timeline** (`:3902`),
which is Track-1 and close — `sec/insider.py:_recent_filings()` already walks the exact
submissions-JSON arrays it needs — but nothing serves it, and storing that metadata is **V3-P3's**
declared job. **Operator decision: build it now as a placeholder.**

**Built:** the prototype's rail — 262px, sticky, "Filing timeline", "every form as filed", and the
real filter vocabulary (All · 10-K · 10-Q · 8-K · Ownership) rendered **planned-and-inert** (no
href, no handler, drained, self-explaining on hover — the same treatment `STYLE_GUIDE` §10 gives a
planned nav subject). **Not one fabricated filing, date, form or count**, plus a real "All filings
on EDGAR ↗" escape hatch. It becomes real when V3-P3 lands, without moving.

Scoped to **Overview and Financial history only** — P5 decides what its own views carry.

**Defect I introduced and caught in the same pass:** at 1280px the rail sat *beside* the content
and squeezed the column from 831px to **171px**. `.shell-viewport` has `min-width: 0`, so
`flex-wrap` never fired — it just shrank. Fixed with `flex: 0 0 100%` on the rail below 1360px,
which forces the wrap. Verified 831px at 1280 and a true 262px sticky column at 1440.

### Cycle-4 verification

| Check | Result |
|---|---|
| Right-rail drive (12 assertions) | **12/12** — sticky 262px column at 1440 · titled with the real filter vocabulary · filters inert · **zero fabricated rows/dates/counts** · EDGAR link · still visible (below content) at 1280 with the column back at 831px · absent on P5's three views · present on both P4 views |
| `pytest` | **572 passed, 9 skipped** |
| e2e | **43 shots, 0 threw, 2 with errors** — still only the pre-existing pair |
| Screenshot | `qa6-rail-wide.png` — the full prototype frame: subject nav → view rail + Sections → content → right rail |

**Honesty re-confirmed at the end of every cycle:** no missing value renders as `0` (AAPL, JPM,
AAR CORP); the three placeholders (Item 1, EX-21, Filing timeline) carry real structure and **no
fabricated cell**; there is still no basis toggle.
