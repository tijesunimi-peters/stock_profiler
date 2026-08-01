# 4 — QA · V3-P5a **phase 2** (§02 and §03 on real filings data)

**Branch:** `v3-p5a-institutional` @ `d82aee3` + the QA fix below
**Scope:** phase 2's data plumbing for **§02** and **§03**.

⚠️ **Three earlier QA pairs are on disk and none of them covers this change.** Read the filenames:
`*-phase1.md` is the **fidelity gate** (design only, no data); `*-p2-s01.md` is **§01's** phase-2
plumbing, signed 2026-08-01. A green report in either says nothing about §02 or §03.

**Verdict: PASS — pending manual UI verification.**
Two defects were found **and fixed during QA** (both period validation — see below); everything
else is green on first pass. → **`4b-manual-verification.md`**

---

## Acceptance criteria

The governing rules are **D-literals** (phase 2 is not done until no literal remains; a plumbed
section never falls back to one), **D-chips**, **D-behaviour**, and §03's three rulings
(**D-overlap · D-attribution · D-domicile**).

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | §02 and §03 carry **no prototype literals** | ✅ | `IP02` and `IP03` are both gone from `company.js` (`grep -c 'IP03\.'` → `0`). The banner names only §04–§06. |
| AC-2 | A plumbed section never falls back to a literal — it renders loading / empty / error | ✅ | `p2-read-section.js` on §03: AAPL populated; JPM renders two honest empty states **with reasons**. Loading state forced by aborting requests at the network layer. |
| AC-3 | **No missing value rendered as `0`** | ✅ | `zeros: []` on AAPL and JPM. Two defects in *opposite* directions were caught pre-handoff and are re-verified here (see §5 of the questionnaire). |
| AC-4 | Derived values carry `status`/`reason`; chips **iff** N/A or approximate (D-chips) | ✅ | `p2-chips.js` → `violations: []`. |
| AC-5 | Every control does something (D-behaviour) | ✅ | `p2-drive-03.js` **10/10**, `p2-drive-controls.js` **5/5**, `p2-inert.js` → `derivesWithNoPanel: []`. |
| AC-6 | D-attribution: three reported rows, **no residual, no total** | ✅ | `rows_are_additive: false`; no total field exists in the payload; the card renders three bars and a *denominator* foot. `test_attribution.py::TestTheOperatorsRuling` fails if either is re-added. |
| AC-7 | D-overlap: the matrix is **asymmetric**, diagonal `null` | ✅ | Driven: AAPL→peer `0.43`, peer→AAPL `1.00`. `matrix[i][i] is None` on every row. |
| AC-8 | D-domicile: US by state, others by country; `prior_weight: null` draws **no tick** | ✅ | 7 US-state rows on AAPL with ticks; places absent from the prior quarter carry none. |
| AC-9 | 13F deltas read as **derived**, never reported trades | ✅ | §03's flow caption: *"Both sides are DERIVED by diffing consecutive quarter-end snapshots — nobody files a trade here."* |
| AC-10 | No SVG/DOM text clips, **webfont blocked as well as loaded** | ✅ | `p2-clip-sweep.js`: `svgOverflow=0 domBleed=0` × 2 companies × 2 font states. |
| AC-11 | Layout holds at narrow widths | ✅ | 1280 / 900 / 420 px, expanders open: `docScroll: false`, `bleed: 0` at every width. |
| AC-12 | Error paths are honest — no bare 500s, no client error dressed as data | ⚠️ → ✅ | **Two defects found here.** Fixed and regression-tested. |
| AC-13 | `pytest` green | ✅ | **677 passed, 9 skipped** (675 + 2 new period tests). |
| AC-14 | e2e headless render check | ✅ | 44 shots; all three institutional shots `errors=0`; only the two pre-existing `sectorapp-company` 502s. |

---

## Defects found in QA

### D-QA-1 · `institutional-register` returned a **bare HTTP 500** on a malformed period — FIXED

**Severity: medium.** Pre-existing on this branch (from the phase-2 backend, not from §03).

```
GET /v1/companies/AAPL/institutional-register?period=not-a-date   →  HTTP 500
ValueError: Invalid isoformat string: 'not-a-date'
  routes.py:2212 in _register_period_meta
```

`_register_period_meta` called `date.fromisoformat` unguarded. A malformed client input is not a
server fault, and a bare 500 is what this project's upstream-error posture exists to avoid.
`institutional-activity` already had the right answer — a **400 with a message**.

### D-QA-2 · the three §03 endpoints reported a client error **as a finding about the data** — FIXED

**Severity: medium — an honesty defect, not merely a status-code one.**

```
GET /v1/companies/AAPL/institutional-holder-domicile?period=not-a-date   →  HTTP 200
{"domicile": {"status": "na",
  "reason": "none of the 0 ingested filing(s) for this quarter carries a business location …"}}
```

A typo in a query string came back as **a statement about the register**. That is precisely what
the `N/A` vocabulary must never do: it converts an input error into a coverage claim, and the
reader has no way to tell the two apart.

