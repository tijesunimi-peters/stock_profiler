# Brief — Company view prototype-fidelity pass

Stage 1 (Product Manager) handoff. Task slug: `company-fidelity`.
Governing directive: `docs/delivery/sector-app-followups.md` §"Governing directive". Reference:
`docs/design/sector-app-prototype/prototype.dc.html` **altitude-2 block (lines ~243–300)** + §5/§7/§8.
**Frontend-only.** Second fidelity iteration (Sector done: `sector-fidelity` `10cf5ba`); **Company
view only** (Compare, then Qualitative, come later).

## Problem / user

The Company view (altitude 2) works but diverges from the prototype: it opens on an empty state, the
breadcrumb name isn't interactive, and the header/composite/heading differ. The operator wants it to
match the prototype's layout, with any synthetic prototype element rendered as an **honest empty
placeholder** and real data kept where we have it. The **user** is the operator reviewing against the
prototype: success = the Company view opens **populated** on a default filer, matches the prototype's
header + rail + peer-distribution framing, lets you switch the focal from the breadcrumb, and never
fabricates a value.

## Scope gate (Track 1 / honesty)

**PASS.** Frontend-only; reuses shipped endpoints (`/companies/{symbol}/peers`, `/sectors`,
`/sectors/{group}/{metric}/companies`); no backend/schema; no fabricated data. Placeholders are honest
empty states; the composite stays a **real derived percentile** (labeled "not a ranked position"),
**not** a fabricated rank. **Honesty rail:** never a fake ticker, rank, trend, or count.

## Scope (Company view only)

1. **Default focal on load (F1).** With no `?symbol=` / focal picked, default to the **first company
   alphabetically in the largest sector by filer count** (reuse `/sectors` for the largest group +
   the dot-cloud endpoint for its companies; sort by name; `selectFocalCik` the first). Keep the
   honest **empty/error state as a fallback** if nothing resolves. (Supersedes Phase 2 AC-5.)
2. **Breadcrumb dropdown (F2).** The focal **company name** in the header becomes a **selectable
   dropdown** listing its **SIC peers** (the same companies as the dots); picking one calls
   `selectFocalCik` so the rail + dot-plots recompute (identical to a dot-click). Real peer filers
   only; ordering display-only (alphabetical).
3. **Header — prototype layout (F3).** `sector › [name▾] [ticker pill] [context pill] [filing basis]`:
   - **Ticker pill** — shown **only when known** (from a ticker search); **omitted** on a raw-CIK /
     dot-click / default focal. **Never a fabricated ticker.**
   - **Context pill** — real: e.g. "N peers · SIC {group}" (peer count from the dot-cloud payload).
   - **Filing basis** — real: "FY{year}" from `focalYear()`.
4. **"Peer distribution" framing (F3).** Add the bold **"Peer distribution"** section heading above the
   dot-plots (optionally group the plots in one shadowed card, prototype-style) and the explicit
   **"Click any peer dot to make it the focal filer"** affordance line.
5. **Composite card (F3 + operator decision).** Keep the **real derived composite percentile** styled
   like the prototype's card (kept labeled **"derived · not a ranked position"**), and add a
   **"trend — to be defined" placeholder** where the prototype's synthetic "vs last FY" move was
   (no fabricated trend). Make the composite card **click-to-decompose** — expand to show the per-theme
   percentiles that feed it (the rail already computes them).
6. **Color (F4-Company).** **No favorability color** — the prototype's Company view is color-free
   (neutral dots, focal `--accent` diamond); keep it. No-op beyond confirming.

## Out of scope (this iteration)

- **Compare / Qualitative** views (later fidelity iterations); the Sector view (done).
- Any **backend / endpoint / schema** change; any **real** ticker-on-cik / composite-rank / trend data
  (ticker omitted when unknown; trend is a placeholder; rank stays the honest derived percentile).
- **Fabricating** any value.

## Acceptance criteria (what QA will verify)

- AC-1 Opening the Company view with **no focal** lands on a **populated default filer** — the first
  company alphabetically in the largest sector — with the rail + dot-plots rendered; an honest
  empty/error state only if nothing resolves.
- AC-2 The breadcrumb **company name is a dropdown** of the focal's SIC peers; picking one re-focuses
  (rail + composite + dot-plots recompute). Real filers only.
- AC-3 The header shows a **context pill** ("N peers · SIC {group}") and **filing basis** ("FY{year}")
  from real data; a **ticker pill** appears **only when known**, never fabricated.
- AC-4 A **"Peer distribution"** heading + the **"Click any peer dot…"** affordance line are present.
- AC-5 The composite card keeps the **real derived percentile** ("derived · not a ranked position")
  and shows a **"trend — to be defined" placeholder** (no fabricated trend); clicking it **decomposes**
  into the per-theme percentiles.
- AC-6 **No favorability color** anywhere; dots neutral, focal `--accent` diamond (unchanged); "lower
  is better" stays a text marker.
- AC-7 **Honesty:** no fabricated ticker/rank/trend/count; placeholders unmistakably empty; N/A·N/M
  still excluded (never 0); percentiles favorability-adjusted.
- AC-8 **Platform:** CSP-safe (no CDN added); **mobile 390px** reflow no overflow; `pytest` green
  (no backend); Docker e2e passes + eyeballed.
- AC-9 **No regression:** Sector/Compare/Qualitative + `/sectors` still render; the header search +
  `?symbol=` preset + dot-click re-focus still work.

## Risks / open decisions (for the architect)

- **R1 — default-focal mechanics.** Confirm the reuse path: largest group from `/sectors` (max
  `peer_count`) → `/sectors/{group}/{metric}/companies` (a broadly-covered metric, e.g. `net_margin`)
  → sort by `name` → `selectFocalCik(first)`. Handle the async/loading + the fallback (empty/error) so
  the view never hangs or shows a broken default. Only default when there's truly no focal (respect
  `?symbol=`).
- **R2 — breadcrumb dropdown source.** Use the focal group's companies list (already in
  `state.coValues[group|metric]`) for the dropdown; de-dupe by cik, sort by name, wire to
  `selectFocalCik`. Decide the interaction (a `<select>` like Compare's A/B, styled into the
  breadcrumb).
- **R3 — ticker on focal identity.** The focal is keyed by **cik**; the ticker is only known when the
  search symbol was a ticker. Carry a `state.focalTicker` set from a ticker search; show the pill only
  when set; clear it on cik/dot-click/default. Never derive/fake a ticker.
- **R4 — composite decompose + trend placeholder.** The rail already computes the per-theme
  percentiles; the composite click expands to show them (no new data). The trend is a labeled
  placeholder, not a computed delta.
- **R5 — e2e/fixture.** The fixture already renders the Company view (`?symbol=900001`, SIC-35).
  Confirm the default-focal path resolves against the fixture (largest sector's first company) and add/
  adjust `headless_check.js` shots for: default focal (no symbol), the breadcrumb dropdown, the header
  pills, the composite decompose.

## Handoff → Principal Architect

Frontend-only. Resolve R1–R5, name the exact `sectorapp.js`/`sectorapp.css` changes, map every AC to a
concrete check, confirm no backend. Owner: `senior-frontend-engineer`, branch off `master`.
