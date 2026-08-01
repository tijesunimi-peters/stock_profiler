# 4 — QA · V3-P5a **phase 1**, the ported affordances

> ⚠️ **SCOPE — read before treating this as the task's QA.** This report covers the phase-1
> *affordances* change and, in `4b`, the phase-1 fidelity gate. It is **not** phase 2's QA. Phase 2
> (replacing every prototype literal with real filings data) needs its **own** `4-qa.md` and
> `4b-manual-verification.md`; a green report here says nothing about it.

**Scope of this report:** the **behaviour** of the design port's controls in §01–§03, after the
operator's **D-behaviour** rule ("porting the design includes porting the functionality") was
applied across the sections already built. It is **not** the QA of the whole V3-P5a task — phase 1
is still mid-build (§04–§07 are empty shells) and the pipeline's real QA stage comes after phase 2's
data plumbing. This is the gate for *this* change.

**Branch:** `v3-p5a-institutional` (uncommitted, on top of `735a14f`)
**Preview:** `http://localhost:8010/company/AAPL/institutional`
**Change class:** rendered surface → operator hands-on verification is **required and blocking**.
*(As of the 2026-07-31 policy this is true of every rendered change, not only interactive ones —
the "accepted at the QA-tester level" route no longer exists.)*
**Verdict: PASS — pending manual UI verification** (see `4b-manual-verification.md`).

---

## Acceptance criteria

