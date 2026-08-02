# 3 — Implementation · V3-P5a **phase 2**, the backend half

**Branch:** `v3-p5a-institutional` (continues from phase 1; the frontend continues on the same branch)
**Stage:** Senior Backend Engineer → Senior Frontend Engineer
**Status:** backend green and driven. **No `static/` file was touched.**

---

## What changed, and why it was mined rather than written

Attempt 3 built this backend, and the operator's revert was about the **design**, not the data — the
archive branch `v3-p5a-attempt3-archive` (`1429955`) carried it fully built and green. `_active.md`
says to mine it. I restored exactly the server-side files and left every `static/` file behind:

| file | |
|---|---|
| `src/secfin/normalize/register.py` | **new**, 488 lines — the moat for this view |
| `src/secfin/api/routes.py` | +3 routes, `_register_period_meta`, `_vector_payload` |
| `src/secfin/normalize/schema.py` | +12 |
| `src/secfin/storage/{insider,beneficial_ownership}_repository.py` + their SQLite impls | small read additions behind the existing interfaces |
| `src/secfin/storage/sqlite_holdings_repository.py` | +4 |
| `tests/test_register.py` · `tests/test_register_routes.py` | **new**, 37 tests |

Our branch had not touched a single backend file since `master`, so this grafted with no conflict.
One fix on top: a 105-char line in `register.py` (the repo's ruff limit is 100).

`register.py` is **pure** — no DB, no network, no clock. It takes already-read `IssuerHolder` rows
and returns models, so the moat is unit-testable without a fixture database, the same way
`flows.py` is.

---

## The JSON contract — what the frontend consumes

All three are `GET /v1/companies/{symbol}/…`, API-key gated, cache-aside over the operational store.
No DuckDB on the request path.

### 1. `institutional-register?period=YYYY-MM-DD` — one quarter's shape

```
cik · cusips · period
period_meta { as_of, filed_earliest, filed_latest, deadline, deadline_days,
              days_after_period_end, within_deadline, ingested_filer_count,
              amendment_count, age_days }
concentration { status, reason, formula, cannot, population,
                holder_count, hhi, effective_holders, gini,
                top1_share, top5_share, top10_share, managers_for_half }
share_vector[] { manager_cik, manager_name, shares, weight, cumulative }
share_vector_total_rows · excluded_holder_count · total_reported_shares · caveats[]
```

Feeds **§01**'s freshness strip and tiles, **§02**'s holders table, **§03**'s ranked-share chart,
cumulative curve, HHI / effective-holders / Lorenz card.

### 2. `institutional-register-shape?period=…` — across quarters

```
turnover       { status, reason, …, to_period, from_period, entrants, exits,
                 retained, prior_holder_count, turnover_pct }
tenure         { status, reason, …, quarters_observed, newest_period,
                 median_quarters_held, cohorts[], quarters_by_manager{} }
stable_capital { status, reason, …, weights[[q,w]], stable_share, quarters_observed }
```

Feeds **§03**'s stable-capital card and **§05** entirely (turnover, median holding period, the
tenure cohorts, the retention grid).

### 3. `institutional-filed-since?period=…` — what landed after the register closed

```
filings[] { form, filer, reported, percent_of_class, shares, shares_are, … }
filing_count · register_filed_latest · does_not_restate · does_not_restate_reason
dates_are · caveats[]
```

Feeds **§01**'s "Since the last 13F" card.

**Every derived block carries `status` · `reason` · `formula` · `cannot` · `population`.** `cannot`
is the half that stops a register statistic being read as a fact about the company — surface it,
don't drop it.

---

## ⚠️ What the backend CANNOT source — the port's literals with no data behind them

This is the important part of the handoff. Phase 1 rendered the prototype's sample values verbatim
under a NOT-REAL-DATA banner. Several of those have **no source in our data**, and phase 2 is not
done until each is either plumbed or honestly removed. **None of them may keep a literal.**

