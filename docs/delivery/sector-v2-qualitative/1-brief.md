# P4 — Qualitative view v2 (placeholder expansion) · Product brief

**Task slug:** `sector-v2-qualitative`
**Stage:** 1 — Product Manager
**Branch:** `sector-v2-qualitative` (stacked on `sector-v2-compare`; both off `master`)
**Classification:** frontend-only · **Track-2 → honest placeholder layout** (no new data, no backend)
**Reference:** `docs/ROADMAP_SECTOR_APP_V2.md` P4 · `docs/design/sector-app-prototype-v2/HANDOFF.md`
§5.4 + §6 (interaction model) · shipped view `renderQualView` / `pa-qual-*` in
`src/secfin/api/static/sectorapp.js` + `sectorapp.css`.

---

## Problem / user

The Sector Analytics app's **Qualitative view (altitude 4)** currently ships as an honest but
*shallow* placeholder: a "Track 2 · not yet derived" banner over a small risk-factor-theme list,
three side cards, and a per-filer matrix stub. The v2 prototype specifies a **much fuller layout**
for this view — one that shows a prospective user the *full shape* of what qualitative/narrative
coverage will look like (risk-factor themes with coverage + direction, representative language,
per-filer signals, and a 7-block **Disclosure landscape**), so the honest "not yet" reads as a
**deliberate, mapped-out roadmap** rather than a thin apology.

**User:** a developer/analyst evaluating ClearyFi who clicks into Qualitative to see whether
narrative disclosure (risk factors, going-concern, CAMs, cyber, auditor changes) is covered. Today
they see a stub and can't tell what's planned. **Solved when** they see the complete intended
layout — every region of it — with every data cell an unmistakable placeholder, and come away
understanding *exactly* what Track 2 will deliver and that **nothing shown is fabricated**.

This is a **Track-1-only product** decision made visible: Qualitative is Track 2 (free-text
narrative), which `CLAUDE.md` marks as a deliberate later decision. P4 does **not** start Track 2.
It only expands the *placeholder layout* so the view stops looking half-built.

## Scope

Evolve the shipped `renderQualView` (and its `pa-qual-*` CSS) from the current banner+partial layout
to the v2 prototype's fuller **placeholder** shape. All additions are inert layout — no derived
value, count, %, ●-flag, ticker, excerpt, or direction chip carries a real or invented figure.

**In scope (all placeholder, per prototype §5.4):**

