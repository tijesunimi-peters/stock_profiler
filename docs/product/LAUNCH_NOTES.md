# Launch notes

Template for capturing launch-day objections verbatim and running the post-launch
retro, per `docs/product/LAUNCH_READINESS.md` §7 and the `launch-campaign` skill
("capture every objection verbatim -- objections are free positioning and pricing
research"; "within a week: retro in the same file").

**Not filled in yet** -- this is the empty template, ready to use on launch day. Fill
in real entries; delete the bracketed placeholder text as each section gets used.

---

## Launch log

One entry per thread/post, in chronological order. Link the actual post; timestamp
each entry so the retro can reconstruct a timeline later.

### [Platform] -- [Show HN / Product Hunt / Indie Hackers / subreddit name] -- [date, time, timezone]

**Post link:** [url]
**Title used:** [exact title posted]

**Objections verbatim** (copy-paste exact commenter wording, don't paraphrase -- the
exact phrasing is the research):

- `[timestamp]` `[commenter/handle]`: "[verbatim quote]"
  - Our reply: [what we said, or link to it]
  - Follow-up needed?: [y/n -- e.g. a doc gap the objection exposed]

- `[timestamp]` `[commenter/handle]`: "[verbatim quote]"
  - Our reply:
  - Follow-up needed?:

**Bugs/issues reported live:** [list; note which were fixed same-day and how fast --
launch-day availability is explicitly about fixing and saying so in-thread]

**Traffic/signup snapshot at end of day:** [visits, signups, first successful calls --
pull from whatever's available; exact metric definitions live in the
`growth-analytics` skill if you need them]

---

<!-- Duplicate the block above for each platform/post. -->

---

## Retro (within one week of the first post)

Fill in once enough data exists to say something real -- don't force this before a
week has passed.

### Traffic & signups

| Source | Visits | Signups | First successful call (activation) |
|---|---|---|---|
| Show HN | | | |
| Product Hunt | | | |
| Indie Hackers | | | |
| Other (name it) | | | |

Activation = "first 200" per the launch-readiness definition
(`docs/product/LAUNCH_READINESS.md` §7) -- a signup that went on to make at least one
successful (2xx) request, not just a key issued.

### Which angle drew which audience

[e.g. "HN skewed toward the tag-mapping/normalization detail in comments; PH comments
were more about the free tier and UI." -- this is the qualitative read that should feed
back into `CAMPAIGN_OPTIONS.md`'s channel notes.]

### Objection patterns (roll up the verbatim log above)

- Most common objection: [ ] -- was our prepared answer
  (`docs/product/drafts/objection-answers.md`) sufficient, or did it need revision?
- Any objection we hadn't prepared for: [ ] -- add it to the objection-answers draft
  before the next launch beat.
- Any pricing signal (e.g. "I'd pay for X but not at Y"): [ ] -- feed into
  `pricing-strategy` work / `PRICING.md`, don't let it evaporate in a comment thread.

### What we'd change next time

[Concrete, specific -- not "do more marketing." e.g. "the /guide skeptical-five callout
should have linked directly to the methodology page's 13F section" or "we should have
had the Python example ready before the curl-only one got asked about twice."]

### Feed back into the living docs

- [ ] Update `docs/product/CAMPAIGN_OPTIONS.md` if a channel performed very differently
      than the recommended sequence assumed.
- [ ] Update `docs/product/drafts/objection-answers.md` with any new objection +
      answer that came up for the first time.
- [ ] Flag any doc-accuracy gap the thread exposed (wrong example, missing caveat) to
      the relevant track/owner -- don't let launch-day findings just live in this file.
