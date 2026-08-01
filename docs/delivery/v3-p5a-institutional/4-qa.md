# 4 — QA · V3-P5a **phase 2**, §01 plumbed onto real filings data

**Branch:** `v3-p5a-institutional` (working tree on `4bcbd28`)
**Verdict:** ✅ **PASS — operator CONFIRMED 2026-08-01** (`4b-manual-verification.md`, signed)
**Phase 1's QA is preserved** as `4-qa-phase1.md` / `4b-manual-verification-phase1.md`. A green
report there says nothing about this change.

**Trigger:** the operator reported a layout defect in §01's base/filed-since/adjusted equation
panel, and during the interactive walk-through reported a second — the dumbbell chart clipped on
the left. Both are **defect loops back to the frontend engineer**, fixed and re-verified below,
along with a third of the same class found by sweeping. The whole of §01's phase-2 plumbing was
then put through a QA pass, since it had never had one.

**All three have one cause:** the prototype's layout constants were sized for the prototype's own
short sample strings, and real filings data is longer and — for text in SVG — *font-dependent*.

---

## Defects found and fixed this cycle

### D-1 · The equation panel stopped being an equation — **operator-reported, FIXED**

**Severity:** major (the panel's meaning depended on the layout it lost).

**Repro:** open `/company/AAPL/institutional`, read the *Since the last 13F* card.

**Measured, before:** the panel was **248px tall across three rows**. Each `.ip-eq-cell` sized to
max-content (**607px inside a 660px panel**), so all three terms wrapped onto their own line and the
`+` / `=` glyphs stopped sitting *between* terms. An arithmetic statement had become a stacked list —
`Base register 2.9B` / `+` / `Filed since N/A …` / `=` / `Adjusted register N/A …`, which is what the
operator pasted.

**Root cause:** the prototype's cell notes are **three words** ("3 of 6 filings applied"); phase 2
put the API's `reason` in that slot, which is a **sentence**. `.ip-eq` is `display:flex;flex-wrap`
with no width share on its children, so a long note grows the cell to max-content and wraps the row.
This is the **same root cause** as the freshness-strip wrap fixed earlier in the session — the fix
had been applied there and not swept for elsewhere.

**Fix, two parts:**
1. **Layout** — `.ip-eq > * { flex: 1 1 0; min-width: 0 }` (a flex item will not shrink below its
   content without `min-width: 0`), plus `flex: 0 0 auto` on the operator glyphs so `+` and `=` keep
   their intrinsic width. The equation now holds one row at any note length.
2. **Content** — the long "why" moved **out of the cells** into one `.ip-eq-why` line under the
   panel, where a sentence has the full 660px column instead of a third of it. The cells went back
   to the prototype's short register ("0 of 4 state a position", "not a total we can take"). The
   reason is not lost — it is more readable, and stated once instead of split across two cells.

**Measured, after:** **81px, one row, three equal 200px terms, no overflow.** The prototype's own
panel is ~78px.

### D-2 · Same defect class, one cell over — **found by sweeping, FIXED**

Not reported, but the same cause: §01's freshness strip put the "Confirmed in last 30 days" reason
(a 17-word sentence) into a **118px cell**, wrapping it to six lines and inflating the card from
~90px to **157px**. Fixed the same way — the cell carries "not tracked", and the reason became the
third paragraph of the `.ip-prose` block beneath the strip, which is already the place this card
says what it is not. **157px → 105px.**

### D-3 · The dumbbell's label gutter clips real manager names — **operator-reported, FIXED**

**Severity:** major, and **font-dependent**, which is the part that makes it nasty — it can look
fine on one machine and cut on another.

**Repro:** open `/company/AAPL/institutional`, look at the *Where the register moved* chart.

**Root cause:** `IP_DB.gutter` is `210` viewBox units, sized for the prototype's labels
("Hedge fund H"). Labels are **right-anchored at `gutter - 10`, so they run LEFT**, and
`svg.ip-db` computes `overflow: hidden` — a label wider than the gutter is **silently cut**, with
no scrollbar and no visual cue. Real manager names are unbounded.

**Measured** — the same name, same page, only the font differing:

| condition | `getComputedTextLength()` | left edge | clipped |
|---|---|---|---|
| `NORTHLESS CAPITAL PARTNERS`, webfont loaded | 165.8 | 34.2 | no |
| `NORTHLESS CAPITAL PARTNERS`, **webfont blocked** | **184.7** (+11%) | 15.3 | no, barely |
| a 63-character name | **412.6** | **−212.6** | **YES** |

So it fits in headless with Hanken Grotesk resolved, and does not once the fallback stack is
substituted — which is exactly the operator's condition and why the automated captures missed it.
This was listed as residual risk in questionnaire answer 8 of the first draft of this report; it
was real, and reported before I had exercised it.

**Fix — measure, don't estimate.** `RECONCILIATION.md` §6 rule 1 says this outright: *"In
production, use `getComputedTextLength()` — real DOM measurement is available and strictly better
than the constants."* `ipFitDumbbell()` runs after paint and again on `document.fonts.ready`
(which settles immediately when fonts are already resolved, so the second pass costs nothing):

1. Measure every label with `getComputedTextLength()` — what the browser *actually* rendered, with
   the font that *actually* loaded.
2. Grow the gutter to fit the longest, capped at **330** units (past that the track is too short to
   read a movement on); the track gives up the space.
3. If even the cap is not enough, **trim the label with an ellipsis** so it is never cut mid-glyph,
   and keep the full name on a `<title>` — visible on hover and to assistive tech.

`domainMax` and `gutter` are now both parameters; the literal fallback passes the prototype's own
constants, so the phase-1 rendering is unchanged.

**Verified end-to-end** with the API response rewritten to carry a 63-character manager name **and
the webfont blocked** — the worst case, both at once:

```
gutter: 210 -> 329          trackStart: 329
label:  "NORTHLESS CAPITAL PARTNERS INTERNATIONAL HOL…"  trimmed: true, full name kept on <title>
        len 317, leftEdge 2, CLIPPED: false
        "EVERPEAK ADVISORS LLC"  untouched (leftEdge 170.7)
dotsInside: true
```

### Not a defect — checked and cleared

- **The tiles grid renders 3 + 1 with an empty quadrant.** That is the prototype's own
  `repeat(auto-fit, minmax(180px, 1fr))` at a 694px column, and it is what passed the phase-1 pixel
  gate at 0 bands. Faithful, not a regression.
- **Identical rendering in light and dark.** The app is **deliberately single-theme** —
  `shell.css:141` documents it and there is no `prefers-color-scheme` in any stylesheet.

---

## Acceptance criteria

Phase 2's criteria come from **D-literals** (`_active.md`) and the honesty contract, since this
attempt has no PM/architect stage.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | §01 renders this company's filings data, not the prototype's literals | ✅ | AAPL: `1Q26 · filed 2026-03-31 · 123 days`, base register `2.9B`, 7 managers, dumbbell rows **VANGUARD / STATE STREET / BERKSHIRE**. JPM independently: 2 managers, `3.8M`, different manager names |
| AC-2 | **No missing value rendered as `0`** | ✅ | `zeros: []` on every capture — a scan of every `.ip-strip-val`/`.ip-tile-val`/`.ip-eq-val` for `0`, `0.0`, `0%`, `—`. AAPL and JPM both empty |
| AC-3 | Unsourceable figures render N/A **with a reason**, never a plausible number | ✅ | 5 × `N/A` in §01, each with its own reason; the two that need a sentence carry it in `.ip-eq-why` / `.ip-prose` |
| AC-4 | 13F deltas read as **derived**, not reported trades | ✅ | Dumbbell caption opens *"DERIVED by diffing two quarter-end 13F snapshots — these are not reported trades"*, names the prior quarter (4Q25), and states that only managers reporting in both quarters appear |
| AC-5 | A plumbed section never falls back to a literal | ✅ | `ipSection01` guards on `IP_DATA.status`; the `\|\| IP01.x` fallbacks were deleted. `IP01` is down to `scope` + `speed`, which are **filing rules**, not figures |
| AC-6 | The banner tells the truth about what is real | ✅ | Reads *"5 of these sections are still design placeholders"* and names §02–§06 explicitly; §01 is called out as carrying real data |
| AC-7 | Error and empty paths degrade honestly | ✅ | ZZZZ → the app's 404 state ("We don't carry \"ZZZZ\""). A failed endpoint renders `states.error` with its status; the four calls are settled not raced, so one failure cannot blank the page |
| AC-8 | The ported design survives the plumbing | ✅ | Strip, equation panel, dumbbell, tiles and expander all sit where the port put them. Section 1131px |
| AC-11 | No chart clips or silently drops real content | ✅ | D-3: gutter measured post-mount and grown to fit; worst case (63-char name + blocked webfont) trims with the full name on `<title>`, `CLIPPED: false`, all dots inside |
| AC-12 | Status chips appear **iff** a value needs a caveat (D-chips) | ✅ | All 11 value slots driven: 5 chips on the 5 `N/A` slots, 0 on the 6 clean values, **`violations: []`**. Uses the shared `ClearyFi.statusChip` |
| AC-9 | Every control still works | ✅ | Both `[data-ip-go]` links: 4/4 driven assertions, landing on the real Form 4 ledger (`Cook Timothy D · 2026-06-15`). Expander opens |
| AC-10 | No regression elsewhere | ✅ | **609 passed, 9 skipped**; e2e `institutional` / `institutional-legacy` / `institutional-nolocation` all `errors=0` |

