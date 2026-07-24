# 1 — Product Brief: Sector Analytics v2 routing swap (P7 / Migration M2)

**Task slug:** `sector-migration-swap`
**Stage:** Product Manager → Principal Architect
**Milestone:** Sector Analytics app v2 **P7** = Migration **M2** (the routing swap).
Source of truth: `docs/ROADMAP_SECTOR_MIGRATION.md` §117–145 (M2), amended by
`docs/ROADMAP_SECTOR_APP_V2.md` P7.

---

## Problem / user

The v2 **Sector Analytics app** (currently served at `/sector-analytics`) is complete and merged
(P0–P5 on `master`, merge `882200c`). It is the agreed **superset** of the old single-sector page
(`/sectors`, served by `sectors.js/html/css`) — minus the three charts the operator deliberately
dropped to match the v2 layout (DuPont tree / ROE trend / lifecycle; M1 parity port is **obsolete**,
`sector-parity` branch abandoned).

Today users still land on the **old** page at the canonical `/sectors` URL, while the new app sits at
a secondary `/sector-analytics` URL. Every internal "Sectors" nav link points at the old page. Until
the route is swapped, the finished v2 app is not the product users see, and the two URLs compete.

**Who this serves:** every visitor who clicks "Sectors" in the nav or has a `/sectors` bookmark — they
should reach the new app. Also anyone with an existing `/sector-analytics` link/bookmark — it must
keep working (301 redirect).

**How we know it's solved:** `/sectors` serves the v2 app; all nav lands there; old
`/sector-analytics` links redirect in cleanly (params preserved); the old page is still one route
away for instant rollback.

## Scope (smallest slice that delivers value)

**Backend (routing, `api/main.py`) — lands first:**
1. **Swap `/sectors` to the app.** `GET /sectors` serves `sector-analytics.html` (the `#app` shell +
   `sectorapp.js`), not `sectors.html`.
2. **301-redirect `/sector-analytics` → `/sectors`**, preserving query params `?group=`, `?view=`,
   `?symbol=`, `?a=`, `?b=` (the app already honors them; the redirect must carry the raw query
   string through).
3. **Legacy rollback route.** Add a plain, always-on `GET /sectors-legacy` serving `sectors.html` so
   the old page is one route away. **No env flag** (operator decision 2026-07-24: localhost dev is the
   only live context; prod rollback/sequencing is deferred to the `/devops-engineer` stage).
4. **Do NOT delete `sectors.*`** — that's M3, a later `/deliver`.

**Frontend (nav + e2e) — same branch, after backend:**
5. **Nav links → canonical `/sectors`.** Repoint the v2 app's own sidebar entry
   (`sectorapp.js:282` `["Sector analytics", "/sector-analytics"]`) and its active-state check
   (`sectorapp.js:285` `n[1] === "/sector-analytics"`) to `/sectors`. Audit every other `static/*`
   page for links to `/sector-analytics` (or an old-page-specific `/sectors` link) and point them at
   the canonical `/sectors`. (Note: the shared shell `script.js:28–29` already uses `href: "/sectors"`
   — verify it now lands on the app; likely no change, but confirm no dead/duplicated nav.)
6. **e2e shots (`scripts/headless_check.js`).** The 9 old-page `sectors*` shots currently drive
   `/sectors` and interact with old-page DOM — once `/sectors` serves the app they will break.
   Repoint them: **keep exactly one `sectors-legacy` shot** at `/sectors-legacy` (proves rollback
   renders while the flag/route lives), and drop the rest in favor of the existing `sectorapp*`
   shots (which already cover the app). Repoint the `sectorapp*` shots to `/sectors` (or leave on
   `/sector-analytics` to also exercise the redirect — architect's call; at least one must confirm
   the app renders at the canonical `/sectors`, including a deep-link like `?group=`).

**No new endpoints, no schema, no backend business logic.** The `/v1/sectors*` **API** endpoints are
untouched. This is routing + nav + e2e only (guiding principle 2: the backend is already complete).

## Out of scope (do NOT do here)

- **M1 parity port** (DuPont tree / ROE trend / lifecycle) — **obsolete**, dropped by the operator to
  match v2. Do not re-add these charts. If a parity gap seems to block the swap, **STOP and flag** —
  don't re-add.
- **M3 decommission** — deleting `static/sectors.js/html/css`, removing `/sectors-legacy`, and the
  docs/`CLAUDE.md` cleanup happen in a **later** `/deliver` after M2 bakes in prod. Keep `sectors.*`
  alive here.
