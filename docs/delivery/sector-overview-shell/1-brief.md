# Brief — Single-sector page shell + sidebar submenu (Phase 1 of the sector-overview redesign)

Stage 1 (Product Manager) handoff. Task slug: `sector-overview-shell`.
Parent plan: `docs/REDESIGN_SECTOR_OVERVIEW.md` (Phase 1).
Design authority: `docs/layout_guides/00-global-conventions.md` §6/§7/§11, `01-sector-overview.md`.

## Problem / user

The `/sectors` page is today an **all-sectors sortable table** with per-row expansion. The redesign
(guide `00 §11`) commits to a **single-sector-at-a-time** model: the sector selector is the spine,
one sector fills the page, and the reader steps between sectors. Phase 1 delivers that **shell** —
the selection model, header, and sidebar navigation — by **re-homing the analytics that already
render today** under the selected sector, so no capability is lost. The **user** is the sector
analyst; success = they can pick any qualifying SIC sector (fast, searchable), land on its full
existing analytics, and step between sectors without losing their place, with the four-altitude
sidebar structure in place.

**Frontend-only.** Phase 0's `/sectors/theme-scores` scorecard endpoint is **not** consumed here
(that is the Phase 2 hero). No backend change.

## Scope gate (Track 1)

**PASS.** UI restructuring over four already-shipped Track-1 endpoints (`/sectors`,
`/sectors/{group}`, `/sectors/{group}/spreads`, `/sectors/{group}/lifecycle`). No free text, no LLM,
no new data, no market/price data.

## Scope

