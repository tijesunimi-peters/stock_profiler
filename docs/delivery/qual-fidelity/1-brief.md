# Brief — Qualitative view prototype-fidelity pass (placeholder layout)

Stage 1 (Product Manager). Task slug: `qual-fidelity`.
Governing directive: `docs/delivery/sector-app-followups.md`; REDESIGN honesty flag 1 (updated).
Reference: prototype altitude-4 (`prototype.dc.html` lines ~362–453). **Frontend-only.** Final fidelity
iteration (Sector `10cf5ba`, Company `36aaa30`/`33c68da`, Compare `ce47444` done); **Qualitative only.**

## Problem / user

The Qualitative view currently ships as a one-line "Coming — Track 2" stub. The operator wants it
rebuilt to the **prototype's full layout** (risk-factor themes, emerging risks, going-concern watch,
material litigation, per-filer signals) — but the entire view is **Track 2** (free-text narrative we
do **not** ingest). So the layout is replicated with **every data cell an honest empty placeholder**,
under a prominent **"Track 2 · not yet derived from filings"** banner. Success: an analyst sees the
*shape* of what's coming, understands it isn't here, and **cannot mistake any cell for real data**.

## Scope gate (Track 1 / honesty)

**PASS — and this is the honesty landmine.** The task **does not implement Track 2**: no free-text
ingestion, no LLM, no extraction, no data. It builds the sanctioned honest **placeholder** (governing
directive + REDESIGN flag 1). If any step would render a *real or synthetic* figure/filer/flag/
direction/coverage, **STOP and flag** — that is the out-of-scope Track-2 line this view holds.

## Scope (Qualitative view only) — replace `renderQualView`

Replicate the prototype's layout; **every data cell is an unmistakable placeholder**. Keep the
existing **"Track 2 · not yet derived from filings" banner + "why" + "nothing here is fabricated"**
framing (do not lose it in the rebuild).

1. **Header** (prototype): `sector › Qualitative disclosures` + a small marker; no fabricated peer/
   section counts (use "—" or omit).
2. **Track-2 banner** — keep it **prominent, above the layout** (the current banner copy).
3. **`3fr 2fr` grid:**
   - **Left — "Risk-factor themes"** card ("share of filers citing · YoY direction"). Rows = the **7
     real theme names** (labels only) each with an **empty/placeholder coverage bar**, a **"—"**
     coverage value, and a **"planned"** chip (NOT a new/rising/fading direction). Footer note reframed
     to Track-2 ("the share-of-filers + YoY direction will come from risk-factor narrative we don't
     ingest yet").
   - **Right column — 3 cards** ("Emerging this year", "Going-concern watch", "Material litigation"):
     each = heading + a **"—"** count + a **"to be defined · no filers shown"** placeholder body. **No
     fabricated filers/items.**
4. **"Per-filer signals" matrix** card: the **column headers** (Filer · Risk factors · New · Going
   concern · Litigation) + a **placeholder body** ("Per-filer flags will list here — to be defined; no
   filers shown, nothing fabricated"). **No fabricated rows/●/counts.**
5. **Closing line** — "Nothing on this view is derived from filings or estimated." (keep).

## Out of scope

- **Any real or synthetic Track-2 data** — no risk %, YoY direction, going-concern/litigation filers
  or counts, per-filer flags, ● marks, coverage-bar fills. (The whole point is placeholders.)
- Any **backend/endpoint/schema** change (nothing to fetch).
- The other views (done); any interaction/logic (this view stays static).

## Acceptance criteria (what QA will verify)

- AC-1 The Qualitative view renders the prototype's **layout** — a Risk-factor-themes card (7 theme
  rows), the 3 right-column cards, and the Per-filer-signals matrix headers — under a **prominent
  "Track 2 · not yet derived from filings" banner**.
- AC-2 **Every data cell is an unmistakable placeholder:** coverage bars are **empty** (no fill),
  values are **"—"**, direction chips read **"planned"**, the right-card bodies + matrix body read
  **"to be defined / no filers shown"**. No fabricated filer names or rows.
- AC-3 **Honesty landmine closed:** scanning the view, **no number reads as a metric/count/%,** **no
  `●` presence flag, no direction chip (new/rising/fading), no filled bar, no synthetic filer** —
  only the 7 real theme-name labels + column headers + placeholders. (After stripping "Track 2" /
  "13F", the view body has **no data digit**.)
- AC-4 The **"why" + "nothing here is fabricated" / "nothing derived from filings"** copy is present;
  the banner is prominent (top of the view).
- AC-5 **No favorability color;** theme tokens only; the placeholder styling reads as *empty*, never
  as data.
- AC-6 **Platform:** CSP-safe; **mobile 390px** reflow (3fr/2fr → 1 col, matrix scrolls/stacks) no
  overflow; `pytest` green (no backend); Docker e2e passes + eyeballed.
- AC-7 **No regression:** Sector/Company/Compare + `/sectors` render; the Qualitative rail entry
  still routes here.

## Risks / open decisions (for the architect)

- **R1 — placeholder styling that reads as empty.** Define one clear "empty/placeholder" visual
  (dashed, muted, "— / to be defined / planned") reused across bars, counts, chips, and bodies, so a
  glance never reads it as data. The coverage bars must be **empty tracks** (no fill), not zero-value
  bars that look like data.
- **R2 — matrix + lists as placeholder bodies, not rows.** Render the section *structure* (headings,
  matrix column headers) with a **single placeholder body** per section rather than N fabricated rows
  — showing the shape without implying imminent/real data. (Confirm this over rendering empty rows.)
- **R3 — reuse.** The current `renderQualView` (banner + "why" + planned cards) is the honest base;
  extend it into the full layout; keep the `--ext` tokens (defined locally) for the Track-2 accents.

## Handoff → Principal Architect

Frontend-only. Resolve R1–R3; name the exact `sectorapp.js` (`renderQualView`) + `sectorapp.css`
changes; map every AC to a concrete check (esp. the honesty landmine); confirm no backend and **no
fabricated data**. Owner: `senior-frontend-engineer`, branch off `master`.