---

## Review questionnaire

**1. What shipped.** Opening a company's Institutional tab, §01 *Register snapshot* now describes
**that company**: when its 13F register was filed and how stale it is, how many managers report a
position, how many shares they report, which managers moved most since the prior quarter, and every
filing accepted since. Where we cannot honestly compute something, the slot says `N/A` and tells you
why instead of showing a number. A banner above still names the five sections that remain design
placeholders.

**2. Surfaces touched.** `company.js` (the `IP_DATA`/`ipLoad` layer and every §01 builder),
`company.css` (`.ip-eq*`, `.ip-strip-cell`, `.ip-plan-line`, `.ip-xref*`). Endpoints **consumed**,
not changed: `institutional-periods`, `-register`, `-register-shape`, `-filed-since`, `-activity`.
No Python changed.

**3. AC → evidence.** The table above; every row is a driven observation on the running page or a
command's output, not a source reading.

**4. States exercised.** **Populated** — AAPL (7 managers) and JPM (2), driven after the fetch
settles. **Empty** — the dumbbell's no-overlap branch renders an empty state naming both quarters
and calling it a coverage gap, not an absence of movement. **Error** — ZZZZ 404s into the app's
own not-found state; `ipErr`/`states.error` covers a per-endpoint failure. **Loading** — the
`IP_DATA.status` guard renders `states.loading` rather than flashing literals.

