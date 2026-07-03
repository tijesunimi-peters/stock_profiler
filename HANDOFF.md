# Handoff — SEC Financial Data API (Profin)

Context dump for picking up this project cold. Read `CLAUDE.md` first (repo working
agreement, architecture, conventions, guardrails) — this file is the "what's actually
been done and what's next" layer on top of it.

## What this is

A pipeline + API that ingests structured SEC XBRL data, normalizes it into one canonical
schema, and serves it as JSON — a low-cost subscription alternative to enterprise
financial-data vendors. Marketing name: **Profin**. Scope is deliberately "Track 1"
(structured numeric data) only — income statement, balance sheet, cash flow, insider
trades, institutional (13F) ownership. No free-text/MD&A parsing, no LLM summarization
(see `CLAUDE.md` guardrails — flag rather than build if a task drifts there).

## Repo state at handoff

- 4 prior commits: initial scaffold → docker/duckdb planning → bulk backfill pipeline →
  docs update. See `git log` for detail; commit messages are accurate summaries.
- **Uncommitted right now**: a marketing landing page just built (see below) —
  `src/secfin/api/main.py` modified, `src/secfin/api/static/` added, untracked. Not yet
  committed; user has not asked for a commit.
- Tests exist under `tests/` (backfill, bulk parity, daily index, flows, mapping,
  storage) — run via Docker (`docker compose run --rm api pytest`), not host Python (see
  "Environment" below).

## Implemented vs. stub (by file)

| Area | File | Status |
|---|---|---|
| SEC HTTP client (User-Agent + throttle) | `sec/client.py` | done |
| Company facts fetch + flatten | `sec/companyfacts.py` | done |
| Insider trades (Forms 3/4/5) | `sec/insider.py` | **stub** (43 lines, docstring plan only) |
| Institutional (13F/13D/13G) | `sec/institutional.py` | **stub** (75 lines) |
| Canonical schema | `normalize/schema.py` | done |
| Concept → GAAP tag mapping | `normalize/mapping.py` | starter coverage, needs expansion |
| Statement builder | `normalize/statements.py` | done |
| 13F diff → derived buy/sell | `normalize/flows.py` | done |
| Storage interface + SQLite impl | `storage/` | done (WAL mode, idempotent upsert) |
| Bulk backfill pipeline | `ingest/backfill.py` | done (multiprocessing parse, single writer) |
| Daily incremental ingest | `ingest/incremental.py` | done |
| API routes | `api/routes.py` | statements + periods endpoints work; insider-trades,
  institutional-holders, institutional-activity, manager-holdings all return `501` |
| **API routes read path** | — | **routes.py still hits the SEC live per request** — the
  storage/cache layer exists and is populated by backfill, but routes haven't been
  switched to read from it yet. This is the single highest-value next step in Milestone 1. |
| Marketing landing page | `api/static/` | **new this session**, see below |

## What just happened this session: landing page

User supplied a design handoff zip (`~/Downloads/SEC Financial Data API.zip` →
`design_handoff_profin_landing/README.md` + a hifi `.dc.html` prototype) for a
**Profin marketing landing page**. Built and verified:

- `src/secfin/api/static/index.html`, `style.css`, `script.js` — static HTML/CSS/vanilla-JS
  recreation of the design (warm-paper palette, Hanken Grotesk + IBM Plex Mono, hero code
  panel with syntax highlighting + blinking cursor, before/after XBRL-tag diagram, 4-card
  features, dark coverage block, pricing card, footer). No JS framework added — this repo
  is Python-only, so the page is served directly by FastAPI rather than standing up a
  separate Node toolchain.
- `src/secfin/api/main.py` — mounts `/static`, serves the page at `GET /`.
- **Decisions made with the user** (both explicitly confirmed, not assumed):
  1. Serve as static HTML via FastAPI, not a separate React/Vite app.
  2. "Get an API key" CTAs anchor to the pricing section, which carries an honest inline
     note that signups aren't open yet (API keys/auth/billing is unbuilt — Milestone 3).
     No fake signup flow, no invented email/mailto.
- Real wiring used: Docs / API Reference / "View the docs" → `/docs` (FastAPI's own
  Swagger UI — the only real docs surface that exists); footer "Status" → `/health`.
- Verified end-to-end: `docker compose build` (confirms static files bundle correctly
  into the installed wheel — `hatchling` picks up `src/secfin/api/static/*` automatically),
  then a headless-Chromium (Playwright, manually installed this session — not a repo dep)
  screenshot pass at 1280px and 390px viewports, checked responsive collapse (two-column
  → one column below 840px, mobile hamburger nav toggle works), zero console errors.
- **Not committed yet.**

Follow-ups noted but not done: self-hosting the Google Fonts (README recommends it for
prod perf/privacy; currently CDN-linked, matching the prototype); wiring a live hero
example instead of the static AAPL FY2023 figures, once an endpoint exists to source it
from.

## Environment / working-agreement notes (from memory, confirmed accurate)

- **This host has no pip/venv usable for this project — build/run/test via Docker, not
  host Python.** `docker compose build && docker compose up api`, or
  `docker compose run --rm api pytest`.
- Docker image bakes `src/` in at build time (no live mount) — **rebuild after every
  source change** before testing in a container.
- `SEC_USER_AGENT` must be a real descriptive string + contact email; `.env` (gitignored,
  copied from `.env.example`) already exists locally with a placeholder — fine for dev,
  must be real before any production/live-SEC traffic.

## Suggested next steps (priority order, per ROADMAP.md)

1. Decide whether to commit the landing page as-is.
2. Wire `api/routes.py` to read from the SQLite storage layer instead of hitting SEC
   live per request — storage exists and backfill populates it, this is just the last
   wiring step of Milestone 1.
3. Expand `normalize/mapping.py` income-statement coverage, measure with
   `statements.coverage_report()`.
4. Add real tests against saved companyfacts fixtures (Apple, a bank, a retailer —
   picked to stress different tag conventions).
5. After that, Milestone 2: implement `sec/insider.py` (Forms 3/4/5 XML parsing) — it
   already has a docstring plan to follow.

## Guardrails to carry forward (see CLAUDE.md for full detail)

- Track 2 (free text, LLM summarization) is explicitly out of scope — flag, don't build.
- Never weaken the SEC rate limit or drop the User-Agent.
- New canonical concept → update `normalize/mapping.py` **and** `docs/DATA_MODEL.md`
  together.
- DB access stays behind `RawFactRepository`; no raw SQL in the API layer.
- DuckDB (planned, not yet built) is analytical/batch-only — never on the live request
  path.
- Bulk backfill: only the writer process touches SQLite; parsers never open the DB
  connection directly.
