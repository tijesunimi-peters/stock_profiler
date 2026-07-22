# Brief — Sector Analytics app: Qualitative view (Phase 4, final)

Stage 1 (Product Manager) handoff. Task slug: `sector-app-qualitative`.
Parent plan: `docs/REDESIGN_SECTOR_APP.md` (Qualitative row + **honesty flag 1**). Reference:
`docs/design/sector-app-prototype/HANDOFF.md` §5/§7 (Qualitative) — **frame/layout only, not its
synthetic data**. **Frontend-only** (architect confirms). Continues + **completes** the app; stacks
on Phase 3 (`sector-app-compare` `fc7f7f1`).

## Problem / user

The app's fourth rail entry, **Qualitative**, currently renders a one-line inert stub. The prototype
imagines a rich qualitative surface (risk-theme landscape, going-concern watch, litigation, per-filer
signal matrix) — but **all of that is Track 2** (free-text risk-factor/going-concern/litigation
extraction), which this product **deliberately does not ingest** (CLAUDE.md guardrail 1; the
per-token cost fights the cheap-subscription goal and is a later decision). The **user** — an analyst
who clicks Qualitative expecting disclosures — deserves an **honest, self-explanatory placeholder**:
what this view *will* cover, **why it isn't here yet**, and an unambiguous signal that **nothing on it
is derived from filings or fabricated**. Success: the Qualitative view is a polished "Coming — Track
2" frame that could never be mistaken for real data.

## Scope gate (Track 1)

**PASS — and this is the whole point.** The task **does not implement Track 2**: no free-text
ingestion, no LLM, no new data, no fetch, no fabricated figures. It builds the **honest placeholder**
the REDESIGN explicitly locked (honesty flag 1). If any step drifts toward *actually* extracting or
displaying risk-factor/going-concern/litigation content, **STOP and flag** — that is the out-of-scope
Track-2 line this view exists to hold.

## Scope

Replace the inline Qualitative stub in `sectorapp.js` with a proper **view frame** (matching the
app's paper-terminal system), consisting of:

1. **A prominent "Track 2 · not yet derived from filings" banner** — the unmistakable status marker,
   in the app's existing status/provenance vocabulary (reuse the `≈ approx`/deferred styling, not a
   new look).
2. **A short "why" explanation** — plain-language: this product ingests **structured SEC data only
   (Track 1)**; qualitative disclosures are **free text** whose extraction is a **deliberate later
   decision** (recurring per-token cost). One or two sentences, honest, no over-promising a date.
3. **A labeled preview of what Track 2 would cover** — the prototype's categories (risk-theme
   landscape, emerging risks, going-concern watch, litigation, per-filer signal matrix) rendered
   **unmistakably as "planned / not yet available" category labels** — names + one-line descriptions
   only. **No fabricated figures, counts, ●-presence-flags, direction chips, matrices, or bars.**
4. The **Qualitative rail entry stays**; selection state (sector/company/compare) **persists** when
   switching into and out of this view (consistent with the app's single store).

## Out of scope (this phase)

- **Any real Track-2 data** — no risk-factor text, no going-concern/litigation flags, no counts, no
  clustering, no LLM. (The entire point is that this is a placeholder.)
- Any **backend/endpoint/schema** change (nothing to fetch).
- A committed **launch date** for Track 2 (don't promise timing).
- Favorability color; any fabricated chart or number.

## Acceptance criteria (what QA will verify)

- AC-1 The Qualitative rail entry renders a **view frame** (not the old one-line stub) with a
  **prominent "Track 2 · not yet derived from filings"** status banner.
- AC-2 The frame states **why** it's not here: structured-data-only (Track 1); qualitative =
  free text, a deliberate later decision. Copy is honest and **does not promise a date**.
- AC-3 The **planned categories** (risk themes, emerging risks, going-concern, litigation, per-filer
  signals) appear **as labels + one-line descriptions only**, each visibly marked **planned / not yet
  available**. **No fabricated figures, counts, ● flags, direction chips, matrices, or bars anywhere
  on the view.**
- AC-4 **Nothing on the view is presented as real or derived** — no number that could be read as a
  metric, no synthetic company/issuer, no "94%"-style coverage. (Honesty landmine closed.)
- AC-5 **No favorability color**; the frame uses **theme tokens only**; the banner reuses the app's
  status/provenance vocabulary.
- AC-6 Selection state **persists** across view switches (Company/Compare/Sector → Qualitative →
  back keeps the focal/sector/compare pair).
- AC-7 **Platform:** CSP-safe (no CDN/React/Tailwind added); **mobile 390px** reflow with no
  horizontal overflow; light-only.
- AC-8 `docker compose build api` → **e2e headless check passes** (the existing `sectorapp-stub`
  shot — which clicks the Qualitative rail — updated/kept and **eyeballed**) + **`pytest` green** (no
  regression; frontend-only).

## Risks / open decisions (for the architect)

- **R1 — frontend-only?** Confirm there is **nothing to fetch** (no backend). Expected: a pure static
  frame; no `routes.py`/`schema.py` change. (Almost certainly yes.)
- **R2 — how far to build the "preview".** Keep it to **category labels + one-line descriptions** (a
  simple list/grid of "planned" cards), explicitly **not** the prototype's matrix/chips/●-flags —
  the architect should choose the lightest honest layout that reads as "coming", not "here". Err
  toward *less*: the safest failure mode is too plain, never too data-like.
- **R3 — copy source.** Anchor the "why" in `CLAUDE.md` guardrail 1 + `docs/ROADMAP.md` (Track 2 is a
  later, deliberate decision). Don't invent a roadmap milestone or date not in the docs.

## Handoff → Principal Architect

Frontend-only (confirm R1). If confirmed, a `senior-frontend-engineer` task on a branch stacked on
Phase 3 (`sector-app-compare` `fc7f7f1`): replace the Qualitative `renderStub` branch in
`sectorapp.js` with the honest placeholder frame + `sectorapp.css` styles; keep/adjust the
`sectorapp-stub` e2e shot. Resolve R2 (layout) + R3 (copy). Map every AC to a concrete check.