**Fix (both):** one shared `_require_period()` at the edge of the five register-family routes,
returning **400** with a message that names the bad value *and points at
`/institutional-periods`*. Regression test:
`tests/test_section03_routes.py::test_a_malformed_period_is_a_400_not_a_finding_about_the_data`.

| endpoint | before | after |
|---|---|---|
| `institutional-register` | **500** | **400** |
| `institutional-filed-since` | 200 / na | **400** |
| `institutional-holder-domicile` | 200 / na | **400** |
| `institutional-share-attribution` | 200 / na | **400** |
| `institutional-peer-overlap` | 200 / na | **400** |

*(`institutional-register-shape` takes `quarters`, not `period`, so ignoring the param is correct.)*

### D-QA-3 · `institutional-activity` leaks a raw Python error to the client — **NOT FIXED**

**Severity: low. Pre-existing, outside this change — recorded, not fixed.**
`?period=not-a-date` → `400 {"detail":"invalid literal for int() with base 10: 'a'"}`. The status
is right; the message is an internal exception string rather than guidance. Fold it into
`_require_period` when that endpoint is next touched.

---

## Review questionnaire

**1. What shipped.** Opening a company's Institutional view now shows *its own* filings in §02 and
§03 instead of the prototype's sample numbers: how many managers report it and how that has moved,
who the largest holders are and how concentrated the register is, gross adds and reductions by
quarter, where those managers file from, which industry peers share holders with it, and how many
shares each family of ownership filing accounts for. Where we cannot answer, the block says so in
a sentence instead of showing a number.

**2. Surfaces touched.** Endpoints: `institutional-holder-domicile`, `-share-attribution`,
`-peer-overlap` (new); `-register` (gained `lorenz`); `-activity-series`, `-activity`,
`-register-shape`, `-holdings-series` (newly consumed). UI: `company.js` §02/§03 and the data
layer, `company.css`. Storage: profile / cusip / holdings gained one bounded read each; the
insider store gained `is_derivative` behind a guarded migration.

**3. AC → evidence.** The table above — every row names the driven artifact, not an intention.

**4. States exercised.**
- **Populated** — AAPL, on both the seeded fixture and the real 7.7 GB volume (1.15 M raw facts,
  50.2 M holdings rows).
- **Empty** — JPM: no cover-page locations and no ingested SIC peer, so the domicile and overlap
  cards render *reasons*, not blanks. WMT (unresolvable CUSIP) → 404 with an explanation.
- **Loading** — forced by aborting the older-quarter register requests at the network layer
  (`p2-noprior.js`). Pending blocks read "Reading the filings…" and carry **no** status chip.
- **Error** — malformed period (D-QA-1/2); unknown ticker → 404; missing required param → 422.
  Upstream-SEC failures are handled by app-level `@app.exception_handler`s (502 for
  `HTTPStatusError`, 503 for `TransportError`), which cover the new routes automatically.

**5. Edge cases probed.**
- **N/A vs 0, in both directions.** "Exited **0** managers · **0** of shares" is a *measured* zero
  and prints as `0`. The "8+ quarters" tenure cohort prints **N/A with a chip**, because four
  ingested quarters make it structurally unreachable — a limit of our coverage, not a finding
  about the register. Both confirmed on the rendered page, not in the payload.
- **No prior quarter** — the operator's crash condition. Re-driven with the prior registers
  starved at the network layer: §03 renders, **no dashed path is drawn**, and the legend and
  caption both say *"no prior ingested quarter to compare"*. Promoted to `tools/p2-noprior.js`.
- **Options vs shares** — the insider attribution row excludes derivative rows; rows predating the
  flag are excluded as *unknown*, with the gap stated in that row's `reason`.
- **Multi-class** — `share_vector` and `domicile` both aggregate per *manager*, so a filer holding
  two share classes is one holder (asserted in `test_register.py`).
- **429 / upstream** — the anonymous limiter and the 502/503 handlers are app-level and untouched
  by this work; not re-verified per route.

**6. Honesty contract.** Caveats present on every new payload; derived blocks carry
`status`/`reason`/`formula`/`cannot`/`population`; **no missing value rendered as 0** (`zeros: []`);
13F deltas labelled derived in the caption; no fabricated precision — the residual row is *absent*
rather than estimated, and the attribution card carries no total. The one place the contract was
actually being broken was D-QA-2, now fixed.

**7. Deltas from the brief.**
- **The "Residual over time · TREND" foot is gone**, with its panel — the direct consequence of
  D-attribution removing the row it belonged to. The foot now carries the denominator. **This is a
  visible change to a rendering the operator already accepted at the fidelity gate, and it is the
  single most important thing to look at by hand.**
