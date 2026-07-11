<!--
Show HN draft. Status: draft, ready for a final read-aloud pass before posting.
Angle: technical war story (per CAMPAIGN_OPTIONS.md Option 1 and the launch-campaign
skill) -- NOT a product pitch. Title options tested against the skill's guidance
("titles that work name the technical pain; titles that die have 'cheap', 'platform',
or a features list").
Compliance check at the bottom.
-->

# Show HN post

## Title (pick one, don't combine)

- "Show HN: I normalized every US-GAAP revenue tag the S&P 500 files with the SEC"
- "Show HN: SEC filings are free. Making the tags consistent across companies is not."
- "Show HN: What "13F trades" actually are, and why they don't exist in the data"

(Recommendation: the first one -- it's concrete, names the specific pain, and doesn't
require the reader to already know what a 13F is.)

## Post body

I spent the last several months building the normalization layer for a small API that
turns SEC filings into consistent JSON. The interesting part wasn't the API -- it was
how much work "consistent" turns out to require, and I wanted to share the specific
things that surprised me, in case they save someone else the same rediscovery.

**Revenue isn't one tag.** Companies tag it as `Revenues`,
`RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`, or the rarer
tax-inclusive variant, depending on which accounting standard was current when they
first tagged it and whether they ever migrated. None of these are wrong -- they're all
valid XBRL -- but a naive "just read the `Revenues` tag" script silently misses a good
chunk of real companies. `interest_expense` is worse: JPMorgan and Bank of America
don't use the tag a commercial company would use at all; they report it as an
aggregate of several granular deposit/repo/debt-interest tags instead. Apple, in recent
years, doesn't report a discrete interest expense line at all -- it's netted into other
income/expense. That's not a bug in anyone's filing; it's a real structural difference
in how a bank vs. a retailer vs. Apple's specific balance sheet works, and "add another
candidate tag" only fixes some of these gaps -- some genuinely don't map.

**13F doesn't contain trades.** This is the one people get wrong most confidently. A
13F is a quarter-end snapshot of long holdings; "manager X bought 500K shares" is
something you compute by diffing two snapshots, and I mean that literally -- there's no
transaction record anywhere in the filing. Every "activity" feed you've seen (including
mine) is doing this diff. The parts that get lost in the retelling: it's long-only, no
cash or shorts, filed with a ~45-day lag, and can be amended after the fact. A cluster
of 14 subsidiary managers (Berkshire's actual structure) can each independently hold
discretion over one position, and the filing tells you exactly which ones -- if you
diff at the parent level without preserving that, you've already thrown away
information the SEC filing itself gave you.

**Restatements silently rewrite the past.** The same fiscal year can appear with two
different values across two filings, because a later 10-K restated an earlier one.
There's no error, no warning -- just two numbers for "FY2022 revenue" depending on
which filing you happened to read. I ended up keeping every version with its filing
date rather than overwriting, because "current" and "as originally reported" are both
real things someone might want, and silently picking one is worse than being explicit
about the choice.

I'm not going to pretend the API itself is the interesting part of this post -- it's a
straightforward REST wrapper around this normalization work, generous free tier
(1,000 req/day), no card required. If any of the tag-mapping detail above is useful on
its own regardless of whether you ever touch the API, that's genuinely the point of
posting it. Happy to go deep on any of the above in the comments -- and if you've hit a
worse version of any of these tag inconsistencies in your own SEC data work, I'd like
to hear it.

## Prepared context for the thread (not part of the post itself)

- Have the three war-story drafts (revenue tags, 13F, restatements) ready to link if a
  comment asks for more depth on any one of them.
- Expect "isn't SEC data free?" in the first few comments -- see
  `docs/product/drafts/objection-answers.md` for the prepared answer; lead with "yes,
  and that's exactly the point" rather than getting defensive.
- Expect someone to ask for prices. Answer honestly and immediately: no price data,
  ever, by design -- see the prepared answer.
- HN will test the free tier live within minutes of posting. Confirm the signup path,
  a real curl call, and a 429 all still behave *before* posting (see
  `docs/product/LAUNCH_READINESS.md` §5's timed-stranger-test and §2's deployed-host
  checks -- both operator items, not this draft's job, but this draft is not ready to
  post until they're green).

---

*Compliance check: no "cheap"/feature-list framing in the title per the launch-campaign
skill's guidance; "buy/sell"/13F language carries the derived-snapshot qualifier inline
(guardrail 1); no investment-advice framing anywhere (guardrail 2); explicitly says SEC
data is free and frames the product as normalization work, not data exclusivity
(guardrail 3); explicitly states no price data (guardrail 4); no competitor named in
the post body (guardrail 5 n/a here; comparison answers live separately); structural
limitations (bank/retailer tag gaps) are the selling point of the post, not hidden
(guardrail 6). Reviewed against `marketing-guardrails`.*