**5. Edge cases probed.** *N/A vs 0*: the `zeros` scan is the load-bearing one and it is clean on
both companies. *Thin register*: JPM's 2-manager register renders the same shapes as AAPL's 7.
*Unresolvable issuer*: 404, not an empty register. *Long-value layout*: the two defects above —
real `reason` strings are the edge case the literals never produced. *Restatements / PRN / option
rows*: **not probed here** — the fixture does not carry them and the register endpoint's own tests
cover them; noted as residual risk.

**6. Honesty contract.** Caveats present (the register's own `caveats[]` phrasing is carried in the
prose and captions). Derived numbers labelled — the `ƒ derived` badge is on the card and the tile,
and the dumbbell caption leads with DERIVED. Provenance intact — every figure names the form and
filing date it came from. **No missing value shown as `0`** — verified by scan, not by eye. 13F
deltas read as derived. No fabricated precision: the three figures that would require inventing a
number (`confirmed %`, `filed-since` total, `adjusted register`) all render `N/A`.

**7. Deltas from the brief.** (a) The **status vocabulary** — RECONCILIATION §3 wants a
`statusChip()` on every derived value; the prototype has none and carries the distinction in prose.
Phase 2 keeps the prototype's shape and puts `reason` in the note slot, because chips would break
the pixel match the operator accepted at the fidelity gate. **This is a reading, not a ruling —
it needs the operator's.** (b) The dumbbell uses **one accent**, not the prototype's three-way
manager-type colour: we do not classify managers by type and inferring a class from the name would
be fabrication. (c) §01's pixel gate is **retired by design** — it renders this company's numbers
now, so it cannot and should not match the capture.

**8. Residual risk.** All three defects this cycle came from **real strings being longer than the
prototype's** — and the third was *font-dependent*, so it rendered clean in every automated capture
and only the operator saw it. §02–§06 are not plumbed yet and **will hit this class again**: every
remaining chart with a hard-coded label gutter (§02's manager table, §03's ranked-share and
treemap, §04's lanes, §05's cohort grid) has the same exposure. Sweep each one with
`getComputedTextLength()` rather than fixing sites as they are reported, and **test with the
webfont blocked**, because that is the condition the captures do not reproduce. Multi-class / PRN /
option rows are untested at this surface. What would worry me most if wrong: a `null` reaching a
slot that formats it as `0` — hence the scan, which is now part of the driving script and should
stay there for every remaining section.

---

## UI/UX review

- **States** — loading, populated, empty and error each render intentionally; the empty dumbbell
  explains itself rather than drawing a broken chart.
- **Legibility & layout** — no bleed at 1440 / 1100 / 760 (`bleed: []`, `docScroll: false` at all
  three). Both wrap defects fixed and measured.