There is no `1-brief.md` for attempt 4 (it runs design-first under the operator decisions in
`docs/delivery/_active.md`), so the criteria are **D-behaviour** plus the prototype's own observed
behaviour, which is the only specification these controls have.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| AC-1 | Every control the prototype has in §01–§03 is live, or is **named** as deliberately inert | ✅ PASS | `tools/controls.js` on all three sections: **30 controls, exactly 1 unwired** — §01's card-head badge, which opens nothing in the prototype either. `drive.js` asserts that this is the only one. |
| AC-2 | `⤡ Expand` opens the prototype's lightbox, with **its own** title and note | ✅ PASS | `drive.js`: 5 chips; titles match ("Position changes over time", "Cumulative share of the register", "Register over time", …) |
| AC-3 | The lightbox chart is **re-authored at the modal width**, never upscaled | ✅ PASS | `drive.js` compares the emitted `viewBox` against the measured body width: `0 0 1316 210` vs body 1314 (+2 for the border), same for 1316×460 and 1316×260 |
| AC-4 | The lightbox is dismissable three ways | ✅ PASS | `drive.js`: Escape ×3, the `CLOSE` button, and a backdrop click |
| AC-5 | `ƒ DERIVED` reveals the derivation panel and flips its label to `ƒ HIDE` | ✅ PASS | `drive.js`: hidden → shown → hidden, label and `aria-expanded` both tracked, panel carries the prototype's formula verbatim |
| AC-6 | `Treemap` / `Cumulative share` swap the chart, the caption and the pressed state | ✅ PASS | `drive.js`: `0 0 660 250` / 10 rects ⇄ `0 0 660 343` / 11 rects, captions swap, `aria-pressed` moves |
| AC-7 | `Set intersections` / `Peer matrix` do the same | ✅ PASS | `drive.js`: `0 0 370 370` ⇄ `0 0 720 270` with 8 combination rows and its own caption; **the card's `⤡ Expand` follows the active view in both directions** ("Manager set intersections" `0 0 1316 480` / "Peer overlap matrix" `0 0 936 936`) |
| AC-8 | `Trend` and the clickable "Effective holders" stat open the inline trend panel | ✅ PASS | `drive.js`: both open at the prototype's `0 0 632 190`, with the right titles; the stat's panel also carries the three "measures behind it" |
| AC-9 | Every `↗` is a real link to EDGAR, opened safely | ✅ PASS | `drive.js`: 5 anchors, all `sec.gov/edgar`, all `target="_blank" rel="noopener"` |
| AC-10 | **No regression in the resting rendering** | ✅ PASS | all six section states re-diffed: heights identical, **zero bands**, `>32/255` unchanged at 0 / 0 / 30 / 34 / 0 / 0 |
| AC-12 | The set-intersections view itself matches the prototype | ✅ PASS | §03 pixel-diffed **with that view showing**: 6116px both, **zero bands**, 64 pixels above 32/255 (scattered, ≤11 per column — the same rounding class as §02's end markers) |
| AC-11 | No page or console errors | ✅ PASS | `drive.js` final assertion (0 errors across ~40 interactions); e2e 44 shots, institutional views `errors=0` |

**`tools/drive.js`: 49 driven assertions, 0 failures.**

---

## Review questionnaire

**1. What shipped.** Every button on the ported Institutional page now does what the prototype's
does. `⤡ Expand` opens a full-screen lightbox with the chart redrawn large; the `ƒ DERIVED` badges
open a panel explaining how the number is computed and relabel themselves `ƒ HIDE`; the chart
toggles genuinely switch views (ranked bars ⇄ treemap, peer matrix ⇄ set intersections); `Trend` and
the "Effective holders" figure open an inline nine-quarter trend; and the `↗` links go to EDGAR.

**2. Surfaces touched.** `src/secfin/api/static/company.js` and `company.css` only — the `.ip-*`
design-port namespace on `/company/{symbol}/institutional`. **No backend, no endpoint, no Python.**
Chart builders `ipAreaChart` / `ipDivergingBars` / `ipRankedShare` / `ipPeerMatrix` gained width
parameters; new `ipTreemap`, `ipUpset`, `ipTrendPanel`, `ipMeasures`, `ipLink`, `ipChip`, `ipBadge`,
`ipDerivationPanel` and the lightbox.

**3. AC → evidence.** The table above; every row names the driven assertion or the diff that proves
it. No AC without evidence.

**4. States exercised.** *Populated* — the only state phase 1 has, by design (D-literals: the page
carries the prototype's own sample values under a non-dismissible NOT-REAL-DATA banner). *Closed →
open → closed* for every disclosure (badges, trend panels, lightbox), driven and asserted both ways.
*Default* re-captured and re-diffed after the change. **Empty / loading / error do not exist on this
page yet** — there is no fetch. They arrive with phase 2, and that is when they must be tested.

**5. Edge cases probed.** The product ones (N/A vs N/M vs 0, restatements, multi-class/PRN rows,
429, upstream 502/503) are **not reachable here** — no data path exists. What I did probe: the
*second* click of every toggle (a stuck open state is the classic bug), the lightbox opened from a
non-default view (it must follow the active view, and does), keyboard dismissal, focus restoration
on close, and the resting-state regression.

**6. Honesty contract.** The NOT-REAL-DATA banner is present and not dismissible; nothing on this
page claims to be filed data. **No value is rendered as `0` for a missing one** — the only `0M`/`0.0%`
present is the prototype's own literal for a real zero (Strategic 13D stakes). The derivation panels
*strengthen* the honesty posture: they are the prototype's "how this is computed" disclosures and
they name the source filing for each input, plus the caveat that numerator and denominator come from
filings with different as-of dates. No fabricated precision was introduced — every number in the new
panels was read out of the prototype. ⚠️ The literals are **AVGO's** on an **AAPL** URL, including
the EDGAR links' `q=%22AVGO%22`; that is D-literals working as intended for an unshipped scaffold,
and phase 2 replaces all of it.

**7. Deltas from the prototype.** Four, all deliberate and all listed:
- **Derivation-panel placement.** The prototype uses a single shared slot at a fixed position
  (measured: y343, a direct child of the section, between the first card and "Since the last 13F")
  regardless of which badge opened it — so its tile badge at y938 opens a panel 600px above itself.
  We render each panel under the block it explains. *Porting that would be porting a bug.*
- **§01's card-head badge** opens nothing in the prototype (verified: two clicks return the DOM
  byte-identical). Ported as label-only rather than inventing a panel for it.
- **The treemap inside the lightbox.** The prototype re-squarifies at the modal's aspect
  (`1316×658`); we scale the card's layout, so every cell's *area share* is exact but the
  arrangement differs. Its markup does not expose the squarify variant.
- **Keyboard access on the clickable stat.** The prototype gives it `cursor: pointer` and nothing
  else; ours is `role="button" tabindex="0"` with Enter/Space and a focus ring. A control that
  cannot be reached by keyboard is not a control.

Not verified by automation: how any of this *feels* — pointer feedback, focus order, the lightbox's
scroll behaviour on a short window, and whether the deviations above read as right to you.

**8. Residual risk.** What would worry me most, in order: (a) **the derivation-panel placement
deviation** — it is a judgment call about the prototype being wrong, and it is yours to confirm;
(b) the **treemap-in-lightbox** arrangement, which is visibly not the prototype's; (c) the lightbox
at small viewport heights — `max-height: 92vh` with `overflow: auto` is the prototype's own rule but
I only drove it at 1440×1200; (d) *(closed — see Defect 4)* the `Set intersections` lightbox, which now follows the active view
under the prototype's own title.

---

## UI/UX review

- **Every control does something**, or is named as inert — 30 controls, 1 documented exception.
- **States**: each disclosure has a real closed and open state and returns cleanly; the toggles
  carry `aria-pressed`, the disclosures `aria-expanded`, and the lightbox `role="dialog"` +
  `aria-modal` + an `aria-label` from its own title.
- **Focus**: opening the lightbox moves focus to the dialog (not to `CLOSE` — ringing a control the
  user did not choose was the one visible difference from the prototype's open state); closing
  restores focus to the control that opened it.
- **Legibility**: the derivation panel had to move out of the tile — inside a ~200px grid cell its
  source column clipped. At full section width it wraps as the prototype's does.
- **Copy**: every string is the prototype's, verbatim. No over-claiming; the new panels are
  explanatory ("how this is computed", "the measures behind it", "rebuilt from each quarter's
  filings as they were filed — later amendments are not backfilled").
- **Consistency**: all new CSS stays inside the `.ip-*` namespace; no `.ov-card` / `.stmt-table` /
  `ClearyFi.*` vocabulary leaked in, which is the whole point of attempt 4.
- **Not checked**: dark theme (the port has not been reviewed in dark at all yet — a phase-1-wide
  gap, not specific to this change) and mobile width.

---

## Manual UI verification

Open **`http://localhost:8010/company/AAPL/institutional`** at a desktop width.

1. **§03 → "Position changes over time" → `⤡ Expand`.** A dimmed overlay opens with a large chart,
   the title "Position changes over time" and a `CLOSE` button top-right. *Expected: the chart is
   crisp and full width — text the same size as on the page, not magnified.*
2. **Press `Escape`.** The overlay closes and the page is where you left it.
3. **Re-open it and click outside the white panel.** It closes. Re-open and click `CLOSE`. It closes.
4. **§03 → "Who holds what" → `Treemap`.** The bar chart is replaced by the treemap, the caption
   underneath changes, and `Treemap` becomes the filled button. **Now click `⤡ Expand`** — the
   lightbox shows the *treemap*, titled "Who holds what". Close it, click `Cumulative share`, and
   the bars and the original caption come back.
5. **§03 → "Overlap with sector peers" → `Set intersections`.** The matrix is replaced by a bar
   chart over a dot grid, with a "Combination held / Managers / Share" table beneath it. Click
   `Peer matrix` to switch back.
6. **§03 → "Where every share sits" → `Trend`.** A tinted panel opens inside the card with
   "Unreported residual 32.8% → 0.6% over nine quarters" and a small chart. Click `Trend` again to
   close it.
7. **§03 → "How concentrated the register is" → click the `17` / "Effective holders" block.** The
   same kind of panel opens, plus "The measures behind it" with HHI, Gini and Half the register.
   **Then Tab to it and press Enter** — it must toggle from the keyboard too, with a visible focus ring.
8. **§01 → the `ƒ DERIVED` badge in the "Institutional share" tile.** A panel opens *below the tile
   row*, full width, reading "How this is computed …". The badge now says `ƒ HIDE`. Click again to
   close. *(The other badge, in the "Since the last 13F" card head, only changes its own label —
   that is what the prototype does; see Deltas.)*
9. **§02 → `ƒ DERIVED` on "Manager mix" and on the top-ten block.** Both open their own panel.
10. **Any `↗` link** (`Base 13F ↗`, `13F filings ↗`, `13F table ↗`). Opens EDGAR full-text search in
    a **new tab**. *(It searches for AVGO — the prototype's issuer, like every other literal here.)*
11. **The honesty scan.** The `⚠ STATIC DESIGN PORT — NOT REAL DATA` banner is still at the top and
    cannot be dismissed; nothing you opened claims to be filed data for AAPL.

**Operator outcome (2026-07-31):** steps 1–12 hand-run and **all passed** (batches A, B, C). Step 7b
is new — it is the fix for the defect the operator found in that same pass (the overlap `⤡ Expand`
always opened the peer matrix) — and steps 13–15 plus the four deviations are still open. Recorded
in `4b-manual-verification.md`.

---

## Defects

None open from this change.

**Three defects were found and fixed during it** (recorded because two were mine and the third is a
recurring class):

| # | Defect | Severity | How it showed |
|---|---|---|---|
| 1 | The lightbox's head element was never closed, so the body rendered *inside* the flex head — title and `CLOSE` at the bottom of an empty dialog | High (visible on every Expand) | first driven capture |
| 2 | `⤡ Expand` was hidden in treemap view | Medium | I trusted `click.js`'s removed-list, which reuses element ids between snapshots; querying the prototype's live button list showed the chip **stays** |
| 3 | `button.ip-chip` took the UA's `buttonface` grey the moment the span became a button | Low visually, **high as a class** | invisible to a 32/255 pixel diff (~15/255); caught only by `>8` climbing 80 → 4,636 on §02. Third time this trap has bitten |
| 4 | **`⤡ Expand` on "Overlap with sector peers" always opened the peer matrix**, even with `Set intersections` showing | Medium | **found by the operator in the hands-on pass** — not by any script. I had shipped it as a listed gap because my probe couldn't open that modal in the prototype; the probe was wrong (the overlap card lives inside the expander, which I hadn't opened). Once opened, the prototype answered in one call: "Manager set intersections · exclusive combinations across AVGO, TXN, NVDA, AMD", `0 0 1316 480`. Now wired, asserted in both directions |
| 5 | The UpSet plot had **row bands on all four rows** (the prototype stripes alternate rows) and **bars at `opacity 0.5`** (0.55), and its row labels used the 9px `--mono-muted` axis style instead of 10px/600 `--ink` | Low–Medium | I built the UpSet from an extraction and asserted only its structure — **I never pixel-diffed that view**. Diffing it found all three: 437 → 64 pixels above threshold |

**Pre-existing, not from this change:** `sectorapp-company` (errors=8) and `sectorapp-company-refocus`
(errors=14) — 502s on `/sectors?view=company&symbol=900001`, a synthetic fixture CIK, on pages this
change does not touch. Confirmed pre-existing across every e2e run in this task.

---

## Handoff

**Verdict: PASS — pending manual UI verification.** Automated evidence is complete (47 driven
assertions, 0 failures; no rendering regression; e2e clean on every institutional view), but this is
an interactive change, so it is **not** "ready" until the operator has driven it.

**Next:** run `4b-manual-verification.md`. A ❌ on any row is a defect → back to
`senior-frontend-engineer`. This is phase 1 of the design port, so nothing here is a deploy
candidate: the operator's 🚦 fidelity gate still comes first, then phase 2's data plumbing, then the
pipeline's own QA.
