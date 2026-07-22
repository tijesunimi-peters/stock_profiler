# QA — Single-sector page shell + sidebar submenu (Phase 1)

Stage 4 (QA Tester). Verdict: **PASS**. Frontend-only UI change. Verified by **exercising the
running feature** — the Docker e2e headless render check (rebuilt `api` image), a scripted
puppeteer **interaction drive** (20 assertions), and eyeballing the screenshots — not by reading the
diff. Branch: `sector-overview-shell` (stacked on Phase 0 `sector-theme-scores`, expected).

`pytest` **506 passed, 6 skipped** (no regression — frontend-only). e2e **HEADLESS CHECK: PASS**,
`errors=0` on all 24 pages. Interaction drive **QA-DRIVE: ALL PASS**. Cross-sector `#spreads` section
and `?metric=` confirmed **gone**.

## Per-AC verdict

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 default lands on largest-`peer_count` sector, not a table/blank | **PASS** | Drive: `/sectors` → breadcrumb "Business Services" (group 73, 59 filers); no `.sector-table`, `.dupont` present. |
| AC-2 `?group=` loads; unknown falls back with a note | **PASS** | Drive: `?group=99` → muted note "Sector "99" wasn't found — showing Business Services" + full body renders (screenshot `sectors-unknown-group`). |
| AC-3 searchable combobox + in-place re-render + URL + localStorage | **PASS** | Drive: type "depos" → filtered to Depository Institutions; click → breadcrumb updates, URL `?group=60` (no reload), `localStorage secfin:lastSector=60`, `secfin:sectorMRU=["60","73"]`. Screenshot `sectors-selector`. |
| AC-4 revisit `/sectors` restores last-viewed | **PASS** | Drive: after selecting 60, `goto /sectors` (no param) → lands on Depository Institutions. |
| AC-5 DuPont tree + ROE trend + working 1Y/5Y/All + per-sector spreads + lifecycle | **PASS** | Screenshots `sectors`/`sectors-selected`/`sectors-lifecycle`; drive: range toggle 5Y→1Y flips active + repaints trend `<svg>`. |
| AC-6 aggregation banner + caveats, "not a median" | **PASS** | Banner + "How to read (6 notes)" present in every sector shot; copy unchanged. |
| AC-7 header breadcrumb + peer-count pill + as-of FY | **PASS** | "Sectors › <sector>", "N filers", "FYyyyy" pills in all shots. |
| AC-8 sidebar expandable parent + Overview `.current` + top-level intact + keyboard | **PASS** | Drive: `.side-parent` present; `.side-children .side-link.current` = "Overview"; top-level = Company hub/Compare/Screen/Coverage/… intact; focus parent + Enter collapses (`aria-expanded`→false, children `display:none`), Enter re-expands. |
| AC-9 N/A never 0 | **PASS** | Banks (group 60) lifecycle → "No lifecycle aggregate on record for this sector yet — sparse coverage, not zero"; trend coverage-gap break preserved (group 28 skips FY2023 in the fixture; `windowedPoints` null-fill unchanged). No zeros substituted. |
| AC-10 honest per-panel loading/empty/error, failed enhancement degrades | **PASS** | Banks lifecycle empty state renders while the DuPont tree + trend + spreads above it stand (per-panel, not page-wide). |
| AC-11 no-sectors → honest empty state | **PASS** | Drive: intercepted `/v1/sectors` to return `sectors:[]` → `#view` shows "No sectors to show…" (no crash, no zero). |
| AC-12 theme-aware + mobile + no clipped labels | **PASS** | New CSS is fully token-driven (no theme-locked colors); **the app has no dark theme at all** — no `prefers-color-scheme`/`data-theme` anywhere — so "theme-aware" = tokens, satisfied. Mobile 390px: `scrollWidth−clientWidth=0` (no bleed); `qa-sectors-mobile.png` shows DuPont legs stacked, spreads intact, no clipping. |
| AC-13 e2e render check passes + eyeballed | **PASS** | `HEADLESS CHECK: PASS`, errors=0; eyeballed `sectors`, `sectors-selected`, `sectors-lifecycle`, `sectors-selector`, `sectors-unknown-group`, `qa-sectors-mobile` — all intentional. |
| AC-14 pytest green | **PASS** | 506 passed, 6 skipped. |

## UI/UX review

- **States** — all four render intentionally: populated (full re-homed analytics), loading
  (skeletons per panel), empty (banks lifecycle + intercepted no-sectors, both honest, never a zero
  box), and the unknown-group fallback gives *direction* ("showing Business Services") rather than an
  error. A failed/empty enhancement degrades without blanking the page.
- **Layout/legibility** — clean at 1280px and 390px; the DuPont identity tree remains the page's
  signature, promoted to the hero of the focused view; no clipped labels, no horizontal bleed.
- **Copy** — sentence case, active voice, honest: "asset-weighted aggregate, not a median" carried;
  the lifecycle lede keeps the "descriptive … not a signal about returns" framing; the combobox says
  "Search sectors…". No alpha/timing/price over-claiming.
- **Affordances/a11y** — combobox is keyboard-driven (arrows/enter/escape); the submenu parent is a
  real `<button>` with `aria-expanded`, keyboard-togglable, focus-visible; Recent pills mark the
  active sector; Overview carries `aria-current`.
- **Consistency** — reuses the shell, tokens, `.segmented` control, and the shared chart/state
  components; matches the STYLE_GUIDE and the company-hub reference.

## Observations (non-blocking)

- On first landing the "Recent" cluster shows a single pill (the landed sector). Expected — the MRU
  seeds with the landing sector and grows as you browse; not a defect.
- The `Sectors` submenu has one child (Overview) by design until later phases add Company/Compare/
  Qualitative altitudes.

## Handoff

**Verdict: PASS — no defects.** A green report unlocks a deploy *request*, not the deploy.

**Ready to deploy (frontend):** the change is static-asset only. Deploy = rebuild the `api` image
(it bakes in `static/`) and ship. **Branch is stacked on Phase 0 (`sector-theme-scores`, unmerged)** —
merge Phase 0 first (or both together); Phase 1's code is independent and rebases clean. Uncommitted,
not deployed. Next: operator may commit the branch and/or request a deploy (`/devops-engineer`).