| the port renders | reality |
|---|---|
| §01 "Confirmed in last 30 days · 32%" | **We do not track filing confirmations.** No source. |
| §01 the adjusted register `767M + 9.7M = 776M` | Summing a 13D/G *total* + a Form 4 *transaction* + a 13F *holding* invents a share count nobody filed. Attempt 3 omitted it deliberately and the operator's Batch B passed on that reasoning. |
| **§02 manager mix (index / active / hedge fund / pension)** | ⚠️ **CANNOT SOURCE — DECISION OPEN.** The prototype's own note says "classification assigned by ClearyFi"; we assign none. Not on a 13F cover page, not derivable from one, and inferring it from a manager's name is fabrication. **Built as an honest empty state** (2026-08-01) — the alternatives are removing the block or replacing it with something sourceable over the same axis. Operator's call. |
| §03 domicile (10 rows) | ✅ **RULED 2026-08-01 — D-domicile: extend the backend to break out COUNTRIES.** `institutional-holder-geography` lumps every non-US filer into one `outside_states` bucket *for the choropleth*; the raw `stateOrCountry` is on every holder row, so the breakout is a read, not an inference. Rank by shares. Choropleth untouched. Still depends on `ingest/location_backfill.py` having run — an unrun volume renders the honest empty state, not a flat card. |
| §03 peer matrix / set intersections | ✅ **RULED 2026-08-01 — D-overlap: BUILD `institutional-peer-overlap`.** Peers from the SIC group (`company_profiles`) + `holders_of` per peer — a bounded handful of live indexed point reads, pure Python aggregation, **no DuckDB** (guardrail 6). Defensible because the fact is stated by both filings: a manager reporting two issuers in the same quarter is not derived. |
| §03 "Where every share sits" (insider / 13D / residual) | ✅ **RULED 2026-08-01 — D-attribution: THREE REPORTED ROWS, residual DROPPED.** 13F-reported, insider & affiliate, and 13D stakes, each as a share of `EntityCommonStockSharesOutstanding`. The residual row is gone — it is a *subtraction*, and a remainder of three quantities measured on three different dates is fabricated precision (the reasoning that killed §01's adjusted register). ⚠️ Consequences the build must carry: **no total, no 100% framing**, and the rows are **not disjoint** (a 5%+ institutional holder files a 13F *and* a 13D/G, so it appears twice). Each row carries its own as-of date. |
| §04 voting (Item 5.07, N-PX) | ✅ **RULED 2026-08-01 — D-voting: HONEST EMPTY STATES, both, no ingest.** Two *different* reasons that must not be collapsed: **8-K Item 5.07 is narrative HTML**, so parsing it is out of scope by the no-HTML rule — not un-ingested, but *not something this product does*. **N-PX has been structured XML since 2024** and so IS Track-1-eligible — it is simply not ingested, a whole new form family. N-PX is therefore a legitimate future milestone; Item 5.07 is not. |
| §04 the Item 4 `purpose` column | ✅ **RULED 2026-08-01 — D-purpose.** Item 4 is free prose = **Track 2**, flagged not built. Replaced by the cover-page **TYPE OF REPORTING PERSON** (IA/BK/CO…), already ingested and already on §02's table — same slot, structured, no new ingest. |
| §04 the 5%-filing lane chart | ✅ **RESOLVED 2026-08-01 — fully sourceable, no new backend.** Checked against the store: every `beneficial_ownership` row carries its own `form_type` (incl. `/A`), `filed`, `event_date` and `percent_of_class`, so the per-filing amendment chain is all there. The lane chart AND the filings table both plumb from `get_beneficial_ownership`. |
| §04 "no standstill agreement filed as an 8-K exhibit" | **8-K exhibits are not ingested.** The clause is dropped from the activism sub-line. |
| ~~§06 Form 144 · 10b5-1 · notices~~ | ✅ **RETIRED 2026-07-31 — the design deleted the card.** Prototype v4 gutted "Insider filings beyond Form 4": no dot calendar, no notices list, no `⤡ Expand`. We ported that, so there is nothing left to source. `ipBubbles` and its fourteen fabricated dots are gone from the codebase. |
| §06 supply events, acceptance-lag histogram | **Not ingested.** Acceptance timestamps are V3-P3 (`acceptanceDateTime`); the supply-event facts (S-1/S-3, SC TO, Form 25/15) have no ingest path today. |
| §07 Reference glossary | Static copy — legitimately stays as written. |

**The rule from D-literals:** phase 2 is not done until no literal remains. Where there is no source,
the honest outcome is an **N/A / empty state with a reason**, or removing the block — never a
plausible-looking number. Several of these are big enough to be their own decision; raise them
rather than inventing.

---

## Verification

- **`pytest`: 609 passed, 9 skipped** in Docker (`docker compose --profile test run --rm test`),
  including the 37 restored register tests.
- **`ruff`**: `register.py` clean on `E501,F,I,UP`. The remaining findings across `routes.py`/`tests`
  are **pre-existing house style** — master already reports 134 of the same classes, overwhelmingly
  `B008` (FastAPI's `Query()`/`Depends()` in defaults, the idiom this file uses throughout).
- **Driven live**, not just tested, against the seeded fixture on `:8010`:
  - `institutional-register?period=2026-03-31` → HHI 2827.3, effective holders 3.54, Gini 0.476,
    `managers_for_half` 2, 7 ingested filers, full `formula`/`cannot`/`population` present.
  - `institutional-register-shape` → turnover 133.3% (4 entrants / 0 exits over a 3-holder prior
    quarter), tenure capped at the 4 ingested quarters **and it says so in `reason`**, stable share
    0.390 flagged as a floor.
  - `institutional-filed-since` → 4 filings, `does_not_restate: true` with its reason, and
    `dates_are` naming the V3-P3 gap (filing dates, not acceptance timestamps).
  - **Honesty paths.** A quarter with no ingested filers returns `status: "na"` with the reason
    *"…a concentration measure would describe our coverage rather than the register"*, and **every
    derived number `null`** — `hhi`, `effective_holders`, `managers_for_half` all null, not `0`.
    An unresolved issuer (WMT) returns **404 with an explanation**, not an empty register.

---

## Handoff → Senior Frontend Engineer

Continue on **this branch**. The three endpoints above are live and shaped as documented. Two things
to hold onto:

1. **Surface `status`/`reason`, don't just read the number.** Every derived block can come back
   `na`, and the reason is written to be shown. A `null` must render as the N/A vocabulary, never
   as `0` and never as a blank styled like a value.
2. **The gap table is the real work.** Wiring the three endpoints covers §01–§03 and §05. §04 and
   §06 are largely unsourced, and each needs a decision — plumb, empty-state, or remove — not a
   surviving literal.
3. **One row is already answered.** Prototype v4 deleted §06's Form 144 / 10b5-1 card outright, and
   we took that change (2026-07-31). *The design removing a block is a valid third answer* — check
   the current prototype before building an honest empty state for something that may no longer
   exist. `5-design-port-log.md` run 11 has the full v3→v4 diff.

---

# Phase 2 · §03 — the backend for the three ruled gaps

**Stage:** Senior Backend Engineer → Senior Frontend Engineer · **Branch:** `v3-p5a-institutional`
**Status:** green and driven. **No `static/` file was touched.**

§03 is the only section whose CANNOT-SOURCE rows were big enough to be their own decisions. The
operator ruled all three on 2026-08-01 (**D-overlap · D-attribution · D-domicile**, in
`_active.md`); this is what got built for them, plus the one thing §03 needed that nobody had
flagged.

## What changed

| file | |
|---|---|
| `normalize/edgar_locations.py` | **new** — EDGAR's own 309-code `stateOrCountry` → place table |
| `normalize/overlap.py` | **new** — the cross-issuer manager-overlap moat (D-overlap) |
| `normalize/attribution.py` | **new** — three reported rows vs shares outstanding (D-attribution) |
| `normalize/register.py` | `lorenz` on `RegisterConcentration`; new `domicile()` (D-domicile) |
| `normalize/schema.py` · `sec/insider.py` · `storage/sqlite_insider_repository.py` | `is_derivative` on `InsiderTransaction` — see below |
| `storage/{company_profile,cusip,holdings}_repository.py` + SQLite impls | 3 bounded reads behind the interfaces |
| `api/routes.py` | +3 routes, `_shares_outstanding`, 3 caveat blocks |
| `scripts/seed_fixture.py` | a real peer group + option rows, so the populated paths are exercised |
| `tests/test_{overlap,attribution,section03_routes}.py` + `test_register.py` | **+55 tests** |

## The thing nobody had flagged: **the Lorenz curve had no source**

§03 draws a 61-point Lorenz curve, and `share_vector`'s `top` is capped at 100 rows — so on any
real register the curve could only ever have been drawn from a truncated head. `concentration`
now returns a **fixed 101-point `lorenz`**, computed from the *same ascending weights `gini` is*,
so the curve and the coefficient can never disagree and the payload does not grow with the
register. `status="na"` carries `lorenz: null` — **a flat line at zero would render as a real,
maximally-unequal register**, which is exactly the class of defect this project keeps paying for.

## The other thing nobody had flagged: **we were mixing options into insider ownership**

Forms 3/4/5 have a non-derivative table (owned stock) and a derivative table (options, RSUs,
warrants). `sec/insider.py` parsed both and **discarded which was which** — so a derivative row's
`shares_owned_after`, which counts the *underlying* shares of an instrument that is not owned
stock, was indistinguishable from a real holding. Any sum of insider ownership would have
reported options as shares.

`is_derivative` now rides on the row, set from the table it came from (the only reliable marker —
`security_title` is free text, and reading intent out of it would be Track 2). Two details matter:

* It is **`bool | None`**, and rows cached before the column existed read `None` = **unknown**.
  Defaulting those to `False` would have quietly readmitted exactly the option rows the field
  exists to keep out. The attribution drops unknowns and says so in the row's `reason`.
* A guarded `ALTER TABLE` migration, so an existing volume picks the column up without a rebuild.

⚠️ **This flag is now available to the existing insider views too, which do not yet use it.** Not
in scope here; worth a look.

## The JSON contract — three new endpoints

All `GET /v1/companies/{symbol}/…`, API-key gated, cache-aside over the operational store. **No
DuckDB on the request path**; every read is an indexed point/count read of the same character as
`/institutional-co-holding`.

### `institutional-holder-domicile?period=` (D-domicile)

```
period · prior_period
domicile { status, reason, formula, cannot, population,
           rows[] { place, country, holder_count, shares, weight, prior_weight },
           located_holder_count, unlocated_holder_count, unlocated_shares, coverage }
caveats[]
```

The **companion to the choropleth, not a replacement**. `institutional-holder-geography` buckets
for a MAP — `albers-usa` draws the 50 states + DC and nothing else, so every foreign filer lands
in one lump. This one *ranks*, so it resolves each code through EDGAR's own table and rolls
foreign filers up by country: **US filers rank by state, everyone else by country.**

Three things the UI must carry:
- **`prior_weight: null` means the place was not there last quarter — not 0%.** A zero-length tick
  drawn at the axis reads as "it collapsed" rather than "it is new."
- **`coverage`** is the honest headline: a ranking over 40% of the register is a statement about
  40% of the register. Filers we cannot place are counted separately and **never folded into a
  "rest of world" row** — that would turn our coverage gap into a finding.
- Locations come from `ingest/location_backfill.py`, so an unrun volume returns `status: "na"`
  with a reason naming the backfill.

### `institutional-share-attribution?period=` (D-attribution)

```
attribution { status, reason, formula, cannot, population,
              rows[] { key, label, source, shares, as_of, holder_count,
                       share_of_outstanding, reason },
              shares_outstanding, shares_outstanding_as_of, shares_outstanding_tag,
              rows_are_additive }
caveats[]
```

**Three rows, no residual, no total** — the operator's ruling, and the payload is shaped to make
breaking it obvious:

- **`rows_are_additive` is `false`, and there is no total field to render.** The rows are **not
  disjoint**: a holder above 5% files a 13F *and* a 13D/G, and a 10% owner is also an insider, so
  the same shares legitimately appear twice. **Do not stack these into a bar summing to 100%, and
  do not add them.** On the seeded fixture they already sum past 50% while overlapping heavily.
- **The residual row is gone and must not come back.** It was the only row that is a *subtraction*
  rather than a measurement. `cannot` carries the reason in prose so it survives outside the
  commit message, and a test asserts it.
- **Each row has its own `as_of`, and they do not line up** (13F quarter-end +45 days; Form 4 +2
  business days; 13D/G +10 days; shares outstanding on its own cover date). Show them.
- A row that filed nothing is `shares: null` **with a `reason`** — never 0. A missing denominator
  keeps the share counts and nulls only the percentages.

### `institutional-peer-overlap?period=&peers=&top=` (D-overlap)

```
overlap { status, reason, formula, cannot, population, peer_basis,
          issuers[] { cik, label, name, holder_count, is_focus },
          matrix[][],                       -- share of the ROW issuer's managers
          combinations[] { ciks, labels, manager_count }, combinations_truncated,
          holders[] { manager_cik, manager_name, weight, peers_held, peer_count, peer_labels } }
caveats[]
```

Feeds all three sub-blocks: the matrix, the UpSet `Set intersections` plot, and "largest holders,
and how many peers they also hold".

- **The matrix is ASYMMETRIC on purpose.** `matrix[i][j]` divides by the **row** issuer's manager
  count. Driven on the fixture: AAPL→peer reads `0.43`, peer→AAPL reads `1.00` — same pair, two
  different true statements. Rendering it symmetric would be a different and wrong claim.
- **The diagonal is `null`, never `1.0`** — "an issuer overlaps itself completely" is not a
  finding, and a full-strength cell would set the colour scale.
- **`combinations` are EXCLUSIVE** (each manager counted once, in the exact set it belongs to),
  ranked largest-first — that is what an UpSet plot needs.
- **`peer_basis` says how the peers were chosen**, in words, on the payload: SIC prefix, then
  ranked by the size of their own *ingested* register. That is coverage-dependent by construction
  and the caption should say so; a peer set whose basis the reader cannot see is a claim, not a
  comparison.
- `holders[].peer_count` travels with `peers_held` so the design's "4 of 5 peers" is renderable
  without the UI inventing the denominator.

**This is the most solid block in §03, and the caption should not undersell it.** That a manager
reported two issuers in the same quarter is stated outright by that manager's own 13F — this
intersects sets of filers, it does not infer a relationship. What stays derived is the *framing*
(who counts as a peer, and whether a shared holder means anything), and `cannot` carries the
honest reading: high overlap is usually **index construction**, not conviction.

## Verification

- **`pytest`: 675 passed, 9 skipped** in Docker (was 620 — **+55**).
- **`ruff` clean** on `E501,F,I,UP` for every file touched. The remaining repo findings are
  pre-existing house style, confirmed by re-running against a stashed tree.
- **e2e**: 44 shots. All three institutional shots `errors=0`. The only failures are the two
  pre-existing `sectorapp-company` 502s on `/sectors?view=company&symbol=900001`, a synthetic
  fixture CIK on pages this change never touches — errors=**8 / 13** against the 8 / 14 recorded
  in `_active.md`. The 14→13 is flake in a cascading 502, not a new signal; both shots were
  already red before this branch.
- **Driven live** on `:8010`, not just tested:
  - `holder-domicile` → PA 45.8% / MA 22.4% / NE 9.8% …, with `prior_weight` present for the
    three managers seeded in both quarters and **`null` for the four seeded only in the newest**.
  - `share-attribution` → 13F 2.86B (19.5%), insider 16.975M (0.12%), 13D/G 4.74B (32.3%) — three
    dates, **51.8% between two overlapping rows, which is exactly why there is no total**.
  - `peer-overlap` → 5 issuers, asymmetric matrix, 5 exclusive combinations, holders ranked by
    stake with `4 of 4` / `3 of 4` peer counts.
  - **Honesty paths**: an un-ingested quarter returns `status: "na"` with a reason and
    `lorenz: null`; a volume with no locations names `location_backfill` in its reason; an insider
    set whose rows all predate the flag returns `null` with *"cannot tell owned stock from
    options"* rather than a number.
- **Fixture extended** so the populated paths are real, not staged: the co-holding pool's CUSIPs
  now resolve to four SIC-35 peer issuers (the same managers already held them — only an *issuer
  identity* was missing), and every third insider filing carries an option row so the derivative
  exclusion is exercised rather than assumed. Two pool CUSIPs stay unresolved so the
  "candidate we cannot identify" path survives.

## Handoff → Senior Frontend Engineer

Continue on **this branch**. §03's five already-sourceable blocks need no backend at all:

| §03 block | endpoint |
|---|---|
| diverging flows + the 6-quarter table | `institutional-activity-series?quarters=6` (`inflow_shares` / `outflow_shares` / `net_shares`) |
| the four count tiles | same endpoint's `counts {new, added, reduced, exited}` |
| ranked share + cumulative + prior-quarter dotted line | `register.share_vector` + the prior quarter's register (`ipLoad` already holds it) |
| effective holders / HHI / Gini / **Lorenz** | `register.concentration` — `lorenz` is new |
| stable capital + cohorts | `register-shape.stable_capital` |

Four things to hold onto:

1. **`rows_are_additive: false` is not advisory.** No total, no stacked-to-100% bar, no "everything
   else" wedge on the attribution card.
2. **`prior_weight: null` and `lorenz: null` are not zeros.** Both would draw as confident,
   meaningful marks at the axis.
3. **Surface `coverage` and `peer_basis`.** They are the difference between a ranking and a claim.
4. **The peer labels are company NAMES, not tickers** — we reach peers by CIK, so there is no
   ticker to show. Budget for a longer label than the prototype's four-character `AVGO`, and run
   the clipping sweep **with the webfont blocked** (that is what caught §01's dumbbell).

---

# Phase 2 · §03 — the frontend

**Stage:** Senior Frontend Engineer → QA Tester · **Branch:** `v3-p5a-institutional`

**`IP03` is deleted entirely.** Unlike §01 — where two blocks survived because they stated a
filing RULE rather than a figure — not one value in §03 was a rule. All eight blocks are on real
endpoints, and the section's banner entry is gone (the warning now names three sections, §04–§06).

## What each block reads

| block | source |
|---|---|
| diverging flows + the quarter table | `institutional-activity-series` (`inflow`/`outflow`/`net`) |
| the four count tiles | the same `counts`, + `institutional-activity` grouped by action for the shares |
| ranked share + cumulative + prior line | `register.share_vector` + the prior quarter's register |
| effective holders · Lorenz · the trend | `register.concentration` (incl. the new `lorenz`), per quarter for the series |
| manager domicile | `institutional-holder-domicile` |
| peer matrix · UpSet · holder list | `institutional-peer-overlap` |
| where every share sits | `institutional-share-attribution` |
| stable capital + cohorts | `register-shape.stable_capital` + `.tenure` |

## Two literals became computations, not new literals

- **The treemap is now a real squarify** (Bruls/Huizing/van Wijk). Phase 1 carried the
  prototype's eleven rectangles as recovered geometry because reimplementing squarify would not
  have reproduced its capture cell-for-cell; with real weights there is nothing to reproduce.
  ✅ **This CLOSES listed deviation D3** — the lightbox now re-squarifies at the dialog's own
  aspect instead of scaling the card's layout, which is what the prototype did all along.
- **The Lorenz abscissae are computed.** They were fitted to the capture (`x0 = 38.24`,
  `step = 4.2384` over 61 points, stopping short of the axis with a final jump). The API returns
  the curve at even population fractions including both endpoints, so x is simply the fraction of
  managers and the curve reaches the corner on its own.

## Defects found and fixed while building

1. **Peer-matrix labels clipped on both axes.** Column headers collided and row headers ran off
   the LEFT of a clipping viewBox — the prototype's labels were four-letter tickers, ours are
   registrant names. Fixed in two parts: **`tickers_for()` on `TickerCache`** so a peer reached by
   CIK is labelled with its symbol where SEC's map has one (a matrix axis has room for `NVDA`, not
   `NVIDIA CORPORATION`), and `ipFitMatrix()` measuring with `getComputedTextLength()` after
   paint, trimming to the cell, with the full name on `<title>`.
2. **The fitter's own first cut made it worse.** It restored the *full* name before measuring and
   bailed out on an unmeasurable width — leaving the longest possible string in a viewBox that
   clips. It now measures first and only widens if the result fits.
3. **⚠ The fitter silently no-opped, because the matrix lives inside the EXPANDER.** SVG text in a
   `hidden` container has no layout, so `getComputedTextLength()` returns `0` and every
   measure-and-fit pass quietly does nothing. The only moment it can be measured is the moment it
   becomes visible, so the expander's own handler now calls it. *(This is the documented "a chart
   built inside a hidden container measures 0" trap, in a new place.)*
4. **Treemap labels overflowed their cells and collided.** Same measure-and-trim, per cell, plus
   dropping the label from a cell too small to hold one.
5. **`0` where a measured zero belonged.** "Exited: 0 managers · N/A of shares" — if zero managers
   exited, the shares they moved is a measured **0**, not unknown. (The inverse of the usual
   defect, and just as wrong.)
6. **`0%` where an UNREACHABLE value belonged.** With four ingested quarters nobody can appear in
   the "8+ quarters" tenure cohort, however long they have actually held — so `0%` reported a
   limit of our coverage as a finding about the register. Cohorts whose minimum exceeds
   `quarters_observed` now read **N/A with a chip**, and the caption says how many and why.
7. **A pre-existing duplicate:** `IP_DERIVATIONS["02-topten"]` was defined **twice**, the second
   silently overriding the more careful first. Removed the duplicate.
8. **Two captions that had become false on real data:** the ranked-share lightbox note claimed
   "prior quarter ghosted" whether or not a prior quarter is ingested, and the UpSet note listed
   every issuer by full name (a paragraph, with real names). Both now follow the data.

## Deviations — listed, not silent

- **🔶 NEW: the "Residual over time · TREND" foot is GONE, with its trend panel.** It belonged to
  the unreported-residual row that **D-attribution removed**; a trend of a number we no longer
  stand behind would be worse than the row was. The foot now carries the **denominator** every bar
  is drawn against, with its own as-of date. *This is a consequence of the operator's ruling, not
  an independent design change — but it is a visible change to an accepted rendering, so it needs
  a look.*
- **The `Effective holders` stat is only a control when there is a trend behind it.** With one
  ingested quarter there is no series, so the stat renders plain rather than as a clickable
  affordance that opens nothing (D-behaviour).
- ✅ **D3 (the scaled-not-re-squarified treemap) is CLOSED** — see above.

## Verification

- **`pytest` 675 passed, 9 skipped** (unchanged — `tickers_for` is additive).
- **`p2-clip-sweep.js`: `svgOverflow=0 domBleed=0` on AAPL and JPM, webfont LOADED *and*
  BLOCKED.** That is the condition that caught §01's dumbbell and would have caught the matrix.
- **`p2-drive-03.js` (new, committed): 10 controls, 0 failures** — the expander, both view
  toggles *and their return*, `⤡ Expand` in **both** overlap views (view-aware title), the two
  remaining chips, the effective-holders stat, and an orphan check. Every assertion reads the
  **resulting** chart/note/pressed-state, never that a click was accepted.
- **`p2-drive-controls.js` (§02): 0 failures** — no regression.
- **`p2-chips.js`: `violations: []`** — the D-chips invariant still holds.
- **`p2-inert.js`: `derivesWithNoPanel: []`.**
- **`p2-read-section.js` on §03: `zeros: []`** for AAPL; JPM (no locations, no peers) renders two
  honest empty states with reasons plus four N/A chips.
- Screenshots eyeballed at DPR 2 in all three states (collapsed / expanded / treemap).

## For QA

1. **The attribution card must never gain a total.** Three bars against shares outstanding, each
   with its own as-of date; they overlap and do not sum (on the fixture they already exceed 50%
   between two rows that share holders). Any stacking or 100% framing is a defect.
2. **`N/A` vs `0` cuts both ways here.** "Exited 0 · 0 of shares" is correct (a measured zero);
   "8+ quarters N/A" is correct (unreachable, not empty). Probe a single-quarter issuer.
3. **Peer labels.** The fixture's synthetic peers have no SEC ticker, so they fall back to trimmed
   names — that is the intended fallback. Hover any matrix label: the full name is on `<title>`.
4. **JPM is the empty-state company** (no cover-page locations, no ingested SIC peer).
5. Both themes, and the section at 1280 as well as 1440.

---

## ⚠️ Post-handoff: a crash, and the page-load time (2026-08-01)

Reported by the operator: *"the page load is taking forever"*, with a console trace.

### The crash — mine, and it was the whole story

```
TypeError: can't access property "map", values is null
  at path → ipRankedShare → ip03WhoHolds → ipSection03
```

`ipRankedShare` called `path(spec.prior)` unconditionally. Phase 1's prior series was a literal
and always present; phase 2's is **null whenever the prior quarter's register is not available** —
which happens on a failed or not-yet-landed older-quarter fetch, and now also on the first
progressive paint. §03 threw, so it never rendered at all: the "forever" was a section that was
never going to appear, not a slow one. The ghost line is now omitted rather than drawn from
nulls — a dotted line along the axis would draw a prior register that was never read.

**Measured on the real 7.7 GB volume (1.15M raw facts, 50.2M holdings rows): §03 `>90s` → 4.4s.**

### What the timing actually showed

The first diagnosis was wrong and worth recording as a trap: the host's `data/secfin.db` is
**empty**, so it looked like the `api` container had no data and every read was a cache-miss to
SEC. It does not use that file — `SECFIN_DB_PATH=/app/data/secfin.db` is on the `secfin-data`
**volume**, and that one is 7.7 GB. *Check the volume, not the host directory.*

Served sequentially and warm, the nine primary endpoints total ~3.4s and none is pathological
(register 0.02s, domicile 0.10s, peer-overlap 0.10s, attribution 0.24s, shape 0.79s,
holdings-series 0.73s, activity-series 1.28s). Fired **concurrently** they each take ~3s — they
serialise, because the handlers are `async def` but their store reads are synchronous, so
concurrent requests take turns on the event loop. That is the **pre-existing** single-process
constraint (CLAUDE.md: no `--workers`, the in-memory token bucket assumes one process), not
something §03 introduced — but §03 did add four calls to the pile.

### Two changes on top of the crash fix

1. **Progressive paint.** `ipLoad` used to `Promise.all` everything and repaint once, so the whole
   view waited on the slowest of sixteen. Each response now repaints only the sections that read
   it (`ipRepaintSection`), which **never touches a section the reader is inside** (an open
   expander would slam shut — `ipPaint` rebuilds `#view` wholesale) and never repaints under an
   open dialog.
2. **A pending sentinel, `IP_PENDING`.** Progressive paint created a new way to lie: a section
   repainted mid-load would render its honest EMPTY state ("no adjacent pair has been ingested")
   for a block that is simply still in flight. `IP_PENDING` distinguishes *not answered yet* from
   *answered, and empty*, and a pending block renders "Reading the filings…" with no status chip —
   **a value we have not asked for yet is not `N/A`.**
3. The four older-quarter register calls are **deferred** until the primary nine settle. They feed
   enhancements only (§02's over-time charts, §03's ghost line and effective-holders trend), so
   they should not compete with the calls the first paint needs.

### Where it lands, and what is still open

| | before | after |
|---|---|---|
| §03 renders at all | **never** (threw) | ✅ |
| first real content | — | **2.9s** |
| everything settled | — | **5.4s** |
| page errors | 1 | **0** |

🔶 **Still open, and NOT for this task:** ~3–5s on a whole-market volume is the floor while 13
concurrent requests serialise on one event loop. Getting below it means either a composite
endpoint for this view or moving store reads off the loop — both are real architectural changes,
and single-process is a deliberate constraint. **Flagging, not fixing.**
