# Roadmap — Plumbing the React app (`clearyfi_frontend`) onto real filings data

**Status:** proposed, not started. **Owner:** operator-gated, section by section.
**Scope of this document:** the **Company Hub → Overview** page, card by card. Every other page is
sequenced at the end but not yet enumerated.

---

## The four rules this roadmap is written under

1. **Every UI section gets plumbed with real data.** No section stays synthetic.
2. **No layout change.** The accepted design is fixed. Markup, grid, card order, class names and
   copy structure stay exactly as ported. Plumbing changes what fills a slot, never the slot.
3. **No assumptions.** Where a card's data does not exist today, this doc says *how to verify* it
   — a concrete check against a real filing — and what the **build options** are, with their
   trade-offs. It does not guess.
4. **No card is dropped.** A card whose data is unavailable renders its honest state *in place*
   (see "The no-drop contract"), keeping its slot in the grid.

We start at **Company Hub → Overview** and go section by section: 01 → 08, plus the breadcrumb,
the "What changed this filing" band, and the filing-timeline rail.

---

## Disposition bands

Every card below carries one. This is the whole vocabulary:

| band | meaning | cost |
|---|---|---|
| **P — Plumb** | An endpoint exists and is shipped. Wire it. | frontend only |
| **M — Map** | The fact is **already in `raw_facts`** (the bulk backfill stores ~500–700 us-gaap tags per company). It needs a canonical concept in `normalize/mapping.py` and a route. **No new ingest.** | small backend |
| **D — Dimensional** | Needs axis-bearing facts (ASC 280 segments, class-of-stock, by-line-item). Extends the **existing, proven** `ingest/dimensional_backfill.py`. | medium backend |
| **X — New source** | Needs a source we do not ingest at all (EX-21 exhibit, DEF 14A tables, XBRL instance *text* facts, PCAOB). Each needs an operator ruling before build. | new pipeline |
| **T — Track 2** | Free narrative text. `CLAUDE.md` guardrail 1 says flag, do not build. The card still renders — see the no-drop contract. | not built |

---

## Evidence this roadmap rests on

Checked live on **2026-08-02** with our compliant `SEC_USER_AGENT`, not asserted from memory.

**`/submissions/CIK0000320193.json` (Apple) carries, as structured JSON:**
`name` · `sic` · `sicDescription` · `tickers` · `exchanges` · `ein` · `category` (filer status) ·
`fiscalYearEnd` · `stateOfIncorporation` · `addresses` (HQ) · `phone` · `formerNames` ·
`entityType` · `ownerOrg`.
It does **not** carry NAICS, employee count, or auditor.

**`filings.files` is real and non-empty.** Apple's recent window holds 1,000 filings; a second
JSON holds **1,238 more, 1994-01-26 → 2015-05-30**. Full filing history *is* reachable — which
both unblocks "First 10-K" and is the answer to §06's rolling-window caveat.

**`companyfacts` is numeric-only, and this is now measured, not assumed.** Apple's payload carries
exactly **two** `dei` tags (`EntityCommonStockSharesOutstanding`, `EntityPublicFloat`).
`AuditorName` and `AuditorFirmId` are **absent** — they are *text* facts, and text facts do not
appear in companyfacts at all. (`EntityNumberOfEmployees` is absent here too, but **V1 later found
it on the volume for one filer of 8,919** — it is a real, near-unused numeric tag, not an
excluded one. See V1.)

**Tag coverage varies by filer, and that is the central design fact for sections 02 and 07:**

| tag | Apple (503 tags) | Intel (684 tags) |
|---|---|---|
| `InventoryRawMaterialsNetOfReserves` | no | **yes** |
| `InventoryFinishedGoodsNetOfReserves` | **yes** | **yes** |
| `LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo` | **yes** | — |
| `EffectiveIncomeTaxRateReconciliation…` | **yes** | — |
| `ContractWithCustomerLiability` | **yes** | — |
| `RevenueRemainingPerformanceObligation` | no | **yes** |
| `RestructuringCharges` / `RestructuringReserve` | no | **yes** |
| `PurchaseObligation` | no | no |
| `LossContingencyAccrualAtCarryingValue` | no | no |

Two consequences, both load-bearing:

- **A missing tag is a per-filer fact, not a product gap.** Apple genuinely does not tag raw
  materials. The card must render `N/A` with a reason naming the filer, never `0`, and never
  disappear.
- **Absence in two filers is not absence in the market.** `PurchaseObligation` and
  `LossContingency*` missing from both was a *signal to widen the basket*, not a verdict —
  **V1 has since done that, and both tags are real and used.** See the V1 result below.

---

# V1 — basket tag-coverage query · RESULT (run 2026-08-02)

Read-only query against the live `stock_profiler_secfin-data` volume. No network.
Script: `v1_coverage.py` (stratified basket + "what filers tag instead" per family).

## ⚠️ The finding that outranks the tag question

**The whole-market bulk backfill has not run on this volume.**

| measure | value |
|---|---|
| raw facts | 1,153,678 |
| companies with any facts | 8,919 |
| companies with **≥ 50** distinct tags | **72** |
| companies with ≥ 150 distinct tags | 59 |
| companies with ≥ 500 distinct tags | 18 |

`CLAUDE.md` names this exact state: a volume seeded by `frames_backfill` (6 headline concepts)
plus the daily incremental is **headline-concepts-only**, and `python -m secfin.ingest.backfill`
is "the ONLY path that ingests the full ~500-tag payload per company."

**Two consequences:**

1. **This is now a Phase 0 prerequisite, not a Phase B detail.** Phases A and B are still correctly
   *sized* — the work is mapping, not ingestion — but **neither can render for more than ~72
   companies until the bulk backfill runs.** That is an ops task (~20k companies, 120M+ facts,
   sizeable volume growth), and it gates the whole page.
2. **The percentages below are a near-census of the 59 deeply-ingested filers, not a market
   sample.** They should be re-run after the backfill. They are reported here because the *shape*
   of the answer — which tags filers actually use — does not depend on basket size, and that shape
   is what converts an `M?` into an `M` or a `T`.

**Basket:** 45 filers across 26 two-digit SIC groups (3 per group, from the 59 eligible).
**Deep basket:** the 18 filers with ≥500 tags — Apple, Alphabet, Amazon, Microsoft, NVIDIA, Tesla,
JPMorgan, Bank of America, Mastercard, PayPal, Target, Coca-Cola, Conagra, ASML, Akamai, Elevance,
AngioDynamics.

## Coverage, and the skew that matters

Coverage is **systematically higher on fully-tagged filers**, so the 45-filer column reads as a
floor and the 18-filer column as the realistic ceiling for large caps:

| card | best candidate tag | N=45 | N=18 (deep) | verdict |
|---|---|---:|---:|---|
| 2.12 ETR reconciliation | `…AtFederalStatutoryIncomeTaxRate` | 95.6% | **100%** | **M — strongest on the page** |
| 4.1 Share roll-forward | `CommonStockSharesIssued` | 95.6% | 94.4% | **M** |
| 2.18 Leases — liability | `OperatingLeaseLiability` | 82.2% | — | **M** |
| 4.2 Dilution overhang | `…OptionsOutstandingNumber` | 77.8% | — | **M** |
| 4.3 Buyback — paid | `PaymentsForRepurchaseOfCommonStock` | 75.6% | — | **M** |
| 2.18 Leases — discount rate | `…WeightedAverageDiscountRatePercent` | 73.3% | — | **M** |
| 2.9 Inventory — total | `InventoryNet` | 73.3% | 66.7% | **M** |
| 2.10 Debt ladder | `…RepaymentsOfPrincipalInYearTwo` | 60.0% | **88.9%** | **M** |
| 2.14 Allowance | `AllowanceForDoubtfulAccountsReceivableCurrent` | 55.6% | 61.1% | **M** |
| 2.13 Deferred revenue | `DeferredRevenueCurrent` | 53.3% | 44.4% | **M** |
| 4.3 Buyback — authorized | `StockRepurchaseProgramAuthorizedAmount1` | 31.1% | **55.6%** | **M** (I predicted `T` — wrong) |
| 2.9 Inventory — components | `InventoryRawMaterials` | 26.7% | 33.3% | **M**, per-filer `N/A` |
| 7.3 Restructuring | `RestructuringCharges` | 35.6% | **55.6%** | **M** |
| 2.8 RPO | `RevenueRemainingPerformanceObligation` | 28.9% | **44.4%** | **M**, thin |
| 7.1 Legal accrual | `LossContingencyAccrualAtCarryingValue` | 24.4% | 38.9% | **M**, thin |
| 7.4 Guarantees | `GuaranteeObligationsMaximumExposure` | 11.1% | 33.3% | **M**, very thin |
| 7.2 Purchase commitments | `ContractualObligation` | 17.8% | 27.8% | **M**, fragmented — see below |
| 2.16 R&D capitalization | `CapitalizedComputerSoftwareNet` | 4.4% | **5.6%** | **effectively `N/A`** |

## What the "what filers tag instead" pass changed

This is the half that mattered. **Five of my named candidates were the wrong variant:**

- **2.18 lease term — `OperatingLeaseWeightedAverageRemainingLeaseTerm1` is `0/45`, and matches
  *nothing on the entire volume*.** Not an ingest bug: `Year`-unit facts are stored (63 of them),
  and the *discount rate* sibling has 73% coverage. The term is an ISO-8601 duration-typed fact,
  not a decimal, so it is structurally absent from companyfacts — **the same class of exclusion as
  text facts.** The card's "weighted-average term" field renders `N/A` with that reason.
