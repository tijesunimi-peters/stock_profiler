# writing track — progress notes

Dated, append-only log for the WRITING track of launch readiness
(`docs/product/LAUNCH_READINESS.md` §4, §5 copy parts, §7). Owns
`src/secfin/api/static/`, page routes in `src/secfin/api/main.py`,
`docs/product/drafts/`, this file. Does not flip checkboxes in
`LAUNCH_READINESS.md` -- that's the orchestrator's job on convergence; this file
is the evidence it converges from.

Note on worktree state: this worktree branched from `ca3d1f9` ("Product / Marketing
initial setup"), which predates other tracks' merges into `master` (currently 5
commits ahead, including a merged `launch-infra` track and a `docs/product/tracks/`
directory that doesn't exist in this worktree yet). This file and directory are
created fresh here per the track convention in `docs/product/tracks/README.md`
(read from the main checkout, not present in this worktree's history).

---

## 2026-07-11

### Setup

Loaded `marketing-guardrails` first, then `positioning-messaging`, `content-seo`,
`launch-campaign`. Read `docs/product/LAUNCH_READINESS.md` (§4/§5/§7),
`MARKET_FEASIBILITY.md`, `CAMPAIGN_OPTIONS.md`, `auth/tiers.py`, and the relevant
sections of `docs/DATA_MODEL.md` (13F, insider, restatement, coverage-floor
sections) before writing anything, per instructions. Also read the existing static
site (`index.html`, `guide.html`, `coverage.html`, `explorer.html`, `app.js`,
`style.css`, `guide.css`) and `api/main.py`'s page-route pattern
(`@app.get("/coverage")` etc.) to match the site's existing look and wiring, and
`api/routes.py` for the real `/statements` endpoint signature (verifying claims
before publishing them, per the ground rules).

### §4 Legal & trust pages -- all four created, marked draft

All four new static pages reuse `guide.css`'s existing `guide-hero` /
`guide-section` / `guide-table` / `guide-callout` classes (no new page-level CSS
beyond a small `.draft-banner` + two heading helpers added to `guide.css`) so they
match the site's existing look exactly, per the task's "ship as static pages
matching the existing site's look" instruction.

- **`src/secfin/api/static/privacy.html`** (route `/privacy`). States exactly what
  the running code collects at signup and why, verified against
  `storage/sqlite_api_key_repository.py`'s actual schema (email, key hash, tier,
  rate_limit_per_sec, daily_quota, active, created_at, per-day request counts) and
  `api/auth.py` (confirmed IP addresses are used only in-memory for the anonymous
  per-IP rate limiter, never persisted -- `client_ip` in `limit_anonymous_traffic`
  only feeds `TokenBucketLimiter.allow`, no DB write). Confirmed no analytics/
  tracking scripts exist anywhere in `static/` (`grep` for
  `google-analytics|gtag|analytics|plausible|mixpanel` across the directory: no
  hits) before claiming "no third-party trackers." States the no-email-verification
  gap, the lack of self-serve key revocation, and no-SLA honestly rather than
  implying more maturity than the code has. Contact address and repo link are
  explicit placeholders, flagged as a dependency below.
- **`src/secfin/api/static/terms.html`** (route `/terms`). Tier limits table is
  pulled verbatim from `auth/tiers.py` (free 5 req/sec / 1,000 req/day; basic 20
  req/sec / 25,000 req/day; pro 100 req/sec / 250,000 req/day) -- not re-derived,
  copied from the source of truth and asserted as such in a code comment in the
  page. No `docs/product/PRICING.md` exists yet, so pricing is stated as "free
  during beta" per the ground rules, with an explicit note that this must be
  revisited once a pricing decision lands. Includes acceptable-use, no-SLA-at-
  launch (own section, not buried), and termination (states key revocation is
  currently a manual/admin-gated action, matching the real state of
  `admin_routes.py`/ROADMAP, not implying a self-serve flow that doesn't exist).
  Governing-law clause is an explicit `[placeholder]` for operator/legal input.
- **`src/secfin/api/static/disclaimer.html`** (route `/disclaimer`). Short,
  standalone "data, not investment advice" page. States the 13F derived-delta +
  long-only + ~45-day-lag caveat in the same terms as `CLAUDE.md`/`DATA_MODEL.md`,
  plus the no-price-data statement and a "talk to a professional" close. Linked
  from **every page's footer** (see below), not just referenced in passing.
- **`src/secfin/api/static/methodology.html`** (route `/methodology`). The data
  source & methodology / E-E-A-T page: SEC EDGAR as source (with the exact API
  paths used, matching `CLAUDE.md`'s own source list), a per-dataset freshness/lag
  table separating SEC's own filing-deadline lag from our ingest lag, the full 13F
  caveat (long-only, 45-day lag, amendments, the thousands-vs-whole-dollars value
  convention change, the issuer-centric ambiguous-empty-result caveat -- all
  verified against `docs/DATA_MODEL.md`'s institutional-ownership section), a
  normalization explanation (candidate-tag lists, extension flagging, restatement
  handling), an explicit "what's not covered" callout (no prices ever, US-only, no
  narrative/Track 2 text, pre-XBRL floor, 13D/G mid-2025 structured-XML floor), and
  a licensing section that **explicitly does not mark the SEC redistribution
  re-verification as done** -- states it as an open item scheduled for launch week,
  per the task instruction not to close that checklist item from this track.

**Footer wiring (guardrail 2 -- disclaimer must be reachable, not just exist):**
updated `index.html` and `guide.html`'s static footers (Company column now links
Privacy/Terms/Disclaimer; Data column now links Methodology; added an explicit
"Data, not investment advice" link in the footer-bottom trust line, styled via a
new `.footer-bottom a` rule in `style.css`), `app.js`'s shared `footer()` builder
(adds Methodology + Disclaimer links, used by `coverage.html`, `company.html`,
`manager.html`, `compare.html`, `screen.html`, `components.html`), and
`explorer.html`'s standalone `explorer-footer` block. Verified with a test (below)
that `/`, `/guide`, and `/explorer` each render a `/disclaimer` link.

**Route wiring** (`src/secfin/api/main.py`): added `/privacy`, `/terms`,
`/disclaimer`, `/methodology` following the exact existing `@app.get("/coverage")`
pattern (plain `FileResponse`, `include_in_schema=False`) -- no other main.py
changes.

### §5 Onboarding funnel (copy parts)

- **First example fixed to be real, not fabricated.** The landing-page hero
  (`index.html`) previously showed a fictional endpoint
  (`/v1/financials/income-statement?ticker=AAPL&period=FY2023`) and a response
  shape that doesn't match any real model (`"income_statement": {...}` flat dict,
  a zero-padded-string CIK). Verified the actual endpoint against
  `api/routes.py` (`GET /v1/companies/{symbol}/statements/{statement}?year=&period=`)
  and the actual `Statement`/`StatementLine` Pydantic models in
  `normalize/schema.py` (`cik: int`, `lines: [{canonical_concept, value, unit,
  source_tag, is_extension}]`). Rewrote the hero to the real endpoint and real
  response shape, using Apple's real, internally-consistent FY2023 10-K figures
  (revenue 383,285,000,000; gross profit 169,148,000,000 = revenue minus cost of
  revenue 214,137,000,000; operating income 114,301,000,000 = gross profit minus
  R&D 29,915,000,000 minus SG&A 24,932,000,000; net income 96,995,000,000; diluted
  EPS 6.13 -- arithmetic checked, not just individually recalled) and the real
  GAAP source tags verified against `normalize/mapping.py`'s candidate lists
  (`RevenueFromContractWithCustomerExcludingAssessedTax`, `GrossProfit`,
  `OperatingIncomeLoss`, `NetIncomeLoss`, `EarningsPerShareDiluted`). Added a note
  that `interest_expense` is deliberately absent (Apple nets it into other
  income/expense -- a documented limitation in `DATA_MODEL.md`, not a bug), which
  doubles as an honest-limitations moment per `marketing-guardrails` rule 6.
- **Curl-then-Python quickstart example added** (`guide.html`, new "step 0" before
  the existing signup steps): the same real AAPL income-statement call, first as
  `curl`, then as Python `requests` iterating `statement["lines"]` and printing
  `canonical_concept`/`value`/`source_tag`. This is the public, keyless endpoint,
  so it's genuinely a zero-friction first call.
- **"Skeptical five" callout added** (`guide.html`, new `#skeptical` section
  immediately after the hero, before Quickstart, with its own TOC entry): answers
  data source, freshness, what's NOT covered (no prices/US-only/no Track 2 text),
  how 13F deltas are derived, and what free actually includes, up front, each with
  a link to the fuller section/page that backs it up.
- **Error-code table extended with "what to do next"** (`guide.html`, `#errors`
  section): added a third column to the existing 400/401/404/429/503 table. Also
  **fixed an accuracy bug found while verifying this**: the existing table claimed
  `503` was "reserved for internal admin operations -- not returned by any
  customer-facing endpoint," which is false -- `api/main.py`'s
  `_handle_upstream_transport_error` handler returns `503` for any customer-facing
  request that hits an upstream SEC timeout/connect failure. Split the row into
  `502` (SEC responded with an error status --
  `_handle_upstream_http_error`) and `503` (couldn't reach SEC at all, or the
  pre-existing admin-misconfiguration case), matching the real handler code and
  comment in `main.py` exactly.
- **FastAPI `/docs` presentability**: reviewed `_OPENAPI_DESCRIPTION` and
  `_OPENAPI_TAGS` in `api/main.py` -- already covers auth, the 13F derived-data
  caveat, and per-tag grouping reasonably well. Did **not** edit this: it's
  app-level FastAPI configuration, not a page route or a static file, and sits
  outside this track's stated lane (route/handler code is explicitly not mine to
  touch, and app-level docs config is adjacent enough to that boundary that I left
  it alone rather than risk a lane violation). No gap found worth flagging beyond
  what's already there.
- Did not touch `api/routes.py` or any endpoint handler/docstring, per the lane
  rule -- error-message wording improvements that would require handler-code
  changes were out of scope for this track and aren't needed here (the existing
  detail strings were already reasonable; the gap was in the docs page's
  explanation, not the API's own error text).

### §7 Launch assets -- all drafted under `docs/product/drafts/`

- `docs/product/drafts/war-story-revenue-is-15-tags.md` -- GAAP tag inconsistency
  (revenue's 4 real candidate tags, the `interest_expense` bank/JPM/BAC/MSFT/WMT
  gap-then-fix story, the bank/retailer structural-gap limitation), all pulled
  from real content in `mapping.py`/`DATA_MODEL.md`, not invented. Corrected the
  working title's "15" figure to "at least four" in the actual headline since only
  four real candidates are documented for revenue -- didn't want an unverified
  number in a published headline even though the filename (an internal slug) kept
  the working name.
- `docs/product/drafts/war-story-13f-trades-dont-exist.md` -- the snapshot-vs-
  transaction distinction, the three caveats (long-only, 45-day lag, amendments),
  and the real verified Berkshire Q1 2026 14-co-filer/`otherManagers2Info`
  attribution example from `DATA_MODEL.md`.
- `docs/product/drafts/war-story-restatements-rewrite-history.md` -- restatement
  handling (latest-`filed`-wins, never-delete) and the `period_end`-vs-`fy`/`fp`
  labeling trap from the metrics engine's design notes in `DATA_MODEL.md`.
- `docs/product/drafts/show-hn-post.md` -- war-story angle (three technical
  findings above, condensed), explicitly not a product pitch, with prepared
  in-thread context notes (expect "isn't SEC data free," expect a prices question,
  confirm the live signup path works before posting).
- `docs/product/drafts/product-hunt-listing.md` -- deliberately distinct angle
  (the product surface: Data Explorer, clean JSON, free-tier generosity) rather
  than reusing the HN war story, per `CAMPAIGN_OPTIONS.md`'s "never cross-post
  identical copy" guidance.
- `docs/product/drafts/objection-answers.md` -- the four required prepared
  answers ("isn't SEC data free," "how is this different from sec-api.io,"
  "is this investment advice," "where are the prices" -- both senses). The
  sec-api.io comparison states their real strength (full-text search) honestly,
  per guardrail 5. The "where are the prices" (dollar-pricing) half is left as an
  explicit bracketed placeholder pending the pricing decision -- not invented.
- `docs/product/LAUNCH_NOTES.md` -- template with a per-post verbatim-objection
  log structure and a retro section (traffic/signups/activation table, angle
  effectiveness, objection-pattern rollup, feedback loop back into
  `CAMPAIGN_OPTIONS.md`/`objection-answers.md`). Empty template only, as instructed
  -- nothing to log yet since there's been no launch.

Every draft ends with its own **Compliance check** paragraph per
`marketing-guardrails`' working conventions, reviewed against rules 1-6 individually
(13F derived-delta language, no-advice framing, normalization-not-data framing,
no-price-data statements, honest competitor comparison, limitations featured not
hidden).

### Tests added

`tests/test_static_pages.py` (new, follows `tests/test_app_auth_wiring.py`'s
`TestClient` pattern): verifies all four legal pages return 200 and contain their
key compliance content (draft banner present, tier numbers match `auth/tiers.py`
exactly, the 13F "not a record of trades"/"45-day" language is present on the
disclaimer, methodology states SEC EDGAR sourcing and the not-covered list), plus a
test that `/`, `/guide`, and `/explorer` each render a `/disclaimer` footer link.

**Verification run (Docker, per this repo's host-has-no-pip/venv constraint):**

```
docker compose --profile test run --rm test bash -c \
  "pip install -q -e '.[dev]' && pytest -q tests/test_static_pages.py tests/test_app_auth_wiring.py"
# 14 passed, 1 warning in 1.20s

docker compose --profile test run --rm test   # full suite
# 294 passed, 6 skipped, 1 warning in 3.86s

docker compose --profile test run --rm test bash -c \
  "pip install -q -e '.[dev]' && ruff check src/secfin/api/main.py tests/test_static_pages.py"
# All checks passed!
```

Full suite passes with no regressions; new tests pass; lint clean on the touched
Python files.

### Files touched (final)

Modified: `src/secfin/api/main.py`, `src/secfin/api/static/{app.js, explorer.html,
guide.css, guide.html, index.html, style.css}`.
Added: `src/secfin/api/static/{privacy,terms,disclaimer,methodology}.html`,
`tests/test_static_pages.py`, `docs/product/drafts/*.md` (6 files),
`docs/product/LAUNCH_NOTES.md`, this file.
Nothing touched outside the stated lane: no edits to `api/routes.py`, any other
file under `src/secfin/` outside `api/static/` and the `api/main.py` page routes,
`tests/` beyond the one new static-page test file, `deploy/`,
`docker-compose.yml`, other tracks' notes files, or `LAUNCH_READINESS.md` itself.

### Open dependencies for the operator / other tracks

1. **Legal review is required before any of the four new pages are treated as
   binding.** Every page carries a visible "draft -- review before launch" banner
   (or equivalent framing on the disclaimer) precisely because I'm not a lawyer and
   was told not to pretend otherwise. This is expected to be a human/operator
   action, not something a future agent run can close.
2. **Pricing decision** (`docs/product/PRICING.md` doesn't exist yet -- confirmed
   before writing). `terms.html` and `objection-answers.md` both currently say
   "free during beta" / leave a bracketed placeholder rather than inventing a
   number, per the ground rules. Once `PRICING.md` lands, both need a follow-up
   edit to replace the placeholder with real figures.
3. **Contact/support channel placeholders.** `privacy.html` and `terms.html` both
   have `[support contact -- placeholder]` and `[repo link -- placeholder]` -- no
   public support channel or repo URL exists in the codebase to link honestly yet
   (§6 "feedback/support channel" is a different track's item). Fill these in once
   that channel exists.
4. **Governing-law clause** in `terms.html` is an explicit placeholder needing an
   operator/legal decision (jurisdiction).
5. **SEC redistribution re-verification** stays explicitly open on the methodology
   page (not marked done), per the task instruction -- this is a launch-week
   operator action, not something this track can close.
6. **The §5 timed-stranger test and §2 external verification** need a deployed
   host, which doesn't exist yet -- left alone, as instructed.
7. Show HN / Product Hunt drafts assume the pricing story and a live deployed
   instance are both resolved before posting -- both are called out inline in
   `show-hn-post.md`'s "prepared context" section as pre-posting gates, not
   something this draft can satisfy on its own.