- **Copy** — the notes read as statements about filings, not system internals. One over-claim was
  removed: the card head said *"by EDGAR acceptance time"*, but `filed-since` returns **filing
  dates** (acceptance timestamps are V3-P3), so it now says "by filing date". The dumbbell caption's
  *"Colour is manager type"* was removed for the same reason.
- **Affordances & a11y** — 5 focusables in §01; the cross-view link is a real `<a href>`, focusable,
  and **Enter activates it** (driven: landed on `/company/AAPL/insider`). A modified click still
  opens a new tab because the handler only intercepts a plain left click.
- **Theme** — single-theme app by design; no hard-coded hex in §01 (`hardCoded: 0`).
- **Consistency** — reuses `P.states.loading/error` rather than a one-off.

---

## Manual UI verification

Run against **`http://localhost:8010`** (`p5a-preview` is up; otherwise
`docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app`).

1. Open `/company/AAPL/institutional`. → §01 shows **1Q26**, a filed date and a days-since count.
2. Read the *Since the last 13F* card's tint panel. → **One row: `Base register 2.9B` `+`
   `Filed since N/A` `=` `Adjusted register N/A`.** This is the reported defect — it must read
   across, not stack.
3. Read the line directly under that panel. → One sentence explaining why the last two are N/A.
4. Read the freshness strip's fourth cell. → `N/A` · "not tracked", **not** a six-line paragraph;
   the full reason is the third paragraph below.
5. Scan §01 for any `0`, `0.0%` or `—` in a value slot. → **None.** Every unknown reads `N/A`.
6. Read the caption under the dumbbell. → Opens with **DERIVED by diffing two quarter-end 13F
   snapshots — these are not reported trades.**
7. Click **+ ALSO IN THIS SECTION**. → Four real Form 4 filings (Cook, Maestri, Adams, O'Brien).
8. Click **Insider activity — ledger, codes, Form 144 →** at the bottom of §01. → Lands on the
   Insider view with a real Form 4 ledger. Browser **Back** returns to Institutional.
9. Open `/company/JPM/institutional`. → Different register (2 managers, 3.8M) — the page is not
   showing one company's numbers for another.
10. Open `/company/ZZZZ/institutional`. → An honest 404, not an empty register.
11. Narrow the window to ~760px. → No horizontal scroll; the equation may stack, but nothing bleeds.

**Operator outcome:** ✅ **Confirmed, 2026-08-01.** Walked interactively in two batches. Round 1
returned a defect — *"Real filings but the 'Since the last 13F' chart is clipped on the left"* —
logged as **D-3**, fixed, and the questionnaire **re-run** rather than signed over. Round 2:
*"All names read in full"*, *"All hold"*. Full transcript in `4b-manual-verification.md`.

---

## Test evidence

```
docker compose --profile test run --rm test
  609 passed, 9 skipped, 1 warning in 9.23s

docker compose --profile e2e up --abort-on-container-exit --exit-code-from e2e
  [institutional]              errors=0
  [institutional-legacy]       errors=0
  [institutional-nolocation]   errors=0
  [sectorapp-company]          errors=8   <- PRE-EXISTING
  [sectorapp-company-refocus]  errors=13  <- PRE-EXISTING
```

The two `sectorapp-company*` failures were confirmed pre-existing by **stashing this change,
rebuilding and re-running**: they reproduce identically (8 and 14) on synthetic fixture CIK 900001.
Not caused by this work, and not fixed by it.

---

## Handoff

**Verdict: PASS — operator confirmed 2026-08-01.** All three defects fixed and measured; all twelve
acceptance criteria have driven evidence; no regression (609 pytest, `institutional` e2e
`errors=0`).

**The status-vocabulary question is answered** — the operator chose **(c) chips only on N/A and
approximate**, recorded as **D-chips** in `_active.md` and **implemented on §01 in this cycle**
rather than left as debt. §02–§06 follow the same rule, and the `violations: []` assertion is the
check to repeat per section.

**What this cycle should change about how the remaining sections are built.** Two of the three
defects were reported by the operator, not found by the tooling, and D-3 is the sharper lesson: it
was **font-dependent**, so every headless capture rendered it clean. Before plumbing §02–§06:

- Sweep every chart with a hard-coded label gutter (§02's manager table, §03's ranked-share and
  treemap, §04's lanes, §05's cohort grid) with `getComputedTextLength()` — the constants are all
  sized for the prototype's short sample strings.
- **Run the layout checks with the webfont blocked**, which is the condition the captures do not
  reproduce and the operator's browser does.
- Keep the `zeros: []` and `violations: []` assertions in the driving script for every section.

**Not committed.** Ready for a deploy *request* whenever the operator wants one — that stays
operator-gated.