- **4.1 — `StockRepurchasedDuringPeriodShares` (46.7%) beats `StockRepurchasedAndRetiredDuringPeriodShares`
  (24.4%).** Map both.
- **2.9 — the plain `InventoryRawMaterials` / `InventoryWorkInProcess` (26.7%) beat the
  `…NetOfReserves` variants (17.8%)** I had guessed. Map both.
- **2.14 — the CECL-era `AccountsReceivableAllowanceForCreditLoss*` tags are `0/45`;** the legacy
  `AllowanceForDoubtfulAccounts*` family carries it. Map the legacy names.
- **4.3 — `StockRepurchaseProgramAuthorizedAmount1` (31.1%) and the un-suffixed
  `StockRepurchaseProgramAuthorizedAmount` (22.2%) are both live.** Map both; they union to ~50%.

**2.12's real reconciliation rows are now known** and should drive the card instead of the
prototype's invented ones: state & local taxes (68.9%), change in deferred tax asset (68.9%),
other adjustments (62.2%), non-deductible expense (42.2%), change in enacted rate (40.0%), tax
contingencies (31.1%), tax credits (28.9%).

**7.2 is the fragmentation case.** No single tag clears 18%, but eight do exist —
`PurchaseObligation`, `UnrecordedUnconditionalPurchaseObligationBalanceSheetAmount`,
`ContractualObligation`, plus five anniversary-keyed variants at ~9% each. Mapping the union is
what this card needs; the ceiling is still modest.

## Three cards this pass resolved that were not on the V1 list

- **`EntityNumberOfEmployees` exists on the volume — for exactly one company of 8,919.** So §01.10
  is not "structurally absent" as I wrote above: the tag is real and virtually unused. **`N/A` with
  a reason is correct, and the reason changes** from "not a numeric fact" to "almost no filer tags
  it." Corrected in the §01 table.
- **`NumberOfReportableSegments` (19 filers) and `NumberOfOperatingSegments` (16)** are tagged —
  which gives §03 a segment *count* without any dimensional work, and fills the Peers view's
  `segmentCount`.
- **`RestructuringAndRelatedCostNumberOfPositionsEliminated`** is tagged — that is §07.3's "Scope:
  N positions" tile, which I had not expected to be structured.

## V1 verdict

**No card moved to Track 2. Every `M?` on the page is confirmed `M`** — the tags exist and filers
use them, at rates from 100% down to 5%. The work is mapping, exactly as Phase B assumed.

**Two adjustments to the plan:**

1. **The bulk backfill is now Phase 0.5's real content**, ahead of any mapping work.
2. **§07 should be sequenced last within Phase B.** *(Done 2026-08-04, and the prediction held:
   three of four cards shipped, and most filers render `N/A`.)* Its four cards land at 11–36% coverage on the
   broad basket, so most filers will show `N/A` — which is *honest and correct*, but it is the
   lowest-yield part of the phase and should not lead it. §02's footnote cards (55–100%) should.

---

# V2 — is the DEF 14A inline-XBRL tagged? · RESULT (run 2026-08-02)

Fetched with our compliant User-Agent: Apple's DEF 14A (`0001308179-26-000008`, filed 2026-01-08)
and NVIDIA's (`0001045810-26-000036`, filed 2026-05-12), both extracted instances read directly.

## ✅ Yes — and it carries NUMERIC facts, not just text blocks

**The `ecd` taxonomy (`http://xbrl.sec.gov/ecd/2025`) is present**, and the pay-versus-performance
figures are tagged as real numeric facts, five to six years deep, on both filers:

| element | Apple | NVIDIA |
|---|---|---|
| `ecd:PeoTotalCompAmt` | `74,294,811` (Cook) | `36,343,830` (Huang) |
| `ecd:PeoActuallyPaidCompAmt` | `108,423,733` | `162,180,936` |
| `ecd:NonPeoNeoAvgTotalCompAmt` | `23,812,358` | ✓ |
| `ecd:TotalShareholderRtnAmt` | `233.88` | `1,445.67` |
| `ecd:PeerGroupTotalShareholderRtnAmt` | `279.51` | ✓ |
| `ecd:CoSelectedMeasureAmt` / `…Name` | `416,161,000,000` · "Net Sales" | ✓ · "Non-GAAP Operating Income" |
| `ecd:AdjToCompAmt` | 12 facts (the total→CAP bridge) | ✓ |

**Tagging began with FY2024.** Apple's DEF 14A carries `isInlineXBRL=1` for 2024, 2025 and 2026,
and `0` for 2023 and every year before — the pay-versus-performance rule's phase-in. **Three years
of history, not more.**

## The instances are small — this is a cheap fetch path

**119 KB (NVIDIA) and 181 KB (Apple)**, one per filer per year. That is a fraction of a
companyfacts payload and nothing like the 28.4 MB N-PX problem.

**But `ecd` does not reach companyfacts.** Apple's companyfacts carries `dei` + `us-gaap` only.
This is *not* a taxonomy filter — Intel's companyfacts carries `dei`, `invest`, `us-gaap` **and
`ffd`** — it is that DEF 14A facts do not feed the companyfacts API at all. **A new fetch path is
required**, reading the filing's extracted instance from its EDGAR directory. It is the same
shape as `sec/insider.py`: discover the accession from `/submissions/`, fetch one document, parse.

## ⚠️ What the tagged DEF 14A does NOT carry — verified on both filers

| card | field | present? |
|---|---|---|
| §05.3 | CEO **total compensation** | ✅ **yes** — 5 years |
| §05.3 | Pay **mix** (salary / bonus / stock / option / other) | ❌ **no** — that is the Summary Compensation Table, outside the PvP tagging rule |
| §05.3 | CEO **pay ratio** | ❌ **no** — no `Ratio` element in either filing |
| §05.3 | **Say-on-pay support %** | ❌ **no** — that is 8-K Item 5.07, the standing HTML exclusion |
| §04.6 | Insider ownership % (beneficial ownership table) | ❌ **no** |
| §05.2 | Board composition (size / independence / tenure) | ❌ **no** |
| §06.3 | Audit fees / non-audit % | ❌ **no** |

**So V2 splits the DEF 14A cluster rather than resolving it.** Three of the four cards stay `X`
**— now verified, not assumed.** Only §05.3 moves, and only partially.

## A capability V2 found that was not being looked for

The `ecd` taxonomy also carries **boolean governance flags**, tagged and machine-readable:

`ecd:InsiderTrdPoliciesProcAdoptedFlag` · `ecd:AwardTmgMnpiCnsdrdFlag` ·
`ecd:AwardTmgPredtrmndFlag` · `ecd:MnpiDiscTimedForCompValFlag`

These state whether the company has adopted insider-trading policies, and whether option awards
were timed around material non-public information. **That is a structured governance signal no
part of this design currently asks for**, and it lands in the same fetch as §05.3. Worth putting
in front of the operator rather than discarding.

## V2 verdict and the ruling it forces

**§05.3's card cannot be filled as designed.** It has four-to-five mix bars plus a footer of
total / ratio / say-on-pay. We can fill **the total and nothing else**.

Options — **operator ruling required**, because rule 2 forbids re-laying-out the card and rule 4
forbids dropping it:

- **(a) Fill the total; the mix bars and the two footer stats take their honest states.** Truthful,
  but a "pay mix" card with no mix is a card whose title promises what it does not deliver.
- **(b) Re-point the card at the pay-versus-performance series** — total compensation vs
  compensation *actually paid* across five years, which fits the existing bar-list layout exactly
  and is a *stronger* disclosure than the mix. **The layout is untouched; the card's subject
  changes.** Whether that counts as a layout change is the operator's call, not mine.
- **(c) Hold the card in its empty state** until a Summary-Compensation-Table source exists.
  Note that no such structured source is known — the SCT is not tagged.
- **Recommendation: (b)**, with (a) as the fallback. Compensation-actually-paid vs TSR is the
  disclosure the SEC deliberately made machine-readable, and it is comparable across filers in a
  way the mix is not.

**Sequencing note:** §05.3 should be built **with** §06.1's auditor question, not before it. Both
want the same new capability — read one document out of a filing's EDGAR directory — and building
that path twice would be waste. V3 decides whether §06.1 can ride along.

---

# V3 — do 10-K instance documents carry `dei:AuditorName` / employees? · RESULT (2026-08-02)

Apple's FY2025 10-K (`0000320193-25-000079`, 1.42 MB instance) and NVIDIA's FY2026 10-K
(`0001045810-26-000021`, 1.69 MB instance), both extracted instances read in full.

## ✅ The auditor is tagged. Employees are not.

| fact | Apple | NVIDIA |
|---|---|---|
| `dei:AuditorName` | **Ernst & Young LLP** | **PricewaterhouseCoopers LLP** |
| `dei:AuditorFirmId` | **42** | **238** |
| `dei:AuditorLocation` | San Jose, California | San Jose, California |
| `dei:EntityNumberOfEmployees` | **absent (0 occurrences)** | **absent (0 occurrences)** |

**`AuditorFirmId` is the PCAOB firm ID.** That matters beyond the name: it is the join key to
PCAOB Form AP, so if auditor *tenure* (§06.2) is ever wanted, the identifier to join on comes free
with the name.

**§01.10 Employees is now settled, and the answer is `N/A`.** V1 found the tag on **1 filer of
8,919**; V3 finds it in **neither** 10-K instance. It is a real element that virtually nobody
tags. The card renders `N/A` with that reason — **not** "we do not ingest it", which would be
false, and not `0`, which would be a lie.

