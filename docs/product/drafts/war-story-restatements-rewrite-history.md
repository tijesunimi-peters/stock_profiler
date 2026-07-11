<!--
Draft war-story post #3 of 3. Status: draft, ready for editorial pass before publishing.
Target: personal/company blog, dev.to; also usable as a comment-thread answer to
"why do two pulls of the same year give different numbers?" on HN/Reddit.
Verified against: docs/DATA_MODEL.md ("Handling the messy realities" -- Restatements;
"Anchored on period_end" section), normalize/metrics.py's R1/R9 rules (2026-07-11).
Compliance check at the bottom.
-->

# Restatements silently rewrite history. Most pipelines don't notice.

Here's a question that sounds like it shouldn't have a complicated answer: "what was
Company X's revenue for fiscal year 2022?" You'd think you fetch it once and it's fixed
forever -- it's the past, after all. It isn't fixed. The SEC lets, and sometimes
requires, companies to restate prior-period numbers in a later filing, and if your
pipeline just grabs "the latest value for that period" without keeping the history,
you'll get a different answer depending on *when* you asked, with no way to tell that
happened.

## Why this happens

A 10-K reporting fiscal year 2024 typically shows two or three years of comparative
figures -- 2024, 2023, sometimes 2022 -- so a filer can (and does) restate an earlier
year's numbers inside a *later* filing. Common reasons: a discovered accounting error,
a change in how a segment is classified, a reclassification between line items,
occasionally a restatement following an audit finding. The new filing doesn't edit the
old one -- the old filing is still on EDGAR exactly as filed -- but if you're building
a "current view" of a company's financial history, you now have two values for the same
concept and period, filed at different times, and only one of them is what the company
currently stands behind.

## The naive version breaks quietly

If you fetch a company's XBRL facts and just take "whatever comes back for
fiscal_year=2022, fiscal_period=FY," you can get either value depending on which
filing your fetch happened to pull from, or you can get both and not know which is
current. Neither failure mode throws an error. Your pipeline just returns a number,
confidently, and it might be the stale one.

## What we do instead

Every fact we store keeps its filing's **accession number** and **filed date**
alongside the value. Multiple values for the same concept+period are allowed to coexist
-- we never delete or overwrite a prior version. For "current" views, the latest
`filed` date wins. This means:

- You can always ask "what did the company report for FY2022 at the time" vs. "what do
  they currently stand behind for FY2022," because both are still there.
- A consumer who cached a value and never re-checks won't silently drift from what a
  fresh pull would return -- the pipeline is explicit about which filing a value came
  from, so staleness is visible rather than invisible.

## A second, sneakier version of the same problem

There's a labeling trap that looks unrelated but comes from the same root cause. The
SEC's own `fy`/`fp` fields describe the *filing's* fiscal context, not the individual
data point's own period -- a single 10-K can stamp **three different annual revenue
figures**, for three different actual years, all with the same `fp="FY", fy=2025`,
because it's presenting multiple years of comparatives under one filing's fiscal
label. If you key your data model off `fy`/`fp` the way the raw SEC API structures it,
you can end up conflating three distinct years' numbers under one label.

Our fundamentals-metrics engine (`normalize/metrics.py`) deliberately keys off each
fact's own `period_end` date instead -- an annual duration ending in calendar year *Y*
is fiscal year *Y*'s number, full stop, regardless of what fiscal label the filing that
contained it happened to use. Quarterly figures that aren't tagged directly (companies
routinely tag year-to-date and full-year durations but skip discrete Q4) get recovered
by differencing the periods that share a start date. It's more bookkeeping than trusting
the SEC's own labels at face value, and it's the only way we've found to get a
consistent, comparable time series instead of one that occasionally jumbles years
together.

## The honest caveat

None of this makes restated numbers "wrong" -- a restatement is often the *more*
correct figure, that's the whole point of restating. The failure mode we're describing
isn't "the data is bad," it's "silently picking one version without telling anyone
which, or when a filing changed it." Keeping both, labeled, and picking a documented
"current" rule is the fix -- not picking a fix that hides the fact there was ever a
choice to make.

---

*Compliance check: no investment-advice framing (this is entirely about data
correctness, not what a restatement implies for a decision); no exclusivity claim over
SEC data (explicitly public, our value-add is the lineage/labeling); no price-data
implication; 13F not discussed; no competitor named. Reviewed against
`marketing-guardrails`.*