- **Deviation D3 is closed** (the treemap re-squarifies at the dialog's aspect rather than
  scaling the card's layout), because the layout became a computation instead of a recovered
  literal.
- **Not verifiable by automation:** whether the peer *set* reads as a sensible peer group, and
  whether the trimmed peer labels remain identifiable. Both are judgement calls → 4b.

**8. Residual risk**, in the order that worries me:
1. **A reader treating the three attribution bars as a whole.** They overlap and do not sum; the
   card says so twice, but the visual grammar of three aligned bars invites the opposite reading.
   This is the one that could mislead about a real company.
2. **Peer selection is coverage-dependent by construction** — the SIC group ranked by ingested
   register size. On a thin volume the "peers" may be odd companies. `peer_basis` states the rule
   on the payload and in the caption, but a reader may not read it.
3. **Page load ~3–5 s on a whole-market volume** — 13 concurrent requests serialising on one event
   loop (async handlers, synchronous store reads). Not a defect of this change and not fixable
   without an architectural decision, but it is what the operator feels first.

---

## UI/UX review

- **States** — loading, populated, empty and error each render intentionally, and the loading
  block is visually distinct from the empty one (muted, and it carries **no** status chip, because
  a value we have not asked for yet is not N/A).
- **Legibility** — no clipping at either font state; peer-matrix and treemap labels are trimmed to
  their own box with the full name on `<title>`.
- **Theme** — the app is **single-light-theme by design**; `shell.css:141` documents it ("no
  `prefers-color-scheme` anywhere in the CSS"). Verified byte-identical under emulated light and
  dark, which is correct here rather than a defect. Contrast inside §03: title 225, caption 119
  against the card.
- **Copy** — active voice, sentence case, no over-claiming. Captions state limits rather than mood
  ("it is a floor, not a history"; "not evidence of a sale").
- **Affordances** — 10 controls in §03, **0 inert**; the Effective-holders stat is a control only
  when a trend exists behind it.
- **Consistency** — chips are the shared `ClearyFi.statusChip`, not a local lookalike.

---

## Manual UI verification (script)

Start the app:
`docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app`
→ **http://localhost:8010/company/AAPL/institutional**

1. Load the page. **Expect:** the banner names only §04–§06; §02 and §03 show real figures.
2. §03 "Position changes over time". **Expect:** bars per quarter, a table matching them, four
   count tiles. "Exited" may read `0 · 0 of shares` — a real zero.
3. "Who holds what" → click **Treemap**, then **Cumulative share**. **Expect:** chart *and* caption
   both change, and it returns exactly where it started.
4. Click **⤡ Expand** in each of those views. **Expect:** the dialog opens the view you are
   looking at, under its own title.
5. Click the **Effective holders** number. **Expect:** a trend panel with three measures.
6. Open **+ Also in this section**. **Expect:** four cards; matrix labels readable, not clipped;
   hovering a label shows the full name.
7. "Overlap with sector peers" → **Set intersections**, then **⤡ Expand**. **Expect:** the UpSet
   plot, under "Manager set intersections".
8. **"Where every share sits" — the important one.** **Expect:** three bars, each with its own
   as-of date, a *denominator* line, and **no total and no residual row**. Judge whether the
   removed "Residual over time · TREND" control is missed.
9. "Stable-capital share". **Expect:** "8+ quarters" reads **N/A** with a chip (not 0%), and the
   caption explains why.
10. Open **http://localhost:8010/company/JPM/institutional**. **Expect:** domicile and overlap
    render honest empty states with reasons; nothing shows 0.
11. Put `…/v1/companies/AAPL/institutional-holder-domicile?period=not-a-date` in the address bar.
    **Expect:** a **400** naming the bad value — not a page of "no filings".
12. Narrow the window to phone width. **Expect:** no horizontal scrollbar.

**Operator outcome:** ⏳ pending — see `4b-manual-verification.md`.

---

## Test evidence

```
docker compose --profile test run --rm test          → 677 passed, 9 skipped
docker compose --profile e2e up …                    → 44 shots, institutional errors=0
                                                       (2 pre-existing sectorapp 502s)
tools/p2-clip-sweep.js   → svgOverflow=0 domBleed=0  (AAPL+JPM × webfont loaded/blocked)
tools/p2-chips.js        → violations: []
tools/p2-inert.js        → derivesWithNoPanel: []
tools/p2-drive-03.js     → 10 controls, failures: 0
tools/p2-drive-controls.js → 5 controls, failures: 0
tools/p2-noprior.js      → renders, dashedPaths: 0, page errors: 0
tools/p2-read-section.js → zeros: [] (AAPL and JPM)
```

---

## Handoff

**PASS — pending manual UI verification.** Two defects found and fixed in QA (D-QA-1, D-QA-2);
one low-severity pre-existing item recorded and deliberately not fixed (D-QA-3). 677 pytest, e2e
clean, every driven check green.

**Blocked on:** the operator hand-running **`4b-manual-verification.md`**. Per **D-manual-gate**
this is mandatory and cannot be stood in for by QA's own evidence; the verdict is not "ready to
deploy" until it is signed. **Step 8 (the attribution card) and the removed residual-trend control
are the ones to look at hardest.**
