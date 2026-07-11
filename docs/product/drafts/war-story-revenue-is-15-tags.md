<!--
Draft war-story post #1 of 3. Status: draft, ready for editorial pass before publishing.
Target: personal/company blog, cross-posted to dev.to; also Show-HN-submittable on its own.
Verified against: src/secfin/normalize/mapping.py, docs/DATA_MODEL.md (2026-07-11).
Compliance check at the bottom.
-->

# "Revenue" is at least four different XBRL tags. Here's what that costs you.

If you've ever pulled a company's financials straight from SEC EDGAR expecting one
consistent `revenue` number, you've probably already found the seam: it isn't `revenue`.
It's `Revenues`, or `RevenueFromContractWithCustomerExcludingAssessedTax`, or
`SalesRevenueNet`, or `RevenueFromContractWithCustomerIncludingAssessedTax` -- and
which one a company uses depends on which accounting standard was in effect when they
filed, and whether their internal tagging team defaulted to the modern tag or an older
one that still validates fine.

The SEC's XBRL mandate (structured financial data, required by law since 2009-2012)
solved the "financial statements as unstructured PDF text" problem. It did not solve
the "financial statements as consistent structured data" problem. Those are different
problems, and the gap between them is the entire reason a "clean fundamentals API" is a
sellable thing when the underlying data is free.

## The concrete version

Here's the honest list our mapping table (`normalize/mapping.py`) carries for revenue
alone, in priority order:

```python
"revenue": (
    "Revenue",
    [
        "RevenueFromContractWithCustomerExcludingAssessedTax",  # modern standard (ASC 606)
        "Revenues",                                              # older / generic
        "SalesRevenueNet",                                       # pre-606 filings
        "RevenueFromContractWithCustomerIncludingAssessedTax",   # rarer, tax-inclusive variant
    ],
),
```

For each company and period, we walk this list and take the first candidate that
actually has a value. That's the whole trick, and it's not a clever trick -- it's a
list, built by looking at real filings until the gaps stopped showing up.

It gets worse before it gets better. Companies can also tag a concept with their own
**extension** element instead of a standard `us-gaap` tag -- something like
`acme:TotalTopLine` -- which is perfectly valid XBRL and completely invisible to any
mapping table that only knows the standard tags. We don't silently absorb these; we flag
them (`is_extension: true` on the fact) and leave them for review rather than guessing
that a company-specific tag means what it looks like it means. A wrong guess here is
worse than an honest gap, because it looks correct.

## It's not just revenue

`interest_expense` is worse. Real candidates we've had to add after finding they were
silently unmapped for large real companies:

- `InterestExpenseNonoperating` (Microsoft, Target)
- `InterestExpenseDebt` (Walmart)
- `InterestExpenseOperating` (JPMorgan, Bank of America -- confirmed by cross-checking
  against the sum of their own granular deposit/repo/debt-interest tags)

Before we added those three, our own coverage report showed `interest_expense` missing
for **half** of a seven-company sample that clearly reports the number -- just under a
tag we hadn't seen yet. After adding them: 6 of 7. The seventh, Apple, genuinely doesn't
tag a discrete interest expense line at all in recent 10-Ks -- it's netted into "other
income/expense." That's not a gap in our mapping; it's Apple's own filing choice, and we
report it as absent rather than inventing a number.

## The part that doesn't have a clean fix

Some of this isn't a missing-candidate-tag problem, it's a "the concept doesn't map at
all" problem. Banks don't report `gross_profit`, `cost_of_revenue`, `operating_income`,
`research_and_development`, or `sga_expense` in any form, because a bank's income
statement is built around net interest income and noninterest income/expense -- there is
no better GAAP tag to add for "a bank's cost of revenue," because the concept isn't
reported that way. `interest_expense` is the one line item that *does* map cleanly for
banks; everything else on that list comes back correctly absent, and no amount of
mapping-table cleverness changes that, because the underlying business doesn't produce
that number. Retailers have a milder version of the same problem: several tag SG&A but
never a rolled-up `operating_expenses` or discrete `gross_profit`, even though they
clearly compute both internally.

We think the honest move here is to say "not applicable, structurally" rather than
either fabricate a number or silently return an empty object that looks like a bug.

## Why this matters more than it sounds like

If you're building anything that compares companies -- a screener, a dashboard, an
agent that reads financials -- and you're pulling raw companyfacts JSON yourself, you
either:

1. Write and maintain this mapping table yourself (it's not hard to start, it's tedious
   to keep correct across thousands of filers and years of tag churn), or
2. Silently get it wrong for some fraction of companies without realizing it, because a
   missing tag doesn't throw an error -- it just returns nothing, or worse, the wrong
   thing if you picked one candidate and stopped looking.

We do this normalization once, keep the source tag on every fact for audit
(`source_tag`, `is_extension`), and keep improving the candidate lists as real coverage
reports turn up gaps. That's the whole product, honestly -- the data was always free;
this is the part that wasn't already done for you.

---

*Compliance check: no investment-advice framing (this is about data structure, not
what to do with the numbers); no claim of exclusive data (explicitly states SEC data is
free and this is a normalization story); no price-data implication; 13F not discussed
in this post so its caveat doesn't apply here; competitor claims: none made. Reviewed
against `marketing-guardrails` rules 1-6.*
