# Phase-2 checks — run these per section, before handing off

The phase-1 kit in this directory answers *"does it look like the prototype?"*. These answer
*"is it telling the truth about real filings, and does it survive real strings?"* — the questions
that only started to matter once literals were replaced with data.

**Every one of these has caught a real defect.** They are cheap; run them per section rather than
waiting for a report.

All are run the same way (the app must be up on `p5a-preview`; see "Bring the environment back"
in `docs/delivery/_active.md`):

```bash
docker run --rm --user root --network stock_profiler_default \
  -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
  -v "$PWD/docs/delivery/v3-p5a-institutional/tools/<script>:/home/pptruser/s.js:ro" \
  -w /home/pptruser ghcr.io/puppeteer/puppeteer:latest node s.js
```

| script | asserts | what it caught |
|---|---|---|
| **`p2-clip-sweep.js`** | No SVG text leaves its viewBox and no DOM text leaves its box — **with the webfont blocked as well as loaded**, on two companies | `ipStackedArea`'s labels at x=381/550 in a 306-unit viewBox, then the last label overrunning by 1.4 units (run 16) |
| **`p2-longname.js`** | A pathological manager name **plus** a blocked webfont still does not clip: the gutter grows, the label trims, the full name stays on `<title>` | the dumbbell gutter defect (run 13) |
| **`p2-chips.js`** | **D-chips invariant**: a slot carries a status chip **iff** its value is `N/A` (`violations: []`) | — |
| **`p2-inert.js`** | Every `[data-ip-derive]` has a panel to open — no badge that renders and does nothing | `02-topten`'s badge, inert since phase 1 (run 14) |
| **`p2-drive-controls.js`** | Each control's **resulting state**, not that a click was accepted (§02) | the double-bound listener that made every toggle run twice and land where it started (run 14) |
| **`p2-noprior.js`** | §03 renders with **no prior-quarter register** — no ghost line drawn from nulls, and the legend and caption both say so | the operator-reported crash: `ipRankedShare` called `path(spec.prior)` unconditionally and §03 threw, so it never rendered at all |
| **`p2-drive-06.js`** | §06's five controls, **plus that every absence is SCOPED to a stated window** and that the three removed claims stayed removed (the index-inclusion inference, the lock-up assertion, the confidential-treatment assertion) | — |
| **`p2-drive-05.js`** | §05's five controls, and **sweeps for surviving literals with every derivation panel OPEN** | `05-tenure`'s panel claimed "13F-HR filings back to 1Q22" — a fixed window baked in at design time. Panels are hidden until a badge is clicked, so no screenshot and no pixel diff can see a stale literal in one |
| **`p2-drive-04.js`** | §04's five controls, **plus that its two empty states differ in KIND** — "we do not parse HTML" (scope) vs "not ingested yet" (coverage) — and that neither empty card kept an affordance its data can no longer feed | — |
| **`p2-drive-03.js`** | §03's ten controls, including **both view toggles AND their return**, and `⤡ Expand` in **both** overlap views | §03 has the section's only view toggles — the one control class where "the click was accepted" and "the view actually changed" can differ |
| **`p2-edge-cases.js`** | A thin register and an unresolvable ticker; **`zeros: []`** — no missing value rendered as `0` | — |
| **`p2-read-section.js`** | Reads a section back off the live page after the fetch settles — the values, not the source | — |
| **`p2-xref-links.js`** | The cross-view links land on the real Insider ledger, by click and by keyboard | — |
| **`p2-theme-a11y.js`** | Focusability, Enter activation, no hard-coded hex | — |

## The two non-negotiables

1. **Run the layout checks with the webfont blocked.** SVG text width is font-dependent, so a
   label can fit in every headless capture and be cut on a real browser. That is exactly how the
   dumbbell defect reached the operator.
2. **Assert resulting state, not that something happened.** A toggle bound twice runs its handler
   twice and ends where it started; a check that asks "did a click register?" passes it.

### And a third, added by §03

3. **Anything measured with `getComputedTextLength()` must be measured while it is VISIBLE.** SVG
   text inside a `hidden` container has no layout, so the call returns `0` and a measure-and-fit
   pass quietly does nothing — it does not fail, it no-ops. §03's peer matrix lives inside the
   expander, so its fitter ran at paint, measured nothing, and left the labels clipped; it now
   also runs when the expander opens and when the lightbox mounts. **If you add a fitter, list
   every moment its target can first become visible.**

`p2-read-section.js` and `p2-drive-controls.js` are written against **§02** — point their
selectors at the next section when you plumb it. `p2-drive-03.js` is §03's own, and is the
template for a section with view toggles.