## Three cards this pass unblocked that were not on V3's list

The 10-K instance carries **two taxonomies beyond `dei`/`us-gaap`**, and both are Track 1 booleans.

### `cyd` — the Cybersecurity Disclosure taxonomy (§08.3)

Fifteen `cyd` facts in Apple's 10-K. Ten are TextBlocks (prose — Track 2, do not use). **Six are
flags, and they are exactly what §08.3's card asks for:**

| flag | Apple | NVIDIA |
|---|---|---|
| `CybersecurityRiskMateriallyAffectedOrReasonablyLikelyToMateriallyAffectRegistrantFlag` | `false` | `false` |
| `CybersecurityRiskManagementProcessesIntegratedFlag` | `true` | `true` |
| `CybersecurityRiskManagementThirdPartyEngagedFlag` | `true` | `true` |
| `CybersecurityRiskManagementPositionsOrCommitteesResponsibleFlag` | `true` | — |
| `…ResponsibleReportToBoardFlag` | `true` | — |
| `CybersecurityRiskThirdPartyOversightAndIdentificationProcessesFlag` | `true` | — |

**§08.3's "incident" line and "governance" line both become structured.** The **"framework" line
(NIST CSF / ISO 27001) is not a flag and stays Track 2.**

Note this is a *better* source than the 8-K Item 1.05 existence check already planned: Item 1.05 is
filed only when an incident occurs, so its absence is ambiguous. The `cyd` flag is an **affirmative
`false`** — the registrant stating no material effect. A checked negative, not an unchecked one.

### `ecd` in the 10-K — 10b5-1 trading-arrangement flags (§05.5)

`Rule10b51ArrAdoptedFlag` (NVIDIA `true`, Apple `false`) · `Rule10b51ArrTrmntdFlag` ·
`NonRule10b51ArrAdoptedFlag` · `NonRule10b51ArrTrmntdFlag` · `InsiderTrdPoliciesProcAdoptedFlag`.

Whether **any** director or officer adopted or terminated a trading arrangement in the period.

> ⚠️ **CORRECTED 2026-08-05. This DOES overturn D-10b5-1, and the paragraph below was wrong.**
>
> V3 read the four flags and stopped there, concluding "a period-level boolean, not a plan
> adoption date". The `ecd` taxonomy carries much more in the same instance, hung off
> `ecd:IndividualAxis` with one member per person: `TrdArrIndName`, `TrdArrIndTitle`,
> **`TrdArrAdoptionDate`**, `TrdArrTerminationDate`, `TrdArrExpirationDate`, `TrdArrDuration` and
> `TrdArrSecuritiesAggAvailAmt`. Verified across eight filers — JPMorgan discloses ten named
> officers with dates, Amazon seven, NVIDIA two, Apple and Coca-Cola none.
>
> The original claim, that we can never state when a plan was adopted, is true of **Form 4's
> `aff10b5One` box** and false of **Item 408(a)**. See `sec/trading_arrangements.py`.

~~**This does not overturn D-10b5-1** — it is a period-level boolean, not a plan adoption *date*,
so a cooling-off band still cannot be drawn.~~

### `dei:IcfrAuditorAttestationFlag` — and what it does NOT say

`true` on both filers. **It means the ICFR is subject to auditor attestation. It does not say ICFR
was effective, and it does not say there was no material weakness.** §06.7 stays Track 2. Recording
it here so nobody later mistakes this flag for the Item 9A conclusion — that substitution would be
exactly the kind of over-claim this roadmap exists to prevent.

## Cost, and the one open question about it

One document per 10-K, **1.4–1.7 MB**. Everything above comes from that single fetch — auditor,
cybersecurity flags, 10b5-1 flags, and the complete cover-page `dei` set (filer category, public
float, shares outstanding, incorporation state, file number, exchange, security title).

At whole-market scale that is roughly 7,000 annual filings × ~1.5 MB ≈ **10 GB of transfer per
year**, bounded to latest-10-K-per-company. Tractable, but not free, and it should be a bounded
backfill with a single writer (guardrail 8) rather than a cache-aside read.

**Two cheaper routes are worth checking before committing to that** — see V3b and V3c below.
**`bulk/submissions.zip` (1.55 GB) is already on the volume**, downloaded and unparsed
(`CLAUDE.md` earmarks it for the M2.5 13F ingest). It carries the cover-page *metadata* for every
filer, which covers §01's profile card at whole-market scale with **no per-company API calls at
all** — but it does **not** carry `AuditorName`, which lives in the instance.

## V3 verdict

- **§01.9 / §06.1 auditor — buildable, verified.** Name, PCAOB firm ID and location, both filers.
- **§01.10 employees — settled as `N/A`.** Not a gap in our ingest; filers do not tag it.
- **§06.2 auditor tenure — still `X`**, but `AuditorFirmId` supplies the PCAOB join key.
- **§08.3 cybersecurity — two of three lines become Track 1.**
- **§05.5 — ~~gains a truthful flag; D-10b5-1 still stands~~. CORRECTED 2026-08-05: the same instance carries names, titles and ADOPTION DATES. D-10b5-1 is overturned; §05.5 is built.**
- **§06.7 ICFR — stays Track 2.** The attestation flag is not the effectiveness conclusion.

**The instance-parse path now pays for six cards across four sections, not one.** That changes the
recommendation in §01.9 above: building it for the auditor alone was poor value, and I said so.
Building it once for auditor + cybersecurity + 10b5-1 + cover page is a different trade.

---

# V4 — does `sec/insider.py` retain `officerTitle`? · RESULT (2026-08-02)

Local read of `sec/insider.py`, `normalize/schema.py`, `storage/sqlite_insider_repository.py`,
and a query over the volume's **163,189** cached insider rows. No network.

## ✅ Yes — but flattened into a composite string, and the flattening is lossy

`officerTitle` **is** parsed (`_relationship_label()`, `sec/insider.py:98`), **is** stored
(`insider_transactions.owner_relationship`), and **is** served (`InsiderTransaction.owner_relationship`).
**0 of 163,189 rows are NULL.** So §05.1 option (b) has the data.

The problem is the shape. `_relationship_label()` joins every role with `", "`:

```
'director'                                        52,525 rows
'officer (Chief Financial Officer)'                4,973
'director, officer (Chief Executive Officer)'      4,607
'director, officer (Chief Executive Officer), 10% owner'   1,856
```

**The title is free text, and it frequently contains the same `", "` used as the separator.**

| | |
|---|---|
| distinct values containing a paren | 5,355 |
| **of those, ambiguous on a `", "` split** | **1,900 (35%)** |

Real examples from the volume:

```
'director, officer (Acting CFO, President)'
'director, officer (CEO, Acting CFO, Chairman)'
'director, officer (CEO (Resigned on July 6, 2017)), 10% owner'   <- nested parens + a date comma
'10% owner, other (See footnotes 3, 5, 7 and 8)'
```

**A client that regexes `officer \((.*)\)` out of this field is wrong on roughly a third of
titles.** The roles are separate elements in the source XML (`isDirector`, `isOfficer`,
`officerTitle`, `isTenPercentOwner`, `isOther`) — the ambiguity is created by *our* join, not by
EDGAR.

## §05.1 option (b) is confirmed viable — with one backend change

**Form 3 volume supports the premise:** 12,581 Form 3 rows plus 741 3/A on the volume. A new
officer files a Form 3 within 10 days, so arrivals are genuinely covered.

**Required change — small, and precedented.** Add structured fields alongside the display string:

```python
officer_title: str | None = None        # the raw officerTitle, unjoined
is_director: bool | None = None
is_officer: bool | None = None
is_ten_percent_owner: bool | None = None
```

Parsed straight from the XML elements that `_relationship_label()` already reads, so no new fetch
and no new source. `owner_relationship` stays exactly as-is for existing consumers.

**`None` means UNKNOWN, not "no"** — rows cached before the columns existed carry no value, and
defaulting them to `False` would assert "not an officer" about rows nobody classified. This is the
identical pattern to `is_derivative` and `rule_10b5_1`, both added 2026-08-01 for the same reason.

## One honesty note for the role column

**`'officer (See Remarks)'` appears on 1,677 rows.** That is an EDGAR convention, not a job title —
the filer put the role in the filing's remarks field instead. §05.1's role column must render it as
what it is (unstated, see filing) rather than printing "See Remarks" as though it were a title.

## V4 verdict

- **§05.1 option (b) is viable.** Form 3/4 supply the person and the role; 8-K Item 5.02 supplies
  the event and date. Departures render the event with the role `N/A`.
- **Do the parse server-side.** Splitting `owner_relationship` in the client is wrong 35% of the
  time — that is a defect waiting to ship, and it is cheap to avoid now.
- **The existing Insider view is affected too.** It renders `owner_relationship` as one string
  today; the structured fields would let it filter by role, which it currently cannot.

---

# V5 — do DERA `num.txt` rows carry the axes §03 and §04.5 need? · RESULT (2026-08-02)

Downloaded `2026q1.zip` (82 MB) — the same source and the same URL template
`ingest/downloader.download_dera_quarter` already uses. **3,690,955 `num.txt` rows, of which
2,185,031 (59.2%) carry a `segments` value**, across 1,586 distinct axes.

## ⚠️ First: DERA does not use the XBRL element names

`segments` carries a **shortened** axis name — `BusinessSegments`, not
`StatementBusinessSegmentsAxis`. My original candidate list used the element names and scored
**0 rows on every axis**, which would have read as "the data is not there."