- **Any `/v1/sectors*` API / endpoint / schema / normalize / storage change.** Track-1, routing-only.
- **Production deploy / analytical-batch sequencing** (running `sector_theme_scores` + metrics/peer
  pipeline so `/sectors` isn't honest-empty on cutover) — a **deploy** concern, operator-gated
  `/devops-engineer`, not part of this build.
- **Env flag / prod-only gating for the legacy page** — explicitly declined by the operator (keep it
  simple; plain always-on route).
- **Track 2 / free-text / LLM** — not applicable, but the standing guardrail holds.

## Acceptance criteria (what QA will verify)

- **AC-1** `GET /sectors` serves the **v2 app** — the response is `sector-analytics.html` (contains the
  `#app` shell and loads `sectorapp.js`), **not** `sectors.html`/`sectors.js`.
- **AC-2** `GET /sector-analytics` returns a **301 redirect to `/sectors`**, and the query string is
  preserved: e.g. `/sector-analytics?group=73&view=company&symbol=320193` → `Location:
  /sectors?group=73&view=company&symbol=320193` (all of `group`, `view`, `symbol`, `a`, `b` survive).
- **AC-3** `GET /sectors-legacy` serves the **old page** (`sectors.html` + `sectors.js`) and it
  renders/functions (rollback path verified). `sectors.*` files are **still present** (not deleted).
- **AC-4** Every internal "Sector analytics"/"Sectors" nav link across `static/*` points at the
  canonical **`/sectors`** — no link still targets `/sector-analytics`, no dead links. The v2 app's
  own sidebar shows the "Sectors/Sector analytics" entry as **active** when on `/sectors` (the
  active-state check was updated, so the highlight isn't lost).
- **AC-5** The app renders correctly at the canonical URL, including **deep-links**: `/sectors`,
  `/sectors?group=<g>`, `/sectors?view=company&symbol=<s>`, `/sectors?view=compare&a=<x>&b=<y>` all
  load the corresponding view/state (params honored post-swap exactly as they were at
  `/sector-analytics`).
- **AC-6 (honesty — carried over, must not regress):** N/A is never rendered as `0`; caveats +
  aggregation provenance intact; theme scores presented as **positions, not verdicts**; 13F/derived
  caveats unaffected. The swap is layout-neutral (same app), so this is a *no-regression* check on
  the app's existing honesty affordances, not new copy.
- **AC-7** `pytest` green (no backend logic changed, but routing tests must pass / be added for the
  new routes + redirect). Docker **e2e** passes and is **eyeballed**: the app renders at `/sectors`
  (incl. a deep-link), the `sectors-legacy` shot renders the old page, and no `sectorapp*` shot
  regressed. Other pages (`/`, `/company/*`, `/manager/*`, `/coverage`, `/guide`) still render and
  their nav to Sectors lands on the app.

## Risks / open decisions

- **R1 canonical URL — RESOLVED.** `/sectors` canonical, redirect `/sector-analytics` in (baked into
  the request; roadmap-recommended). No further operator input needed.
- **R4 legacy mechanism — RESOLVED (operator, 2026-07-24).** Plain always-on `/sectors-legacy`
  route, **no env flag**; localhost dev is the only live context, prod rollback/sequencing deferred to
  `/devops-engineer`. Retention window (one release vs fixed date before M3) is a later/deploy call,
  **not blocking** this build.
- **R2 / R3 (DuPont range / chart color)** — M1 concerns, **moot** (M1 dropped).
- **Redirect-param fidelity risk.** The main failure mode of a swap is a *dropped query string* on the
  301 or a *dead nav link*. AC-2/AC-4/AC-5 target these directly — QA should probe multi-param
  redirects and every nav entry.
- **e2e-shot breakage risk.** Old `sectors*` shots WILL break if left pointing at `/sectors` (now the
  app) — they must be repointed/dropped as in scope item 6, or the e2e run goes red for the wrong
  reason. Architect to specify exactly which shots move to `/sectors-legacy` vs drop.
- **Deploy sequencing (informational).** On prod, `/sectors` is honest-empty until the analytical
  batch runs — flagged for the operator/devops stage, out of scope here.

## Handoff → Principal Architect

Design the smallest change against the ACs above. Confirmed constraints:
- **Backend first** (the three `main.py` route changes: swap `/sectors`, 301 `/sector-analytics`→
  `/sectors` with param passthrough, add `/sectors-legacy`), **then frontend** (nav-link repoint +
  active-state fix + e2e-shot repoint) on the **same branch** off `master`.
- No new endpoints/schema/backend logic; `/v1/sectors*` untouched; `sectors.*` files retained.
- Specify: the exact FastAPI redirect construction that preserves the query string (301, carry
  `request.url.query`); the precise nav-link/active-check edits in `sectorapp.js` + any other
  `static/*` file the audit finds; and the exact `headless_check.js` shot set (which `sectors*` shots
  → drop, the one `sectors-legacy` shot to keep, whether `sectorapp*` shots move to `/sectors`).
- Map each AC to a concrete check (route test / redirect test / grep for dead links / e2e shot).