1. **Single-sector selector spine** replacing the all-sectors table (`static/sectors.html`,
   `sectors.js`, `sectors.css`):
   - A **searchable combobox** over every sector in `/sectors` (label + `group`), plus a
     **most-recently-viewed pill cluster** (the ~70-sector decision from the plan).
   - **Default sector:** largest by `peer_count` on first visit; **`?group=` URL param overrides**;
     **last-viewed persisted in `localStorage`** (reuse app.js's guarded try/catch pattern).
   - Selecting a sector **re-derives the whole page**, updates `?group=` (history, no reload —
     mirror `compare.js`), and writes last-viewed.
2. **Shared header** (`00 §6`): breadcrumb (Sectors → **selected sector name**), a quiet
   **peer-count pill** ("62 filers"), and the **as-of FY**. Filing-coverage % and same-store logic
   **stay deferred** — omitted, never faked.
3. **Body = re-homed per-sector analytics** for the selected sector, reusing today's renderers:
   - the **DuPont identity tree** (from the latest `/sectors/{group}` point),
   - the **aggregate ROE trend** with its 1Y/5Y/All range toggle,
   - the **per-sector metric spreads** small-multiple (`/sectors/{group}/spreads`),
   - the **cash-conversion-cycle / lifecycle trend** (`/sectors/{group}/lifecycle`).
   - The **aggregation honesty banner + caveats** (asset-weighted aggregate, not a median) stays
     at the top — the DuPont numbers are still aggregates.
4. **Sidebar submenu** (`static/script.js` `GROUPS`): convert the flat `Sectors` link into an
   **expandable parent** whose **only child now is Overview → `/sectors`** (marked `current` on the
   page). New expandable-group affordance extends the token-driven `side-group`/`side-link` CSS.
   **Company / Compare / Qualitative are NOT added** this phase; the existing top-level Company hub /
   Compare / Screen entries are **left exactly as they are**.
5. **Cross-page state** (`00 §7`): the selected sector (and the resolved as-of FY) are carried in
   the URL so navigating away and back preserves them; `localStorage` holds last-viewed.

## Out of scope (this phase — flag, don't build)

- **The composite scorecard hero** (`/sectors/theme-scores`) — Phase 2.
- **Peer strip, biggest-shifts band, theme drill-down tiles** — Phase 3.
- **The cross-sector "Spread within each sector" section** (today's `#spreads`, the box-per-sector
  view over `/sectors/spreads`): it is a **cross-sector** surface that contradicts single-sector
  focus, so it is **removed** in Phase 1. Cross-sector context returns as the **Phase 3 peer strip**
  (`00 §3b`). (Per-sector spreads — a box per metric for the one sector — **stay**.) See Risk R1.
- **Sub-industry (SIC-4) pill row**, filing-coverage %, same-store deltas, period picker — deferred.
- **Company/Compare/Qualitative altitude views** and their submenu entries — later phases.
- Any backend/endpoint change.

## Acceptance criteria (what QA will verify — by driving the page)

**Selection model**
- AC-1 On first load with no `?group=` and empty storage, the page selects a sector automatically
  (the **largest by `peer_count`**) and renders its analytics — never a blank body, never an
  all-sectors table.
- AC-2 `/sectors?group=<code>` loads that sector directly. An **unknown/below-min `group`** falls
  back gracefully (default sector or an honest "sector not found" state), never a broken page.
- AC-3 The selector is **searchable** (typing filters the sector list) and shows a
  **recently-viewed** cluster; choosing a sector re-renders the body **in place** (no full reload),
  updates the URL `?group=`, and persists last-viewed to `localStorage`.
- AC-4 Re-opening `/sectors` (no param) after viewing a sector restores the **last-viewed** sector
  from `localStorage`.

**Body (no regression)**
- AC-5 For a populated sector, the body renders the **DuPont tree, ROE trend (with a working
  1Y/5Y/All toggle), per-sector metric spreads, and the lifecycle/CCC trend** — the same analytics
  that render in today's expand detail, with the same labels/caveats.
- AC-6 The **aggregation banner + "how to read" caveats** are present and unchanged in meaning
  (asset-weighted aggregate, **not a median**).
- AC-7 The **header** shows the sector name (breadcrumb), a peer-count pill, and the as-of FY.

**Sidebar**
- AC-8 The `Sectors` sidebar item is an **expandable parent** with **Overview → /sectors** as its
  child; Overview shows the **current/active** state on the page. Company hub / Compare / Screen
  remain as **top-level** entries, unchanged. The submenu is keyboard-reachable and shows focus.

**Honesty & states (the brand)**
- AC-9 **N/A is never rendered as 0** anywhere (missing DuPont leg, empty spread, coverage gap in a
  trend line breaks the line — never a zero point).
- AC-10 **Loading / empty / error states are honest and per-panel:** a sector with no materialized
  detail shows an explicit empty state (not a broken/partial chart); a failed enhancement (e.g.
  lifecycle fetch) degrades without blanking the rest of the page; loading shows skeletons/placeholder,
  not a full-page spinner that hides the layout.
- AC-11 If **no sectors** are materialized at all, the page shows an honest empty state (not a crash,
  not a zero sector).

**UI/UX & platform**
- AC-12 **Theme-aware** (light + dark) via existing tokens — no hard-coded colors; **CSP-safe /
  self-contained** (no new external assets); layout holds at mobile width with no horizontal bleed;
  no clipped labels.
- AC-13 **Docker e2e headless render check passes** (no console/page errors) and the screenshots
  (default load, a selected sector, an empty/edge sector) look intentional on eyeball.
- AC-14 `pytest` stays green (no backend change; the existing sector-route tests and any
  `?group=` e2e path still pass).

## Risks / open decisions (mostly resolved; surface for the architect)

- **R1 — removing the cross-sector spread section.** The locked single-sector model and the plan's
  "no cross-sector overview between Phase 1 and Phase 3" note imply the current cross-sector
  `#spreads` section is removed now (its replacement is the Phase 3 peer strip). This **removes a
  shipped surface temporarily.** Called out so it is a conscious choice; the architect should
  confirm the removal (vs. parking it in a collapsed section) — default: **remove**, per the plan.
- **R2 — period axis.** Today the page is latest-FY only (no period picker). Phase 1 keeps that:
  the header shows the resolved as-of FY as **metadata**, and "period" in cross-page state is that
  resolved FY. **No period picker** this phase (deferred). Architect decides whether to thread a
  `period`/`year` param through state now or later.
- **R3 — one-item submenu UX.** The `Sectors` submenu has a single child (Overview) until later
  phases add altitudes. Acceptable transitional state (establishes the rail structure); the
  architect chooses the affordance (always-expanded vs. disclosure) — it must not look broken.
- **R4 — e2e fixture.** The e2e uses a seeded fixture DB. The selector/default-sector path must
  work against whatever sectors the fixture materializes (the current e2e auto-opens `?group=` — the
  new default-selection + `?group=` behavior must keep that render check green). Architect/engineer
  verify the fixture still exercises a populated sector.

## Handoff → Principal Architect

Frontend-only. Design the selector component + state model (URL param + `localStorage`), the
re-homing of the four existing renderers into a single-sector layout, the removal of the
all-sectors table + cross-sector spread section, the expandable-submenu affordance in
`static/script.js` (+ CSS), and the cross-page state carry. Resolve R1–R4. Map every AC to a
concrete check (e2e screenshot / driven interaction / pytest). Owner: `senior-frontend-engineer`.