This is not a new discovery so much as a confirmation: `dimensional_backfill.py` already hard-codes
`_GEO_AXIS = "Geographical"` and tolerates a `ConsolidationItems` qualifier. **The convention was
already in our code** — the roadmap's candidate list was simply written in the wrong vocabulary.
Anyone extending that module must take the axis names from it, not from the taxonomy.

## ✅ Every axis §03 and §04.5 need is present

Denominator note: **segment, geographic and customer disclosure is an ANNUAL footnote**, so the
`10-K`-only column is the meaningful one. 2026q1 holds 6,169 filings / 5,750 CIKs, of which
**4,309 are annual**.

| axis | rows | filings | % of annual | card |
|---|---:|---:|---:|---|
| `ProductOrService` | 85,510 | 2,970 | **68.9%** | §02.7 revenue disaggregation (ASC 606) |
| `BusinessSegments` | 197,599 | 2,865 | **66.5%** | §03.1 reportable segments |
| `ClassOfStock` | 124,640 | 2,574 | **59.7%** | §04.5 class structure |
| `Geographical` | 55,063 | 2,241 | **52.0%** | §03.2 (already ingested, revenue only) |
| `IncomeStatementLocation` | 6,057 | 673 | 15.6% | §02.15 stock comp by line item |
| `MajorCustomers` | 6,626 | 521 | 12.1% | §03.3 customer concentration |
| `ReportingUnit` | 897 | 159 | **3.7%** | §02.17 goodwill by reporting unit |
| `ConsolidationItems` | 156,655 | 1,886 | — | the reconciling-item qualifier, already handled |

## The tags on each axis are the ones the cards actually need — verified, not assumed

- **`BusinessSegments` carries all four of §03.1's columns:** `RevenueFromContractWithCustomer…`
  (37,688), `Revenues` (17,241), **`OperatingIncomeLoss` (7,148)**, **`Assets` (7,916)**, plus
  `Goodwill` and `CostOfGoodsAndServicesSold`. The segment table is fully sourceable.
- **`Geographical` carries `PropertyPlantAndEquipmentNet` (2,562)** — §03.2's "long-lived assets by
  country". Predicted above; now confirmed. It is a *tag-set* widening of a pipeline that already
  reads this axis, which makes it the cheapest card in the section.
- **`ClassOfStock` carries `CommonStockSharesOutstanding` (7,770), `…Issued` (5,786),
  `…Authorized` (4,839)** — §04.5's share counts per class. **Votes per share is still absent**, so
  the §04.5 ruling stands unchanged: ship share counts, `N/A` the votes column.
- **`ProductOrService` carries the revenue tags** — §02.7.

## Two cards are confirmed available but very thin

- **§02.17 goodwill by reporting unit: 3.7% of annual filers.** Real, but `N/A` for ~96%. Combined
  with the pre-existing constraint that *headroom* is only computable where the filer discloses the
  quantitative impairment test, this card will be empty for almost everyone. **Recommend building
  it last, or accepting a near-permanent empty state** — the design's own `HUB_CALCS.gwhead` note
  already anticipates it.
- **§03.3 customer concentration: 12.1%.** Thin but real; option (a) (anonymised labels) still
  holds.

## V5 verdict

**§03 is fully sourceable and §04.5 is sourceable-as-ruled.** The work is a **tag-set and
axis-set widening of `dimensional_backfill.py`**, not a new pipeline — its docstring's
"NOT business-segment / product axes" is a deliberate scope line, and this is the decision to
move it.

**Sequencing within Phase C, by yield:** `Geographical`+PP&E (§03.2, cheapest — axis already read)
→ `BusinessSegments` (§03.1, 66.5%) → `ProductOrService` (§02.7, 68.9%) → `ClassOfStock` (§04.5,
59.7%) → `MajorCustomers` (§03.3, 12.1%) → `IncomeStatementLocation` (§02.15, 15.6%) →
`ReportingUnit` (§02.17, 3.7%).

---

# V6 + V3b — NAICS and auditor in DERA `sub.txt`? · RESULT (2026-08-02)

Answered free, from the same download.

