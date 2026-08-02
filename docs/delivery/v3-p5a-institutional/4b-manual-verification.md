# 4b — Operator manual verification · V3-P5a phase 2, **§06** (the last section)

**Purpose:** your hands-on acceptance of §06 — and of the phase, since this is the last section
and the NOT-REAL-DATA banner is now gone.

| | |
|---|---|
| **Branch** | `v3-p5a-institutional` @ `5c286ff` |
| **QA verdict** | **PASS** — four defects found and fixed this cycle (`4-qa.md`, D-QA-8…11) |
| **Operator verdict** | ✅ **CONFIRMED 2026-08-01** — walked interactively, all 12 rows first-pass |
| **Start the app** | `docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app` |
| **URL** | **http://localhost:8010/company/AAPL/institutional** |
| **Time** | ~5 minutes |

> ⚠️ Six QA pairs on disk; only the filenames tell them apart. `*-phase1.md` = fidelity gate ·
> `*-p2-s01.md` = §01 · `*-p2-s0203.md` = §02+§03 · `*-p2-s0405.md` = §04+§05 · **this = §06.**

## The load-bearing rule for this change

**An absence over a WINDOW is not an absence over HISTORY.**

§06 used to say *"No tender offer on file"* having never read a filing index. Your D-supply ruling
built the ingest so it can now say *"Tender offers: none found"* **followed by the window it
checked**. That difference — a *checked* absence versus an *asserted* one — is the entire point of
this section, and row 4 is where you judge whether it lands.

## Checklist

| # | Step | Expected result | Result ✅/❌ | Notes |
|---|---|---|---|---|
| 1 | Load the URL and look at the **top of the page** | **The ⚠ NOT-REAL-DATA banner is GONE.** Not greyed out — absent. Every section is on real filings data | ✅ | **As expected — the banner is gone** |
| 2 | Scroll to §06 "Supply-side events" | Five lines, each on its own row: registration statements, prospectus supplements, tender offers, delisting, proposed-sale notices — with real counts and latest dates | ✅ | As expected — five facts, each on its own line |
| 3 | §06 timeline | One band, "Next 13F window · 13F-HR · 45 days", running from today to the deadline, with month gridlines | ✅ | As expected |
| 4 | **§06 the caption under the facts — the judgement row** | It should name the window: *"counted over 1,000 indexed filings, 2015-06-01 to 2026-07-31"*. **Does "none found" read as scoped to that window, or does it read as "never happened"?** | ✅ | **Reads as scoped to the window** — the judgement row, clean |
| 5 | Same caption, last sentence | It should say these are filings that EXIST, and that lock-up length lives in an exhibit we do not parse — so no count here answers it | ✅ | As expected — the existence-vs-terms boundary lands |
| 6 | Click **⤡ Expand** on the supply card | The timeline opens full-width under "Windows and expiries ahead" | ✅ | As expected |
| 7 | Open **+ Also in this section** → "Insider filings" | A real count: "N of M reported transactions were made under a Rule 10b5-1 plan, across K insider(s)", and a second line reporting rows with **no plan marking** as **unknown, not discretionary** | ✅ | As expected — unmarked rows read as unknown, not discretionary |
| 8 | "Register mechanics" → the two charts | Two cards **side by side**, each with its chart at normal size — not stretched with oversized labels | ✅ | As expected — two cards side by side, charts at normal size |
| 9 | The acceptance-lag caption | "When EDGAR ACCEPTED each 13F-HR…", and it reports **how many of the register's managers were measured** ("over 3 of the 7 managers…") | ✅ | As expected — the measured population is stated |
| 10 | Scan §06 for things that should be **absent** | **No** "index inclusion event", **no** "No lock-up restrictions", **no** "No confidential treatment requests". All three were removed as unsourceable or inferred | ✅ | **All three are gone** |
| 11 | Open **http://localhost:8010/company/JPM/institutional** → §06 | JPM's index covers ~1 year, so it legitimately shows "Registration statements: none found" over that shorter window — the caption's dates should differ from AAPL's | ✅ | **As expected — the shorter window is visible** |
| 12 | Narrow to phone width | No horizontal scrollbar in §06 | ✅ | As expected |

## The judgement call

**Row 4 is the one QA cannot settle.** The data is right and the window is printed. What I cannot
tell you is whether a reader takes *"Tender offers: none found"* as **"none in the window we
read"** or as **"this never happened"**. If it reads as the second, the copy needs to change — the
count is not the problem, the framing is.

→ ✅ **OPERATOR: "Reads as scoped to the window."** And **row 11 corroborated it independently**:
JPM's visibly shorter window read as a shorter window rather than as a company that never filed.
**The checked-vs-asserted distinction lands — D-supply is delivered, not merely implemented.**

## Known and deliberate — not defects

- **🔶 The "10b5-1 cooling-off" timeline row is gone.** → ✅ **OPERATOR: "Accepted as built."** `aff10b5One` says a trade was made *under*
  a plan; it does not carry the plan's **adoption date**, and a cooling-off window can only be
  drawn from one. The flag feeds the count on the insider card instead. Drawing the band from
  anything else would be inventing a date.
- **JPM shows fewer supply events than AAPL** because EDGAR's recent window for a prolific filer
  covers about a year, not a decade. That is the window doing its job, not a gap.
- **The lag histogram is a single bar** on this fixture (two filings, both at 45 days). Real, if a
  dull demo.
- §07 is reference copy and is unchanged by design.

## Sign-off

- [x] ✅ **Confirmed** — *"Confirmed — I drove it and I accept it"*
- [ ] **Defect found**

**Operator:** tijesunimi-peters  **Date:** 2026-08-01
**Walked interactively** in three batches; every answer transcribed verbatim above.

**Discrepancies / notes:**

```
None. All 12 rows returned as expected on the first pass -- the THIRD gate in
succession to run that way.

The judgement row landed: "Tender offers: none found" reads as scoped to the window
printed beneath it, not as "this never happened". Row 11 corroborated it from the
other direction -- JPM's visibly shorter index window read as a shorter window
rather than as a company that never filed a registration statement. That is the
whole of D-supply, and it is the reason the ingest was worth building rather than
empty-stating the card.

The one deviation raised -- the removed 10b5-1 cooling-off band -- is ACCEPTED AS
BUILT.
```

## ✅ Gate closed — and phase 2 is complete

**§06 is operator-accepted. §01–§06 are ALL accepted, and D-literals is satisfied:** no prototype
literal remains anywhere in the ported Institutional view, which is why the NOT-REAL-DATA banner
is gone rather than hidden.

§07 is reference copy and stays as written.

*A ❌ on any row is a defect → back to the owning engineer, then re-QA. There is no
"accepted at the QA-tester level" option (D-manual-gate, 2026-07-31).*
