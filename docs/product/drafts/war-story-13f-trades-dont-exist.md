<!--
Draft war-story post #2 of 3. Status: draft, ready for editorial pass before publishing.
Target: personal/company blog, cross-posted to dev.to; strong Show-HN candidate on its own.
Verified against: docs/DATA_MODEL.md ("Institutional ownership" section),
normalize/flows.py, sec/institutional.py (2026-07-11). Real Berkshire Hathaway 13F
figures referenced are the ones already verified end-to-end in DATA_MODEL.md.
Compliance check at the bottom.
-->

# 13F "trades" don't exist. Here's what the data actually says.

Open any finance site's "13F tracker" and you'll see language like "Berkshire Hathaway
bought 5.8M shares of X last quarter." That sentence describes something that, strictly
speaking, never happened in the data -- not because it's wrong, but because Form 13F
doesn't report trades at all. It's worth being precise about this, because the gap
between "what 13F actually is" and "what everyone says it is" is where most of the
sloppiness in institutional-ownership content lives.

## What 13F actually is

A Form 13F is a **quarter-end snapshot** of the long equity positions a manager held on
the last day of the quarter. That's it. There is no field for "shares bought on date X,"
no transaction log, no timestamp finer than "as of quarter-end." The SEC requires
managers with over $100M in qualifying securities to file one within **45 days** after
each quarter ends.

So where does "bought 5.8M shares" come from? Someone took this quarter's snapshot,
took last quarter's snapshot, and subtracted. That's a completely reasonable thing to
do -- we do it too -- but it's a **derived** number, computed by a third party, not
something the SEC published. The distinction matters because a derived number inherits
every limitation of the two snapshots it's built from, and those limitations rarely make
it into the "bought/sold" headline.

## What the derivation actually looks like

Our version of this (`normalize/flows.py`, `diff_snapshots`) does exactly what you'd
expect: fetch a manager's holdings for quarter *N* and quarter *N-1*, match positions by
security, and classify each one:

```
new       -- held in N, not held in N-1
added     -- held in both, share count increased
reduced   -- held in both, share count decreased
exited    -- held in N-1, not held in N
unchanged -- held in both, same share count
```

Every response carrying this data also carries a `caveats` field, always present, never
optional, spelling out the three things below. We think that's the actual minimum bar
for this kind of data -- not a footnote, not a methodology page you have to go looking
for, but attached to the response itself.

## The three things a "bought" headline usually skips

**1. Long-only, and only in scope securities.** 13F covers long positions in "Section
13(f) securities" -- common exchange-listed equities, basically. No short positions, no
cash, no non-US holdings, no options unless separately reported. A manager's real
portfolio, including hedges, can look very different from what its 13F implies. A "buy"
computed from 13F alone tells you about one slice of the book, not the whole strategy.

**2. The ~45-day lag means "current" is already stale.** By the time a 13F is filed and
you can compute a diff from it, the position it describes is already up to a quarter and
a half old. If a manager exited a position the week after quarter-end, you won't see
that for another 45+ days, and by then it'll show up as "still held" in the *next*
snapshot before the one after that shows the exit -- with no way to tell from the data
alone when inside that window the actual change happened.

**3. A quarter can be amended, and the amendment isn't always obviously flagged in
casual reporting.** `13F-HR/A` filings restate a quarter after the fact. We keep the
original and the amendment, with the later-filed one winning for "current," but a
consumer of 13F data who cached the original and never re-checked is now quietly wrong
about that quarter.

## A real, worked case

Berkshire Hathaway's Q1 2026 13F-HR (accession `0001193125-26-226661`) is co-filed by
**14** subsidiary managers -- GEICO, National Indemnity, and others -- each of which can
independently exercise discretion over a position. A single info-table row for Ally
Financial in that filing is attributed to a specific subset of those 14 (in this case,
managers `[2, 4, 11]`), not "Berkshire" as an undifferentiated blob. Diffing two
quarters at the manager level, without preserving that attribution, would already be
losing information the filing itself carries. Getting this right isn't exotic -- it's
just reading the cover page's numbered `otherManagers2Info` roster and each holding's
`otherManager` reference list -- but it's exactly the kind of detail that's easy to skip
if you're diffing quarters as a quick script rather than as a real data model.

## Why we bothered writing this down

None of this is a reason to avoid 13F data -- it's genuinely useful for understanding
quarter-over-quarter positioning at scale, and it's the only public window into what
institutional managers hold at all. It's a reason to be precise about what it is: a
derived view of a lagged, long-only, quarter-end snapshot -- not a trade feed. We'd
rather ship that sentence in every response than let "bought" quietly imply more
certainty than the data supports.

---

*Compliance check: no "buy/sell" language used without the derived/snapshot qualifier
attached (guardrail 1); no performance-implying language about what the positioning
means (guardrail 2); no claim that 13F data itself is exclusive to us -- it's explicitly
framed as public SEC data, our contribution is the derivation and its caveats
(guardrail 3); no price data referenced or implied (guardrail 4); no competitor named
or compared here (guardrail 5 n/a); the long-only/45-day-lag/amendment limitations are
the entire point of the post, not hidden (guardrail 6). Reviewed against
`marketing-guardrails`.*