1. **Keep the honesty frame** — the section head, sub, and the "Track 2 · not yet derived" banner
   ("structured SEC data only … free-text narrative … deliberate later decision … nothing here is
   fabricated"). This is the load-bearing honesty copy; it stays verbatim in spirit.
2. **Risk-factor themes** (left column) — the 7 real theme **labels** (already present:
   `QUAL_THEMES`), each row showing the *shape* of a coverage bar + a **YoY direction chip** slot —
   but the chip renders a neutral placeholder token (e.g. `—` / "planned"), **never** an invented
   `new/rising/fading/stable`. Each row gets:
   - a persistent **"Filings →"** affordance (visual only; the Filings view is P5 and not built —
     so it is a **no-op stub** with `preventDefault`, matching the prototype's stub pattern), and
   - **click-to-expand representative language**: clicking a row toggles an inline panel that, in
     the placeholder, reveals an **honest empty state** — "verbatim excerpt + source will appear
     here · to be defined · no filing text shown" — **never a fabricated quote**.
3. **Side panels** (right column) — Emerging this year / Going-concern watch / Material litigation
   (already present as `QUAL_SIDE`), kept as empty "to be defined · no filers shown" cards.
4. **Per-filer signal matrix** — column headers (Filer / Risk factors / New / Going concern /
   Litigation, already `QUAL_MATRIX_COLS`) over an honest empty body (no fabricated filer rows).
5. **NEW — Disclosure landscape section** (the main addition): a labelled section with **7 blocks**:
   **Cybersecurity** (Item 1C + 8-K 1.05), **Critical Audit Matters**, **Auditor landscape**
   (share + changes + tenure), **Risk-factor volume** (Item 1A word-count trend + net-new),
   **Non-GAAP & charges**, **Late & deficient filings** (12b-25 / Item 9A / 4.02), **Human-capital
   & climate** (Item 1 + voluntary climate). Each block: a title, a one-line description of what it
   *will* show and its SEC source, and an unmistakable placeholder body — **no counts, %, or ●**.
6. **NEW — click-to-reveal on filer-count affordances**: where the prototype reveals "the tickers
   behind a number", the placeholder wires the toggle but the revealed panel is an **honest empty
   state** ("the specific tickers will list here · to be defined · none shown") — **no tickers**.
7. **Footer honesty line** — "Nothing on this view is derived from filings or estimated." stays.

**Interaction (placeholder-safe):** interactions are *wired* (they toggle real UI state, matching
the prototype's `themeLangOpen` / `filerListOpen` behavior) but every revealed panel is an honest
"to be defined / none shown" placeholder. No interaction ever exposes a fabricated value. Reuse the
app's existing store/render pattern; keep new state minimal (e.g. an expanded-theme id and a set of
open filer-count ids).

**Out of scope (do NOT build):**

- **Any real qualitative data / Track 2** — no full-text parsing, NLP, risk-factor extraction,
  going-concern detection, CAM/auditor/cyber ingestion, or any backend/endpoint. Frontend-only.
- **The Filings view (P5)** — the "Filings →" links are inert stubs here; building the Filings view
  is the next iteration.
- **Any backend change** — no routes, no repositories, no `sec/`/`normalize/`/`ingest/` work.
- **Any fabricated placeholder content** — no example tickers, no sample counts, no illustrative
  excerpts "just to show the layout." Empty states only.
- Sector/Company/Compare views (already shipped P0–P3); the right rail (Qualitative has no rail per
  prototype §6 note line 249) — do not add one.
- The F4 favorability-color exception (`ROADMAP_SECTOR_APP_V2` decision 1) — **N/A here**: this view
  renders no favorability data, so no color. Honor the prototype's no-color rule.

## Acceptance criteria (what QA verifies)

Observable, testable — QA drives the real UI (Docker e2e / headless) and reads the rendered DOM.

- **AC-1 (honesty frame intact).** The Qualitative view renders the "Track 2 · not yet derived"
  banner with the structured-only / free-text-narrative / "nothing here is fabricated" copy, and the
  closing "Nothing on this view is derived from filings or estimated." footer.
- **AC-2 (no fabricated data — the load-bearing rule).** Across the *entire* view, including every
  expanded/revealed panel, there is **no** invented figure, count, %, ratio, ●/○ flag, direction
  word (new/rising/fading/stable), ticker symbol, company name, or excerpt/quote. Every data cell is
  an unmistakable placeholder token (`—`, "planned", "to be defined", "none shown", or equivalent).
  QA expands **every** interactive element and confirms each revealed state is an honest empty state.
- **AC-3 (risk-factor themes).** All 7 real theme labels render as rows, each with a coverage-bar
  *shape* and a neutral direction-chip slot (no invented direction), a "Filings →" affordance, and a
  click target that toggles an inline representative-language panel showing an honest empty state.
- **AC-4 (Disclosure landscape — the new section).** A "Disclosure landscape" section renders all
  **7 blocks** (Cybersecurity, Critical Audit Matters, Auditor landscape, Risk-factor volume,
  Non-GAAP & charges, Late & deficient filings, Human-capital & climate), each with a title, a
  one-line "what it will show + SEC source" description, and a placeholder body containing no
  counts/%/●.
- **AC-5 (side panels + matrix).** Emerging-this-year / Going-concern / Material-litigation cards and
  the per-filer matrix (5 column headers) render as honest empty states with no fabricated rows.
- **AC-6 (click-to-reveal filer counts).** Filer-count affordances toggle a revealed panel that is an
  honest "tickers to be defined · none shown" empty state — never a list of tickers.
- **AC-7 ("Filings →" is an inert stub).** "Filings →" affordances are visible but do nothing
  destructive/navigational (no error, no broken route) — `preventDefault` no-op, since P5 isn't built.
- **AC-8 (self-contained + theme-aware + no-color).** No external assets/CDN; renders correctly in
  light and dark; uses no favorability (good/bad) color anywhere on the view. CSP-safe, vendored only.
- **AC-9 (no regressions).** Sector/Company/Compare views and view-rail switching still work; the
  app's existing e2e headless render check passes; `pytest` stays green (frontend-only change should
  not touch Python, but the suite must remain green).
- **AC-10 (interactions don't leak fabrication).** Toggling any element on/off never renders a real
  value; closing returns to the placeholder cleanly (idempotent).

## Risks / open decisions

- **R1 — interactivity of a placeholder.** *Resolved by the standing directive, no operator call
  needed.* The prototype's click-to-expand / click-to-reveal are wired, but reveal **honest empty
  states**, never data. This keeps the layout faithful without fabricating. (If the architect judges
  that even wiring the interactions risks implying data exists, a purely static rendering of the
  expanded states is an acceptable fallback — but the honest empty state on click is preferred as it
  matches the prototype shape.)
- **R2 — "Filings →" with no Filings view.** Resolved: inert `preventDefault` stub now; P5 wires it.
- **R3 — acceptance gate.** Per the roadmap, placeholder/layout-only views **may be accepted at the
  QA-tester level** (no operator hands-on gate), unlike interactive P1/P2/P3. Architect + QA confirm.
  No new operator decision is required to proceed.

## Handoff → Principal Architect

Design the frontend-only expansion of `renderQualView` + `pa-qual-*` CSS against AC-1…AC-10. Key
calls for the architect: (a) the exact DOM/section structure for the Disclosure-landscape 7-block
grid and how it slots below the existing themes/side/matrix layout; (b) the minimal store state for
the wired-but-empty click-to-expand (themes) and click-to-reveal (filer counts) — reuse the app's
existing render/store idiom; (c) where the constant lists (7 disclosure blocks with their SEC-source
one-liners) live, hardcoded as labels only (mirroring `QUAL_THEMES`/`QUAL_SIDE`, no data); (d)
concrete QA checks mapping each AC to a DOM assertion / headless step. **Scope gate:** stop if any
step drifts into real Track-2 extraction, a backend/endpoint, a new base dependency, or weakened SEC
compliance — none should be needed (frontend-only).
