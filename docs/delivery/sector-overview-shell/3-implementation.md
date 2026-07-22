# Implementation — Single-sector page shell + sidebar submenu (Phase 1)

Stage 3 (Senior Frontend Engineer) handoff → QA. **Frontend-only.**
Branch: **`sector-overview-shell`**. Uncommitted.

## Branch note (read first)

Phase 0 (`sector-theme-scores`, commit `73a4768`) is committed locally but **not yet merged to
master**, and Phase 1 shares the redesign plan doc with it. So this branch is **stacked on
`sector-theme-scores`**, not off `master`. Phase 1's *code* has **no dependency** on Phase 0 (it does
not consume `/sectors/theme-scores`), so it rebases onto master cleanly once Phase 0 merges.
**Merge Phase 0 first, then Phase 1** (or merge both together). Flagged for the operator.

## What changed and why

Converts `/sectors` from an all-sectors table into the guide's **single-sector** surface: a selector
spine drives one sector's analytics, and the four-altitude sidebar structure is established. Frontend
only — no endpoint/schema change; reuses `/sectors`, `/sectors/{group}`, `/sectors/{group}/spreads`,
`/sectors/{group}/lifecycle`.

**Files:**
- `static/script.js` — `GROUPS` gains nested `children`; new `sideItem()`/`sideLink()` render a
  nested **parent button** (`.side-parent`, `aria-expanded`, default expanded) + indented children;
  a click handler toggles it (keyboard Enter/Space native to `<button>`; a parent click does **not**
  close the mobile drawer). `Sectors → Overview` is the only child now; Company hub/Compare/Screen
  stay top-level.
- `static/style.css` — `.side-nest`/`.side-parent`/`.side-caret`/`.side-children` (token-driven,
  focus-visible, caret rotates when collapsed). No new tokens.
- `static/sectors.html` — added `#sectorbar`, removed `#spreads`.
- `static/sectors.js` — **spine rewrite.** Removed the table (`COLS`/`renderGrid`/`wireGrid`/
  `sortedSectors`/`maybeAutoExpand`) and the whole cross-sector spread block
  (`SPREAD_GROUPS`/`renderSpreads`/`renderPicker`/`paintSpread`/`drawSpread`). Kept and re-homed the
  four renderers verbatim (`dupontTree`, `rangeControls`/`paintTrend`/`wireRange`, per-sector
  `paintDetailSpreads`/`drawDetailSpreads`, `paintLifecycle`/`drawLifecycle`). Added: `state{group,
  range,…}`; guarded `localStorage` MRU (`secfin:lastSector`, `secfin:sectorMRU`);
  `resolveInitialGroup` (`?group=` → last-viewed → **default = largest `peer_count`**);
  `renderSectorBar` (breadcrumb + `N filers`/`FYyyyy` pills + searchable combobox + recently-viewed
  pill cluster + not-found note); a **self-contained combobox** filtering the loaded list
  (arrow/enter/escape, mouse); `selectSector` (state + `history.replaceState ?group=` **no reload** +
  MRU/last-viewed + re-render in place); `renderBody` (the former per-sector detail against
  `state.group`, per-panel loading/empty/error, N/A never 0).
- `static/sectors.css` — added the sector-bar/selector styles (`.sb-*`); removed the table +
  cross-sector-spread styles; kept DuPont/trend/per-sector-spread/lifecycle styles.
- `scripts/headless_check.js` — PAGES per R4: dropped the 3 `?metric=` cross-spread shots; kept
  `sectors` (default landing) + `sectors-selected` (`?group=60`) + `sectors-lifecycle` (`?group=73`);
  added `sectors-selector` (combobox open — types "in") + `sectors-unknown-group` (`?group=99` →
  fallback note).
- Docs: `docs/REDESIGN_SECTOR_OVERVIEW.md` Phase 1 status.

## How I verified

- **`pytest` (Docker):** **506 passed, 6 skipped** — no regression (frontend-only, no backend touched).
- **e2e headless render check** (`docker compose build api` then the e2e profile): **HEADLESS CHECK:
  PASS**, `errors=0` on all 24 pages incl. the 5 sector shots. **Eyeballed** all four sector
  screenshots:
  - `sectors` — default landing on **Business Services** (group 73, largest `peer_count` 59):
    sidebar shows `Sectors ▾ / Overview` (active), Company hub/Compare/Screen top-level; sector bar
    (breadcrumb, 59 filers/FY2025 pills, combobox, Recent pill); DuPont tree hero
    (23.6% = 11.7% × 0.78× × 2.60×); ROE trend (5Y); per-sector spreads; lifecycle trend + caveats.
  - `sectors-selector` — combobox open on "in", filtered matches with filer counts, active row
    highlighted; Recent cluster shows two sectors (MRU accumulated).
  - `sectors-unknown-group` — `?group=99` → muted note "Sector "99" wasn't found — showing Business
    Services" + the default sector's full body (no broken page).
  - `sectors-selected` — `?group=60` (Depository Institutions/banks): correct bank DuPont
    (15.4% = 23.3% × 0.06× × 11.00×); **lifecycle shows the honest empty state** "No lifecycle
    aggregate on record for this sector yet — sparse coverage, not zero" (empty enhancement degrades
    without blanking — AC-9/AC-10).

## What QA should probe

- **AC-4** last-viewed restore: select a non-default sector, revisit `/sectors` (no param) → it
  returns there (the `sectors-selector` shot already lands on last-viewed 73 rather than re-defaulting).
- **AC-8** sidebar: parent button keyboard toggle (Enter/Space collapses/expands the children) +
  focus-visible; Overview `.current` on `/sectors`; top-level entries unchanged.
- **AC-9/AC-10** honesty: banks lifecycle empty state (verified); a missing DuPont leg → "—";
  trend coverage-gap break (group 28 skips FY2023 in the fixture).
- **AC-11** no-sectors empty state (the `!d.sectors.length` branch) — not in the fixture; check the code path / force an empty response.
- **AC-12** dark theme (token-driven; not in the e2e light shots) + mobile width (drawer + combobox).
- N/A never 0 anywhere; the aggregation banner still says "not a median".

## Notes / deferred

- The cross-sector "Spread within each sector" section is **removed** this phase (R1); cross-sector
  context returns as the **Phase 3 peer strip**. No cross-sector view exists between now and Phase 3
  (accepted).
- No period picker (R2); as-of FY is header metadata only.
- The `Sectors` submenu has one child (Overview) until later phases add Company/Compare/Qualitative
  altitudes (R3).
- No UI for the Phase 0 scorecard yet — that's Phase 2.
