# 4b — Operator manual verification · V3-P5a phase 2, **§04 and §05**

**Purpose:** your hands-on acceptance of the two sections built since the last gate.

| | |
|---|---|
| **Branch** | `v3-p5a-institutional` @ `96850da` |
| **QA verdict** | **PASS** — four defects found and fixed this cycle (`4-qa.md`, D-QA-4…7) |
| **Start the app** | `docker compose --profile e2e run --rm -d -p 8010:8000 --name p5a-preview e2e-app` |
| **URL** | **http://localhost:8010/company/AAPL/institutional** |
| **Time** | ~5 minutes |

> ⚠️ Five QA pairs are on disk; only the filenames tell them apart. `*-phase1.md` = the fidelity
> gate · `*-p2-s01.md` = §01 · `*-p2-s0203.md` = §02+§03 · **this pair = §04+§05.**

## The load-bearing rule for this change

**Three blocks on these two sections have no data behind them, and they must not all sound the
same.** There are two different reasons for a gap, and collapsing them would misreport a
permanent scope decision as a temporary backlog item:

- **"We do not parse this kind of document."** 8-K Item 5.07 is narrative HTML. This is a
  standing decision, not a to-do — its copy must not imply "coming soon".
- **"We have not ingested this yet."** N-PX and N-PORT are structured XML, so they are genuinely
  things this product *could* ingest. Those are real coverage gaps and may say so.

## Checklist

| # | Step | Expected result | Result ✅/❌ | Notes |
|---|---|---|---|---|
| 1 | Load the URL and scroll to **§04** | Banner now names **§06 only**. §04 shows real filer names, not "Index manager B" | | |
| 2 | §04 lane chart | One lane per holder, a dot per filing, the stake above each. Event labels read **"initial" / "amendment 1" / "amendment 2"** — never "amendment 0" | | |
| 3 | §04 lane chart, left edge | The first event label does **not** collide with the lane's `SC 13G` label | | |
| 4 | §04 "Current filings on file" | Second line is the **reporting-person type** ("Investment adviser"), not Item 4 prose. A holder at **0.0%** is marked **"reported below 5% and exited"** — not shown as a current 0% holding | | |
| 5 | **§04 "Voting behavior" — a judgement row** | Empty state. Does it read as *"we don't do this kind of document"* rather than *"coming soon"*? | | |
| 6 | §04 → **+ Also in this section** → "Vote-weighted ownership" | A **different** empty state: N-PX is structured XML and simply not ingested yet | | |
| 7 | §04 "Activism trail" | Counts real filers and amendments. Says nothing about 8-K exhibits (we don't ingest them) | | |
| 8 | §05 "Holder persistence" | Turnover and median holding period are real. **"8+ quarters" reads N/A with a chip**, not 0% | | |
| 9 | §05 retention grid | One row per entry cohort. A **starred** row is left-censored, and the caption explains it | | |
| 10 | §05 → click either **ƒ DERIVED** badge | The panel names **this issuer's actual window** ("4 ingested quarters, 2Q25 to 1Q26"). **No "1Q22" anywhere** — that was a baked-in literal no screenshot could catch | | |
| 11 | §05 → **+ Also in this section** | The expander exists and reveals "Fund-level positions" — a third empty state (N-PORT, not ingested) | | |
| 12 | Narrow to phone width, both sections | No horizontal scrollbar | | |

## The judgement calls

- **Steps 5/6/11 — the three empty states.** Read all three. **Do they read as different kinds of
  gap, or do they blur into "no data"?** This is the whole point of the two sections and the one
  thing QA cannot settle.
- **🔶 N-PORT was decided WITHOUT asking you.** You ruled on N-PX one section ago (D-voting):
  structured-XML form, not ingested → honest empty state saying "not ingested yet". N-PORT is the
  same shape, so I applied the same answer rather than re-asking. **If you read N-PORT
  differently, say so** — it is one paragraph.

## Known and deliberate — not defects

- The **retention grid reads 100 in every cell** on this fixture, because the seeded managers all
  persist across the four ingested quarters. Correct, if a dull demo.
- §05 shows **both** retention and tenure. They are different measures — tenure counts current
  holders backwards from the newest quarter, retention follows each cohort forwards — and a
  register can have long tenure and poor retention at once.
- **Page load ~3–5 s** on the whole-market volume; raised in the previous gate, unchanged.

## Sign-off

- [ ] **Confirmed** — I drove it and I accept it
- [ ] **Defect found** — details below

**Operator:** ______________  **Date:** ______________

**Discrepancies / notes:**

```
```

*A ❌ on any row is a defect → back to the owning engineer, then re-QA. There is no
"accepted at the QA-tester level" option (D-manual-gate, 2026-07-31).*