**`sub.txt`'s 36 columns:** `adsh, cik, name, sic, countryba, stprba, cityba, zipba, bas1, bas2,
baph, countryma, stprma, cityma, zipma, mas1, mas2, countryinc, stprinc, ein, former, changed, afs,
wksi, fye, form, period, fy, fp, filed, accepted, prevrpt, detail, instance, nciks, aciks`

- **V6 — NAICS: NOT PRESENT.** ❌ No column contains it. **§01.5's recommendation stands
  unchanged:** render `N/A` with "SEC assigns SIC; NAICS is not in the filing record", and treat
  the Census crosswalk as an `approximate`-chipped option only if a customer asks.
- **V3b — auditor: NOT PRESENT.** ❌ No `aud*` column. **The auditor must come from the instance
  parse (V3's path).** That closes the cheaper-route question: there isn't one.

## But `sub.txt` answers §01's profile card at bulk scale

It carries **`stprinc`/`countryinc`** (state/country of incorporation), **`afs`** (filer status —
`1-LAF` = Large Accelerated Filer), **`fye`**, **`cityba`/`stprba`** (business address), **`ein`**,
and **`former`/`changed`** (former names). That is five of §01's six `/submissions/`-sourced fields,
available in bulk without one API call per company.

**And `sub.txt` carries an `instance` column** — the instance filename (`epac-20260228_htm.xml`).
That is precisely what V3's instance-parse path needs to build a document URL **without an extra
directory fetch per filing**. If §01.9's auditor work goes ahead, this is the index it should
drive from.

---

## The no-drop contract

Because the layout is frozen, an unavailable card cannot vanish and cannot shrink. It renders in
its exact slot using components that already exist:

- **`StatusChip`** — `N/A` or `approximate` only (D-chips). Never on a good value.
- **`StateBlock`** — the honest empty state, sized to the card's existing box.
- **`Provenance`** — the `status` / `reason` / `formula` / `cannot` vocabulary the API already
  returns on derived figures.

Copy rules, carried over from the V3-P5a gate:

- **A measured zero reads as zero. An unchecked absence reads as "we have not looked."** These are
  different states and must never collapse into one another.
- **An absence over a window is not an absence over history.** Any card built on the filing index
  states the window it read.
- **Track 2 cards say what they are.** "Not ingested yet" or "lives in the filing text, which we
  do not parse" — never "cannot be reported", never a fabricated figure. This is the **D-voting**
  ruling, widened 2026-08-01 to cover the class.

---

## Phase 0 — the prerequisite (blocks everything below)

**`HubOverview.tsx` and `InstitutionalView.tsx` bypass the data seam entirely.**

`app/data/api.ts` is the seam: every view reads through it and nothing else, so repointing it at
`fetch("/v1/…")` plumbs the app without touching a view. These two call `hub.ts` **synchronously**
instead — `hubData(T)`, `instRegister(sel.focal)` — so there is nowhere to put a fetch.

**Work:** move both onto `api.*` + `useApi`, with `StateBlock` for loading / empty / error. Pure
refactor against the existing synthetic payloads — the page must render **pixel-identically**
before and after. That equivalence is the acceptance criterion, and it is checkable by the
existing e2e screenshot pass.

Do this first. Every phase below assumes it.

---

# Company Hub → Overview: the card ledger

## Breadcrumb

| # | Card / field | Band | Source or plan |
|---|---|---|---|
| 0.1 | Sector · company name · ticker | **P** | `/companies/{symbol}/profile` (`name`, `sic_description`) + ticker cache |
| 0.2 | Context pill — "SIC 3674 · rank 5 / 62" | **P** | `/companies/{symbol}/peers` — carries the SIC group and the rank. Verify the denominator is the *ranked* population, not the *ingested* one, and label whichever it is. |
| 0.3 | "Peer-relative view →" | — | Already navigates. No work. |

## "What changed this filing" band — 4 rows

This band is a **diff against the prior annual report**. Three of its four rows are diffs of
*text*, which is Track 2.

| # | Row | Band | Plan |
|---|---|---|---|
| 0.4 | `RISK` — new risk factor | **T** | Item 1A diff. Not buildable on Track 1. |
| 0.5 | `SEGMENT` — segments redefined / unchanged | **D** | Derivable **without text**: compare the set of segment axis members between two annual filings. A member that appears or disappears *is* a re-segmentation. Depends on §03's dimensional work. |
| 0.6 | `AUDIT` — auditor change | **P** | 8-K **Item 4.01** existence from `/filing-index` `items`. The *CAM* half of this row is **T**. |
| 0.7 | `DEBT` — credit agreement amended + covenant | **P** / **T** | 8-K **Item 1.01** existence and date: **P**. The covenant *terms* are exhibit prose: **T**. |

> **⚠️ Operator decision needed before this band is built.** It is a four-row band and only rows
> 0.5–0.7 have a Track 1 path. Options:
> **(a)** Render the band with the rows that resolve and give the Track 2 rows their honest state
> in place — keeps the layout, tells the truth, looks sparse on filers with no 8-K activity.
> **(b)** Re-scope the band to "what changed in the *structured* record" — segment membership,
> auditor, 8-K events, plus **new**: tags added/removed between filings, and restated periods.
> That is genuinely computable from `raw_facts` today and is arguably a *better* band.
> **(c)** Leave the whole band in its empty state until Track 2 is funded.
> **Recommendation: (b).** It fills the same four slots, needs no new source, and the
> tag-diff/restatement signal is something no competitor surfaces.

---

## §01 — Identity & structure
*Header source: cover page · EX-21 · 10-K Item 1*

| # | Card / field | Band | Source or plan |
|---|---|---|---|
| 1.1 | "What the company does" prose | **T** | Item 1 narrative. See ruling below. |
| 1.2 | Segment chips on that card | **D** | Same source as §03's segment table. |
| 1.3 | **Registrant profile — CIK** | **P** | `/profile` |
| 1.4 | SIC | **P** | `/profile` (`sic`, `sic_description`) |
| 1.5 | NAICS | **X** | Not in any SEC payload — **verified absent** from `/submissions/`. |
| 1.6 | State of incorporation | **P*** | `/submissions/` `stateOfIncorporation` — **verified present** |
| 1.7 | Headquarters | **P*** | `/submissions/` `addresses.business` — **verified present** |
| 1.8 | Fiscal year-end | **P*** | `/submissions/` `fiscalYearEnd` (`"0926"` = 26 Sep) — **verified present** |
| 1.9 | Independent auditor | **X — resolved** | **V3: `dei:AuditorName` IS tagged** in the 10-K instance (E&Y / PwC), with `AuditorFirmId` (PCAOB ID) and `AuditorLocation`. Needs the instance-parse path — now shared with 5 other cards. |
| 1.10 | Employees | **N/A — settled** | **V1 + V3:** the tag exists but is used by **1 filer of 8,919**, and is absent from both 10-K instances. Renders `N/A` with "filers do not tag it" — never `0`, never "not ingested". |
| 1.11 | Filer status | **P*** | `/submissions/` `category` (`"Large accelerated filer"`) — **verified present** |
| 1.12 | First 10-K | **P*** | `filings.files` — **verified**: Apple's history reaches 1994-01-26 |
| 1.13 | Consolidated subsidiaries (EX-21 table) | **X** | See below. |

**\* These six are `P` only after one small backend change.** `/profile` today returns name + SIC
and its docstring explains why the rest is omitted: *"the SEC's companyfacts API carries numeric
facts only."* **That reasoning is correct about companyfacts and does not apply to
`/submissions/`** — a different payload, which we already download on every company request. Six
of the ten profile fields are sitting in a response we are already paying for.

**Work:** extend `CompanyProfileRepository` + `/profile` with the `/submissions/` metadata block.
One walk, already in flight. This is the cheapest win on the page.

### 1.5 NAICS — how to verify, and the options

**Verify:** already done — `/submissions/` has no NAICS field, and SEC assigns SIC, not NAICS.
Confirm no NAICS appears in the DERA FSDS `sub.txt` before ruling (one column check, no new
download if a quarter ZIP is already on the volume).

**Options:**
- **(a) SIC → NAICS crosswalk.** The US Census publishes a static public concordance. One CSV,
  vendored, no runtime cost. **Caveat that must ship with it: the mapping is many-to-many, so the
  NAICS code would be *ours*, not the filer's.** It must be labelled `approximate` with a chip.
- **(b) Drop the field and re-flow the profile grid.** Rejected — rule 2 forbids layout change.
- **(c) Render `N/A` with "SEC assigns SIC; NAICS is not in the filing record."** Honest, zero
  cost, keeps the slot.
- **Recommendation: (c) now, (a) only if a customer asks.** A derived NAICS presented on a
  cover-page card would read as the filer's own classification when it is not.

### 1.9 Auditor — how to verify, and the options

**Verify:** `AuditorName` / `AuditorFirmId` are real `dei` elements (the 2021 auditor-attestation
rule) but are **verified absent from companyfacts** — because they are text. Confirm they *are*
present in the filing's inline-XBRL instance by fetching one 10-K's `_htm.xml` and grepping for
`AuditorName`. That single check decides between options (a) and (c).

**Options:**
- **(a) Parse the XBRL instance document** for the handful of `dei` text facts. Still Track 1
  (structured XBRL, not prose). But it is a **new fetch path** — one instance document per filing,
  per company — and instance documents are large. Bounded to latest-10-K-only it is tractable.
- **(b) PCAOB Form AP.** The PCAOB publishes issuer↔auditor↔engagement-partner as a structured
  downloadable dataset, including **tenure**, which the card wants. **Not an SEC source** — new
  host, new compliance question, new freshness contract.
- **(c) `N/A` with "the auditor's name is a text fact; we ingest numeric facts."**
- **Recommendation: (c) now; (a) when the same fetch is needed for another field.** The auditor
  card wants four fields (firm, tenure, fees, non-audit %) and (a) delivers only the firm — fees
  live in the DEF 14A. Building a new fetch path for one of four fields is poor value until
  §05/§06's proxy question is settled, at which point they should be built together.

### 1.10 Employees — how to verify, and the options

**Verify:** grep one 10-K instance document for `EntityNumberOfEmployees` **and** for
`dei:EntityNumberOfEmployees`. If absent there too, the number exists only as Item 1 prose and
the card is **T**, not **X**. *Do this check before scheduling — it changes the band.*

**Options:** (a) instance-document parse, if the tag is there — shares all of 1.9(a)'s cost.
(b) `N/A` with a reason. **Recommendation: run the check first.** This is exactly the kind of
question the roadmap must not answer by assumption.

### 1.13 Consolidated subsidiaries (EX-21)

**Verify:** fetch one 10-K's filing directory index and confirm the EX-21 document type and
format. Apple's is an HTML exhibit; some filers file it as plain text. **This check determines
whether the card is buildable at all.**

**Options:**
- **(a) Parse EX-21.** It is a table of entity / jurisdiction / ownership — genuinely structured
  *information* in an unstructured *document*. **This is HTML parsing, which `CLAUDE.md` prohibits
  outright** ("we do not scrape or parse HTML"). Building it requires an explicit operator
  override of a standing rule, not a roadmap decision.
- **(b) Substitute the subsidiary *count* only**, if any structured source carries it. None known.
- **(c) `StateBlock` in the card's slot: "EX-21 lists every consolidated subsidiary. It is an
  exhibit document, not structured data — we do not parse filing documents."** The card keeps its
  full width and states the boundary. The existing note under the table already says what EX-21
  is, so the copy is half-written.
- **Recommendation: (c).** (a) is a Track-1 violation and should not be smuggled in as plumbing.

### 1.1 Business description prose

**T.** The existing `HUB_BIZ_TEXT` is a *fixed* paragraph, deliberately not interpolated per
ticker — the comment in `hub.ts` says why: a templated description "would read as a claim about
that specific filer while being nothing of the kind." **That reasoning holds and the constant must
not ship to production**, because in production it would be attached to a real company.

**Options:** (a) `StateBlock` in the prose slot naming Item 1 as unparsed. (b) Substitute the
structured identity we *do* have — SIC description, exchange, incorporation, filer status — as a
sentence assembled from facts, clearly framed as our summary of the *record*, not the filer's
description of itself. **Recommendation: (b)** — it fills the slot with something true and keeps
the segment chips beneath it meaningful.

---

## §02 — Financial detail
*Header source: statements & footnotes · XBRL facts as filed*

**This is the strongest section on the page.** The condensed statements, the trend drawers, the
snapshot tiles and the comparison tray are all **P** today, and six of the seven footnote cards
are **M** — the facts are already in `raw_facts` and need mapping, not ingestion.

| # | Card | Band | Source or plan |
|---|---|---|---|
| 2.1 | Condensed statements — 3 tabs × 4 columns | **P** | `/statements/{income\|balance\|cashflow}/condensed`. Purpose-built for this card: period columns × canonical rows, **`None` never rendered as 0**. |
| 2.2 | `derived` badge on Free cash flow | **P** | The row is derived; `HUB_CALCS.fcf` copy already matches our definition. |
| 2.3 | Trend drawer — series + range tabs (8q / 20q / 5y) | **P** | `/metrics/{metric}/history` + `/periods` |
| 2.4 | Trend drawer — **basis tabs (As filed / As restated)** | **M** | We keep every restatement (`accession` + `filed`, latest-filed wins). The *data* exists; **no endpoint exposes the as-filed vintage.** Needs a `basis=` param on the history route. Small, and it makes a genuine differentiator visible. |
| 2.5 | Comparison tray | **P** | Same series as 2.3 |
| 2.6 | Financial snapshot — 8 tiles, spark, YoY | **P** | `/metrics` + history. Direction-only arrows already match STYLE_GUIDE §5. |
| 2.7 | Revenue disaggregation · ASC 606 | **D** | **V5-verified:** the `ProductOrService` axis — **68.9% of annual filers, the best-covered axis in the set.** |
| 2.8 | Remaining performance obligations | **M** | `RevenueRemainingPerformanceObligation` — **verified present on Intel, absent on Apple.** Per-filer `N/A`. |
| 2.9 | Inventory composition | **M** | **Verified**: Intel has all three components, Apple only finished goods. Card renders what the filer tagged. |
| 2.10 | Debt maturity ladder | **M** | `LongTermDebtMaturitiesRepaymentsOfPrincipalIn…` — **verified present on Apple** across all five buckets. |
| 2.11 | Covenants (note under the ladder) | **T** | Credit-agreement terms are exhibit prose. |
| 2.12 | Effective tax rate reconciliation | **M** | **Verified present on Apple**, including statutory rate, foreign differential, UTB and valuation allowance. |
| 2.13 | Deferred revenue roll-forward | **M** | `ContractWithCustomerLiability` + `…RevenueRecognized` — **verified present on Apple**. Opening/closing derive from consecutive instants. |
| 2.14 | Allowance for credit losses roll-forward | **M** | **V1: 55.6% / 61.1% deep.** The legacy `AllowanceForDoubtfulAccounts*` family, not the CECL-era names (those are `0/45`). |
| 2.15 | Stock compensation **by line item** | **D** (thin) | The total (`ShareBasedCompensation`) is **M**. **V5: the `IncomeStatementLocation` axis exists on 15.6% of annual filers** — the by-line split is real but mostly `N/A`. |
| 2.16 | R&D capitalization (cap vs expensed) | **M** (thin) | **V1: 4.4% / 5.6% deep** — effectively `N/A` for nearly every filer. The *expensed* half (`ResearchAndDevelopmentExpense`, 48.9%) is fine. |
| 2.17 | Goodwill by reporting unit + headroom | **D** (very thin) | **V5: `ReportingUnit` is on only 3.7% of annual filers** — `N/A` for ~96%. Build last. Goodwill total is **M**. By-unit needs the reporting-unit axis. **Headroom is only computable where the filer discloses the quantitative test** — `HUB_CALCS.gwhead`'s note already says exactly this, so the `N/A` path is pre-written. |
| 2.18 | Leases — liability / WA term / discount rate | **M** | **V1:** liability 82.2%, discount rate 73.3%. **The weighted-average *term* matches nothing on the volume** — it is duration-typed, so companyfacts cannot carry it. That field renders `N/A`; the other two are `M`. |

### The one verification that gates cards 2.14 and 2.16

**Method:** run the existing `docs/tag_glossary.jsonl` and a sample of `raw_facts` across a basket
of ~50 filers spanning several SIC groups, and report per-tag coverage. This is a query against
data we already hold — **no network, no new ingest.** It answers, for every candidate tag on this
page at once, "how many filers actually tag this?"

**That query should run before Phase B is scheduled**, because it converts every `M?` on this page
into an `M` or a `T` and sizes the phase honestly. It is a few hours of work and it de-risks the
largest phase in this roadmap.

### The `M` band's shape

All twelve `M` cards are the **same piece of work**, not twelve pieces:

1. Add the canonical concepts to `normalize/mapping.py` (guardrail 3: **and** `docs/DATA_MODEL.md`).
2. One route that serves a named group of concepts for a period, with `status` / `reason` per row.
3. The frontend fills the existing cards from it.

**No new ingest.** The bulk backfill already stores the full ~500–700-tag payload per company —
`CLAUDE.md` is explicit that it is "the ONLY path that ingests the full payload", and it has run.
These facts are on the volume now.

---

## §03 — Segments & geography
*Header source: ASC 280 · 10-K segment footnote*

**Entirely `D`, and this is the section that extends an existing pipeline rather than starting one.**

`ingest/dimensional_backfill.py` already streams DERA quarterly ZIPs and reads `num.txt`'s
`segments` column. It is deliberately narrowed — its docstring says **"NOT the general dimensional
store, NOT business-segment / product axes"** — but the *source* carries every axis. Widening it is
a scoped change to a proven module, not a new pipeline.

| # | Card | Band | Plan |
|---|---|---|---|
| 3.1 | Reportable segments — revenue / op income / margin / assets | **D** | **V5-verified:** widen to the `BusinessSegments` axis (DERA's short name). 66.5% of annual filers; carries revenue, `OperatingIncomeLoss` and `Assets` — all four columns. Margin is derived; `HUB_CALCS.segmargin`'s note ("defined by the filer… not comparable across filers") is the caveat and is already written. |
| 3.2 | Long-lived assets by country | **D** | **V5-verified:** `Geographical` already carries `PropertyPlantAndEquipmentNet` (2,562 rows). A *tag-set* widening of an axis we already read — **cheapest card in the section, build it first.** |
| 3.3 | Customer concentration >10% | **D** + **T** | **V5-verified:** the `MajorCustomers` axis exists — **12.1% of annual filers**, thin but real. The customer's *name* is a text member label. Options below. |
| 3.4 | Segment-definition note ("redefined / unchanged") | **D** | Falls out of 3.1 — compare axis membership across two annual filings. |

### 3.3 Customer concentration — the split

**Verify:** extract `MajorCustomersAxis` rows from one DERA quarter and inspect the member
identifiers. The spike (`docs/SPIKE_DIMENSIONAL.md`) established the method; this is the same
extract with a different axis.

**Options:**
- **(a) Percentages with anonymised labels** — "Customer A / Customer B", exactly as the prototype
  already renders them, plus the note already on the card ("customers are identified only where
  the filer names them"). **The design anticipated this.**
- **(b) Resolve member labels to names** where the filer used a named member. Inconsistent across
  filers; produces a card that names customers for some companies and not others.
- **Recommendation: (a).** The card as designed is already the honest version.

### Reconciling-item risk carries over

The spike's blockers apply unchanged to segments: hierarchy mixing on one axis, and
reconciling-item filtering (eliminations / corporate). `dimensional_backfill` already solves both
for geography — **reuse those filters, do not re-derive them.**

---

## §04 — Capital & ownership
*Header source: cash flow statement · 10-Q Item 5 · DEF 14A · 13D/G*

| # | Card | Band | Source or plan |
|---|---|---|---|
| 4.1 | Share count roll-forward | **M** | **V1:** issued 95.6%, outstanding 91.1%, options-exercised 68.9%. Repurchase: map **`StockRepurchasedDuringPeriodShares` (46.7%)** as well as the `AndRetired` variant (24.4%). |
| 4.2 | Dilution overhang — options / unvested RSUs / % | **M** | **V1: options outstanding 77.8%**, unvested awards 35.6%. The % is derived against shares outstanding. |
| 4.3 | Repurchase program — authorized / remaining / repurchased | **M** | **V1 overturned my prediction.** Paid: 75.6%. **Authorized IS tagged** — 31.1% broad, **55.6% deep**, across two tag variants that must both be mapped. All four tiles are `M`. |
| 4.4 | Shelf (S-3) / convertible notes | **P** + **T** | *Existence and date* of an S-3 from `/filing-index`: **P**, and already proven by V3-P5a §06. Principal amount and maturity: **T**. |
| 4.5 | Class structure & voting | **D** + **T** | **V5-verified:** the `ClassOfStock` axis carries `CommonStockSharesOutstanding`/`Issued`/`Authorized` on **59.7% of annual filers**. **Votes per share is charter language: T.** A dual-class card that cannot say "10 votes" is a weak card — see the ruling below. |
| 4.6 | Insider ownership % of shares out | **X** | **V2-verified absent** from the tagged DEF 14A — the beneficial-ownership table is not tagged. |
| 4.7 | Reported blockholders · 13D/G | **P** | `/companies/{symbol}/beneficial-ownership` — shipped. |

### 4.5 Class structure — ruling needed

**Verify:** confirm `ClassOfStockAxis` share counts appear in DERA `num.txt` for a known dual-class
filer. Then confirm no `dei` or us-gaap tag carries votes-per-share (expected: none — it is a
charter term).

**Options:**
- **(a) Ship share counts per class; votes column renders `N/A` per row.** Truthful, and the
  asymmetry is itself informative — but a "Class structure **& voting**" card with no voting is a
  card whose title over-promises, and rule 2 forbids retitling it.
- **(b) Hold the whole card** in its empty state until a source for voting rights exists.
- **(c) Fill the votes column from the 13D/G cover page**, which reports voting vs dispositive
  power. **That is per-holder power, not per-class rights — a different quantity.** Naming it in
  this column would be a category error. **Rejected.**
- **Recommendation: (a)**, with the votes column's `N/A` reason naming the charter as the source
  we do not read. Option (c) is listed only so it is explicitly ruled out.

### 4.6 Insider ownership — the DEF 14A question

This is the **first of four cards on this page that all want the proxy statement** (4.6, 5.2, 5.3,
and the fees half of 6.1). They should be decided together, not one at a time — see the §05 ruling.

---

## §05 — Governance & people
*Header source: DEF 14A · 8-K Item 5.02 · Forms 3/4/5*

| # | Card | Band | Source or plan |
|---|---|---|---|
| 5.1 | Officers & directors | ✅ **DONE 2026-08-04** | `GET /officer-changes` — Form 3 arrivals (person + role) interleaved with 8-K Item 5.02 events (date), **never joined**. Structured role columns added (`officer_title`, `is_director`, `is_officer`, `is_ten_percent_owner`); legacy rows fall back to the display string's left prefix, which is **exact** (12,630 distinct values, 0 violations). **The action verb is confirmed unavailable** — EDGAR's item code carries no sub-item letter, so the card has no action column. Officers + directors only; 10% owners and `other` excluded with the count reported. **Restructured 2026-08-04 (operator direction):** the card LISTS the current officers and directors and marks only who changed since the previous quarter — `new` (a Form 3 after the baseline) or `role changed` (a role box turned on). No departure mark exists: nothing is filed on leaving. Item 5.02 filings name nobody, so they are counted, not attributed. |
| 5.2 | Governance policies (was: board composition) | ✅ **DONE 2026-08-04** | The four designed tiles stay **X** — board size, independence and tenure are tagged nowhere, re-verified against the 10-K instance. **Repointed** (operator ruling) to four check marks that ARE tagged: three `ecd` flags already riding in the PvP payload, plus `dei:DocumentFinStmtErrorCorrectionFlag` from the 10-K cover. An untagged box renders `N/A`, never "no". The clawback half never claims a POLICY exists — that is proxy prose. |
| 5.3 | CEO pay mix / total / pay ratio / say-on-pay | **partly `X`** | **V2: the DEF 14A IS tagged.** CEO **total comp** + comp-actually-paid + TSR are numeric `ecd` facts, 3 years (FY2024+). **Mix, pay ratio and say-on-pay are NOT tagged.** Ruling required — see V2. |
| 5.4 | Insider transactions summary | ✅ **DONE 2026-08-04** | `GET /insider-summary` over the same Form 3/4/5 rows, tallied in `normalize/insider_summary.py`. Window is **filings, not days**; headline counts are the A/D flag with the open-market (P/S) subset in the footer — both operator rulings 2026-08-04. |
| 5.5 | Rule 10b5-1 plans | ✅ **DONE 2026-08-05** | `GET /trading-arrangements` — 10-K **Item 408(a)** `ecd` facts: the person, their title, the **adoption date**, the duration and the securities covered, per individual. **This overturns D-10b5-1**, which was true of Form 4's `aff10b5One` box and wrong about Item 408(a). Parsed from the instance `/audit` already reads, so it costs no extra fetch. **One fiscal QUARTER**, not the trailing year (operator ruling) — the 10-K's own quarter; the three 10-Qs would cover the rest at three more multi-MB fetches. Adoption and termination stay distinct; dates are the filer's text and carry a raw form beside the ISO one. |

### 5.3 — the verification that could move this card from X to P

**The SEC's Pay-versus-Performance rule (effective 2023) requires the pay-versus-performance table
in the DEF 14A to be tagged in inline XBRL, in the `ecd` taxonomy.** If that is so, executive
compensation is **structured data on EDGAR** and this card is Track 1, not Track 2.

**Verify:** fetch one recent DEF 14A's filing directory, confirm an inline-XBRL instance exists,
and list its `ecd` elements. **Do this before ruling on §05 or §04.6.** It is one filing fetch and
it could reclassify three cards.

**If confirmed, the options are:**
- **(a) `ecd` from the DEF 14A instance** — a new fetch path, but Track 1 and narrow. Delivers 5.3
  and possibly the pay ratio.
- **(b) Wait for a DERA dataset** covering `ecd`, if one exists — verify.
- Note that **board composition (5.2) and beneficial ownership (4.6) are almost certainly *not*
  in `ecd`** — they are proxy *tables*, not the pay-versus-performance disclosure. Those stay **X**
  regardless.

### 5.1 — Officer changes, options

**Options:**
- **(a) Ship the *event*, not the detail.** Row reads "8-K Item 5.02 · 2026-03-14" with the role
  and action columns rendering the honest boundary. **The layout has three columns and this fills
  two.**
- **(b) Substitute Forms 3/4** — a new officer files a Form 3 within 10 days, and Form 3/4 carry
  `officerTitle` as *structured ownership XML*, which we already parse. **This gives the role
  directly.** An arrival is a Form 3; a departure is not reliably signalled. **This is a genuinely
  strong option and it uses a source already in the store.**
- **Recommendation: (b) joined with (a)** — 8-K 5.02 supplies the event and date, Form 3 supplies
  the person and title where the change is an arrival. Departures render the event with the role
  `N/A`. **V4 confirmed this works**, with one caveat: `officerTitle` is retained but flattened
  into a composite string that is **ambiguous on 35% of values**, so the structured fields must be
  added server-side rather than split in the client. See V4.

---

## §06 — Accounting quality & audit
*Header source: auditor report · Item 9A · 8-K 4.01 / 4.02 · 12b-25*

| # | Card / field | Band | Source or plan |
|---|---|---|---|
| 6.1 | Auditor — firm | ✅ **SHIPPED 2026-08-03** | `sec/cover.py` reads `dei:AuditorName` + `AuditorFirmId` + `AuditorLocation` from the 10-K's extracted instance, stored in `filing_cover_facts`. Also fills §01.9. |
| 6.2 | Auditor — tenure | **X — renders N/A with the reason** | PCAOB Form AP carries it; SEC does not. The card shows the **PCAOB firm id** (the join key) and the auditor's location in that slot, labelled as neither. |
| 6.3 | Auditor — fees / non-audit % | **X — renders N/A with the reason** | **V2-verified absent** from the tagged DEF 14A. |
| 6.4 | "Auditor changed · 8-K Item 4.01" | ✅ **SHIPPED 2026-08-03** | `/filing-index` `items`, matched whole. Absence names the indexed window. |
| 6.5 | "Non-reliance restatement · 8-K Item 4.02" | ✅ **SHIPPED 2026-08-03** | `/filing-index` `items` |
| 6.6 | "N Form 12b-25 filed" | ✅ **SHIPPED 2026-08-03** | `/filing-index` — form existence, **with the window stated** (JPMorgan's is ONE YEAR; Apple's is 2015–2026) |
| 6.7 | "ICFR effective / material weakness" | **T — the card says so** | Item 9A conclusion is prose. **V3 caution:** `dei:IcfrAuditorAttestationFlag` exists and is `true` on both filers, but it means *subject to attestation* — **not** "effective", **not** "no material weakness". Do not substitute it. |
| 6.8 | Critical audit matters | **T — honest empty state shipped** | Auditor's report narrative. The fixture CAMs are gone; the card explains the absence and links to the report. |
| 6.9 | Non-GAAP adjustments — count / recurrence | ✅ **SLOT RE-POINTED 2026-08-03** | Operator ruling: the slot now carries the **company extension-tag census**, retitled. See below. |
| 6.10 | Critical accounting estimates | **T — honest empty state shipped** | Item 7 narrative. |

**Three of this section's four cards are majority-Track 2.** That is a real finding about the
section, not a gap in this roadmap — and the four audit *facts* (6.4–6.6) are the section's
Track 1 core and are already buildable from work V3-P5a shipped.

### 6.9 — a Track 1 substitute worth considering

**We can count company *extension* tags.** Every fact records `is_extension`, and a company
defining its own tags is doing something adjacent to what the non-GAAP card is asking about. This
is **not** the same measure and must not be labelled as one — but "N extension tags this filing,
M% of tagged facts" is a real, comparable, structured accounting-quality signal that fits the
card's two-stat layout exactly.

**Recommendation:** offer it to the operator as a *replacement metric* for the slot, clearly
titled for what it is. If rejected, the card takes its empty state. **Do not relabel an extension
count as a non-GAAP count.**

**✅ ACCEPTED (operator, 2026-08-03), and it turned out cheaper than described here.** The count
does **not** come from `is_extension` on `raw_facts` — that column does not exist, and it could
not: companyfacts exposes `us-gaap` and `dei` only, so the store holds **zero** extension facts by
construction. It comes from the same instance fetch as 6.1, at no extra cost. Shipped as *Company
extension tags* with "Not a non-GAAP adjustment count" in the card's own copy. It differentiates
strongly: Apple 43 distinct / 7.3% of facts · NVIDIA 37 / 5.2% · Microsoft 59 / 7.2% · Coca-Cola
87 / 8.3% · **JPMorgan 352 / 19.4%**.

---

## §07 — Obligations & contingencies
*Header source: 10-K Item 3 · commitments & contingencies footnote*

**This section is the one this roadmap is least certain about, and says so.**

| # | Card | Band | Status |
|---|---|---|---|
| 7.1 | Legal proceedings — matter / stage / accrual / since | **T — MARKED, not built** | Re-measured: accrual 23.7% / 37.2% deep. Three of four columns are Item 3 narrative, so the grid cannot render a row. **Operator ruling 2026-08-04: mark the card.** |
| 7.2 | Purchase & capacity commitments by year | ✅ **SHIPPED 2026-08-04** | The union of three families = **25.4% / 31.9%**; no single tag clears 15%. The by-year ladder is ~1 filer in 20, so a total alone resolves the card and the payload says which case applies. |
| 7.3 | Restructuring — charge / accrual / paid / scope | ✅ **SHIPPED 2026-08-04** | **25.6% / 48.7%** — the best-covered group in §07. Scope tile confirmed structured (`…NumberOfPositionsEliminated`, `employee` unit). `SeveranceCosts1` kept as a component, never a fallback. |
| 7.4 | Guarantees / environmental / off-balance-sheet | ✅ **SHIPPED 2026-08-04** | Guarantees 4.1% / 7.1%, environmental 8.0% / 19.5%. **`LettersOfCreditOutstandingAmount` (16.9% / 29.2%) is the best-covered concept here and is NOT a guarantee** — operator ruling: it fills the off-balance-sheet line. |

### ✅ The verification this section needed — DONE 2026-08-04

V1's numbers were measured **before the bulk backfill ran** (72 companies with 50+ tags, 45-filer
basket) and V1 itself said to re-run them afterwards. Re-run over **485 filers in 70 SIC groups**
on FY2023+ facts, plus the 113 with a full tag payload. Answer (1) of the three below is the right
one for most of §07 — *the tags are rare in practice and `N/A` is the honest answer* — with one
correction: V1 named `GuaranteeObligationsMaximumExposure` as §07.4's best tag, and it is not.
`LettersOfCreditOutstandingAmount` has four times the coverage and is a **different instrument**,
which is a mapping decision rather than a coverage one. Full results in `docs/DATA_MODEL.md`.

### The verification this section needed (original text)

**Two filers is not a basket.** `PurchaseObligation` and `LossContingencyAccrualAtCarryingValue`
missing from both Apple and Intel means one of three things, and **the roadmap must not guess
which**:

1. The tags are rare in practice → the cards are mostly `N/A` and that is the honest answer.
2. Filers use *different* tags for the same disclosure → the mapping needs the right candidates,
   which is exactly the work `normalize/mapping.py` exists for.
3. The disclosure is genuinely text-only for most filers → the cards are **T**.

**Method:** the same basket query specified for §02 — coverage counts per candidate tag across ~50
filers spanning SIC groups, run against `raw_facts` on the volume. **No network.** Include the
`LossContingency*`, `PurchaseObligation`, `Guarantee*` and environmental-remediation candidate
families.

**This one query resolves §02's three `M?` cards and all of §07 at once.** It should be the first
backend task after Phase 0.

---

## §08 — Disclosure change
*Header source: 10-K Item 1A / 1C · MD&A · 8-K 1.01 & 2.02*

**The most Track-2 section on the page.** Named honestly rather than padded.

| # | Card | Band | Plan |
|---|---|---|---|
| 8.1 | Risk factor diff — count / delta / word count / added-removed-reworded | **T** | Item 1A. No Track 1 path. |
| 8.2 | Management-attributed drivers · MD&A | **T** | Explicitly quoted narrative. |
| 8.3 | Cybersecurity · Item 1C — governance / framework | **partly Track 1** | **V3: the `cyd` taxonomy carries booleans.** Governance (positions responsible, reports to board, third party engaged, processes integrated) is **structured**. **Framework (NIST/ISO) is not a flag — stays `T`.** |
| 8.4 | Cybersecurity — **"8-K Item 1.05 filed"** | **P** (+ better) | `/filing-index` `items`. **V3 found a stronger source**: `cyd:CybersecurityRiskMateriallyAffected…Flag` is an affirmative `false` — a *checked* negative, where a missing Item 1.05 is only an unchecked one. Use both. |
| 8.5 | Human capital — headcount / turnover | **X** / **T** | Depends on 1.10's verification. |
| 8.6 | Material agreements · 8-K 1.01 | **P** | Existence and date: shipped capability. **The agreement's title is text: T.** |
| 8.7 | Outlook language · 8-K 2.02 exhibit | **T** | Guidance is a furnished exhibit. |

> **⚠️ Operator decision needed.** Six of seven fields here are Track 2. Options:
> **(a)** Render the section with 8.4 and 8.6 live and the rest in honest empty states — a section
> that is mostly empty states.
> **(b)** Re-scope §08 to **"Filing activity & disclosure events"**: 8-K item codes over time,
> acceptance lag, amendment rate, restatement events, tag-set changes. All **P/M** today, all
> genuinely about *disclosure change*, and it fills the same four card slots.
> **(c)** Leave §08 entirely in empty states until Track 2 is funded, and say so on the section.
> **Recommendation: (b)**, for the same reason as the "What changed" band — and note that (b) and
> the band's option (b) are the *same* underlying work, so deciding them together halves the cost.

---

## The rail — Filing timeline

| # | Card | Band | Source |
|---|---|---|---|
| R.1 | Every form as filed, newest first, filterable by form | **P** | `/companies/{symbol}/filing-index` — shipped. `form`, `filingDate`, `items` all present. |
| R.2 | Row description ("Item 5.02 · officer transition") | **P** | Composable from `form` + `items` with a static code→label map. **A display-only map keyed on codes the API returns is allowed** (frontend guardrail); re-deriving numbers is not. |
| R.3 | "N of M filings shown" | **P** | Counts from the same payload |
| R.4 | Window disclosure | **P** | **Required.** The index is EDGAR's rolling window. `filings.files` (verified, 1,238 older filings for Apple) can extend it — a scoped follow-on to `filing_index_backfill`. |

---

# Sequencing

Each phase ends at an operator gate: QA report + `4b-manual-verification.md`, hand-run. That is
mandatory for every rendered change (operator, 2026-07-31).

| phase | what | prerequisite | unlocks |
|---|---|---|---|
| **0** | Seam refactor — `HubOverview` + `InstitutionalView` onto `api.*` | — | everything |
| **0.5** | ~~Basket coverage query~~ ✅ **DONE 2026-08-02** → replaced by **`python -m secfin.ingest.backfill`** (whole-market bulk backfill). V1 found only **72 of 8,919** filers carry ≥50 tags. | 0 | **everything in A and B** — without it they render for ~72 companies |
| **A** | The `P` band: profile card, condensed statements, trend drawers, snapshot, tray, blockholders, insider summary, filing-timeline rail, all 8-K-item and form-existence facts | 0 | §01 partial, §02 core, §04.4/4.7, §05.1/5.4, §06.4–6.6, §08.4/8.6, rail |
| **A.1** | `/profile` + `/submissions/` metadata (6 verified fields) | A | §01 registrant card |
| **B** | The `M` band: mapping extensions + one grouped-concepts route | 0.5 | §02 footnotes, §04.1–4.3, §07 |
| **B.1** | `basis=` on metric history (as-filed vs as-restated) | B | §02.4 |
| **C** | The `D` band: widen `dimensional_backfill` beyond geography-revenue | B | §03 entire, §02.7/2.15/2.17, §04.5, "what changed" 0.5 |
| **D** | The `X` band — **each needs its own operator ruling first** | C | §01.13, §05.2/5.3, §06.1–6.3, §04.6 |
| **T** | Track 2 — **not scheduled.** Flagged per guardrail 1. | — | §08 majority, §06.7–6.10, §07 narrative halves |

**Phases A and B carry most of this page** and need no new data source.

---

## Decisions the operator owes before building

1. **The "What changed this filing" band** — (a) partial, (b) re-scope to the structured record,
   (c) hold. *Recommended: (b).*
2. **§08** — same three options, and **the same work as (1)**. Decide together.
3. **NAICS (1.5)** — Census crosswalk labelled `approximate`, or `N/A`. *Recommended: `N/A`.*
4. **EX-21 subsidiaries (1.13)** — parsing it requires overriding the standing no-HTML rule.
   *Recommended: keep the rule; render the boundary.*
5. **The DEF 14A cluster** — **V2 split it.** §04.6, §05.2 and §06.3 are confirmed `X` (not
   tagged). Only **§05.3** is live, and it needs its own ruling: fill the total only (a),
   re-point the card at pay-versus-performance (b), or hold it (c). *Recommended: (b).*
5b. **The `ecd` governance flags** (insider-trading policy adopted; option-award timing vs MNPI) —
   free in the same fetch, not currently in the design. Take them or leave them.
6. **Class structure votes column (4.5)** — ship share counts with `N/A` votes, or hold the card.
   *Recommended: ship with `N/A`.*
7. **§06.9** — accept an extension-tag-density metric in the non-GAAP slot, clearly retitled for
   what it is, or take the empty state.

## Verifications to run before the estimates above are trusted

| # | Check | Decides |
|---|---|---|
| ~~V1~~ | ✅ **DONE 2026-08-02.** Basket tag-coverage query over `raw_facts` | **Resolved: every `M?` is an `M`.** And surfaced the backfill gap — see the V1 section. |
| ~~V2~~ | ✅ **DONE 2026-08-02.** Yes — `ecd` numeric facts, FY2024+, ~120–180 KB instance, **not in companyfacts**. | **§05.3 partly unblocked; §04.6, §05.2, §06.3 confirmed `X`.** New ruling required — see V2. |
| ~~V5~~ | ✅ **DONE 2026-08-02.** All axes present — **but DERA uses short names** (`BusinessSegments`, not `StatementBusinessSegmentsAxis`). Segments 66.5% of annual filers, ClassOfStock 59.7%, ProductOrService 68.9%; ReportingUnit only 3.7%. | **§03 fully sourceable; §04.5 as ruled.** Phase C is a widening of `dimensional_backfill`, not a new pipeline. |
| ~~V6~~ | ✅ **DONE 2026-08-02.** NAICS is **not** in DERA `sub.txt`. | §01.5 `N/A` recommendation stands. |
| ~~V3b~~ | ✅ **DONE 2026-08-02.** No auditor column in `sub.txt` — **no cheaper route**. But `sub.txt` carries incorporation state, filer status, FYE, address, EIN, former names **and the `instance` filename**. | §01.9/§06.1 must use the instance parse; §01's other fields available in bulk. |
| ~~V4~~ | ✅ **DONE 2026-08-02.** Retained — but flattened into a string that is **ambiguous on 35% of paren-bearing values**. 12,581 Form 3 rows support option (b). | **§05.1(b) viable**, conditional on adding `officer_title` / `is_officer` / `is_director` / `is_ten_percent_owner` server-side. |
| ~~V3~~ | ✅ **DONE 2026-08-02.** Auditor YES (name + PCAOB id + location); employees NO. **Plus `cyd` cybersecurity flags and `ecd` 10b5-1 flags.** | **§01.9/§06.1 buildable · §01.10 settled `N/A` · §08.3 part Track 1 · §05.5 improved.** |
| **V3b** | Does the DERA FSDS `sub.txt` carry auditor / cover-page fields? *(no DERA ZIP on the volume today — one ~50 MB download)* | whether §01.9/§06.1 ride the dimensional pipeline instead of a new per-filing fetch |
| **V3c** | Does `bulk/submissions.zip` (**already on the volume, 1.55 GB, unparsed**) cover §01's profile fields at whole-market scale? | whether §01's registrant card needs any per-company API call |
| V4 | Does `sec/insider.py` retain `officerTitle` from Forms 3/4? | §05.1 option (b) |
| V5 | Do DERA `num.txt` rows carry `StatementBusinessSegmentsAxis`, `ClassOfStockAxis`, `MajorCustomersAxis`? | §03 entire, §04.5 |
| V6 | Is NAICS anywhere in DERA `sub.txt`? | §01.5 |

**None of these is expensive. All of them change the plan if they come back the other way** — which
is why they are listed as work rather than assumed away.
