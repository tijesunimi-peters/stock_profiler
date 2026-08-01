# V3-P5a phase 1 — design port log

Attempt 4, the **design-first** workflow: port the prototype's Institutional view onto a blank page
with its own sample values and **no backend call at all**, so fidelity can be verified on its own.
This file is the running record of what was ported, how it was verified, and what still differs.

Branch `v3-p5a-institutional`. Phase-1 scaffold: commit `54d1522`. This run: P1c, P1d, §01.

---

## The method (P1c) — port against a render, not against markup

The prototype is a dc-runtime/React export that **renders live** when served over HTTP. Three
attempts ported it by reading `prototype.dc.html` as source and comparing by eye; all three were
rejected on fidelity. This run compares against the running page instead.

> ### ⚠️ The port includes the prototype's FUNCTIONALITY, not only its appearance
>
> *(Operator, 2026-07-31 — `_active.md`'s **D-behaviour**. It supersedes §01's original "every
> affordance is inert, wired in phase 2", which cost a rebuild.)*
>
> A section is ported when its markup, its CSS, its charts **and its controls** match. Every
> expander, lightbox, derivation panel, view toggle and relabelling the prototype has is **live in
> phase 1** — only the DATA waits for phase 2.
>
> **And behaviour is the one thing the markup cannot tell you.** The handlers are compiled away in
> the React export; `literals-open.json`, the inline styles and the outerHTML all show a control
> that does nothing. **Drive the running prototype and read back what happened** — that is the only
> source. `click.js` · `overlay.js` · `where.js` · `two.js` to learn it, `drive.js` to assert it,
> then re-diff the default states so a new control has not moved the resting rendering.
>
> Two standing traps: a `<span>` that becomes a `<button>` takes the UA's grey (~15/255 — under a
> 32/255 diff, visible only in `>8`), so it needs `background: transparent`; and the prototype has
> behavioural bugs of its own — port the mechanism, do the sane thing, and **list the deviation**.

```bash
# 1. serve the prototype
docker run -d --rm --name proto-srv --network stock_profiler_default \
  -v "$PWD/docs/design/sector-app-prototype-v3:/srv:ro" -w /srv \
  python:3.11-slim python -m http.server 9000

# 2. serve our app (the seeded fixture publishes no port of its own)
docker compose --profile e2e run --rm -d -p 8000:8000 --name p5a-preview e2e-app

# 3. capture the prototype's ground truth  -> prototype-ground-truth/
docker run --rm --user root --network stock_profiler_default \
  -e PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
  -v "$PWD/docs/delivery/v3-p5a-institutional/tools/capture.js:/home/pptruser/capture.js:ro" \
  -v "$PWD/docs/delivery/v3-p5a-institutional/prototype-ground-truth:/out" \
  -w /home/pptruser ghcr.io/puppeteer/puppeteer:latest node capture.js

# 4. capture ours the same way, at the same 694px column  (tools/ours.js, same invocation)
# 5. positional diff, element by element                  (tools/boxes.js, run against both)
```

`tools/` began as five scripts and is now the full kit. **Appearance:**

| script | what it does |
|---|---|
| `capture.js` / `capture-open.js` | drives the prototype to Companies → Institutional; PNG per section, `literals.json` / `literals-open.json` (every element's text + computed CSS + outerHTML), `tokens.json` |
| `shot2.js` | one section, either app, collapsed or open, matched column, `SNAP=1`, sticky chrome hidden, explicit clip, optional `CLICK` to capture an OPENED state |
| `compare.py` | every property mismatch, matched by text — **run it before the pixel diff** |
| `diff.js` · `align.js` · `crop.js` | canvas pixel diff with row bands · the best-fit shift (layout difference vs the same pixels a fraction off) · proto/ours/diff stacked for one y-range |
| `text.js` · `lines.js` · `chain.js` · `hprec.js` · `frac.js` | per-run widths · per-line-box geometry · ancestor chain with margins/padding · full-precision 4dp heights · 1× vs 2× |

**Behaviour** — none of this can be read from the markup, only from the running page:

| script | what it does |
|---|---|
| `click.js` | click one control; report what appeared, disappeared and changed, plus a screenshot. ⚠️ its added/removed detection reuses element ids between snapshots — trust `changed` and the screenshot, verify add/remove another way |
| `overlay.js` | dump the overlay a control opened: tree, boxes and computed styles |
| `where.js` | where the revealed panel actually lands, its size, and whose chain it sits in |
| `two.js` · `after.js` | a toggle's second state · which controls exist and are visible after an interaction |
| `controls.js` | **step 1 of every section**: inventory every button, link and toggle, and flag the ones still unwired |
| `drive.js` | the end-to-end assertion pass over every live affordance — 71 checks today |

### What the capture settled up front

- **The tokens are already ours.** `tokens.json` vs `style.css`: every hex is identical — the
  prototype was drawn against this app's palette. One name differs: prototype `--rule` is our
  `--border-tint-rule` (both `#e5dfd3`). Mapped in the port's CSS, renamed nowhere.
- **The fonts are already ours.** Both load the same Google Fonts request (Hanken Grotesk +
  IBM Plex Mono). Nothing to vendor.
- **The content column is 694px** at a 1440 viewport, and all seven sections use it.

---

## P1d — the primitives, in `company.css` under `.ip-*`

Read off the live render with `getComputedStyle`, not inferred: card (+ accent-edged variant),
micro-label, `ƒ DERIVED` badge, freshness strip + vertical rule, prose block, tint panel +
equation, chart caption, expander bar, tile grid, dumbbell. The namespace shares nothing with
`.ov-card` / `.stmt-table` / `.plot-chart` — reusing that vocabulary is what produced "leftovers
from previous design" in attempt 3.

---

## §01 · Register snapshot — result

**Pixel-identical to the prototype.** At a 694px column and the prototype's own origin, over
3.1M pixels compared:

| threshold | pixels differing | share |
|---|---:|---:|
| any difference at all | 753 | 0.024% |
| > 8/255 | 48 | 0.0015% |
| > 32/255 | **1** | 0.00003% |
| contiguous bands of difference | **0** | — |

Element geometry (`boxes.js`, 73 boxes): **69 identical to under 0.01px**; the other 4 are a
nesting artifact — the prototype puts the badge/expander label in an inner `<span>` and the port
puts it on the element itself, so the comparator pairs a 52×11 inner span against a 66×17 outer
one. Measured outer-to-outer, those match too. Section height: **1127px in both**, at 1× and 2×.

Artifacts: `proto-i1.png` · `ours-i1.png` · `diff-i1.png` (amplified ×6) · `sxs-i1.png`
(side by side) · `boxes-proto.json` / `boxes-ours.json` · `literals.json`.

### Four defects the numeric diff found that the eye did not

1. **`h2` leak.** `style.css` tightens every `h2` to `line-height: 1.12; letter-spacing: -0.03em`.
   The section title came out 9.6px narrower and 3.7px shorter — and pushed *every element below it*
   up by 3.7px. Reset explicitly on `.ip-sec-title`. This is exactly the class of thing "leftovers
   from previous design" means, and it is invisible without a measurement.
2. **Badge line box.** The prototype's badge is a `<button>` (UA `line-height: normal` → 11px); a
   `<span>` inherits the body's and landed a fraction higher. Survived rounding at 1× and became a
   whole extra pixel at 2×, shifting the rest of the section down one device pixel. Pinned to 11px.
3. **`text-wrap: pretty`.** The prototype sets it on exactly three things — the two caveat
   paragraphs, the chart caption, the expander note. It changes where the last lines break, so the
   paragraphs rasterised differently even at identical widths.
4. **Font fallback.** The prototype declares `"IBM Plex Mono"` with **no** generic fallback on the
   badge and the `Base 13F ↗` link. `ƒ` uppercases to U+0191 and `↗` is U+2197 — neither is in IBM
   Plex Mono, so the fallback decides the box width. With `, monospace` appended the badge came out
   0.23px wide of the capture and the link 2.4px, with different glyphs.

### The dumbbell (decision D-protocharts)

> 📌 **The prototype is moving its charts to d3** (operator, 2026-07-31) — interactive versions of
> the same charts. **We continue as we are for now**: eleven hand-authored SVG builders, nothing
> pre-built for d3. See `_active.md`'s D-protocharts for what that will and will not disturb. The
> short version: d3 is already vendored so nothing about the dependency changes, but
> **`prototype-ground-truth/` and every recovered series in `IP01`–`IP04` are snapshots of TODAY's
> prototype** and must be re-captured and re-recovered — not adapted — the day it lands.

Ported as the prototype builds it — hand-authored SVG on a fixed `viewBox` at `width:100%`, not
`ClearyFi.dumbbellChart`. Geometry is authored once in viewBox units and the browser scales it, so
it never measures its container and never hits the authored-width class of bug.

`prior`/`current` are millions of shares **recovered from the captured SVG's x positions**
(`x = 210 + v/123.43 × 372`). Cross-check: they reproduce the prototype's geometry to under a tenth
of a pixel *and* every one rounds to the delta the prototype prints. That is the evidence the scale
was recovered rather than guessed.

Colour is carried per row, not derived: the prototype paints "Active manager D" `#a88c5f` but
"Active manager E" `#8b8579`, so its type→colour rule keys off something its labels don't expose.
Only three colours are ever used across §01–§04. §02/§03 should settle it.

---

## Differences that remain — stated, not waved away

1. **Two affordances are still inert** (updated after the second run): the `ƒ DERIVED` badges and
   the `Base 13F ↗` link render identically to the prototype's but do nothing — they are `<span>`s,
   with nothing behind them until phase 2. **The expander bars are now real** and §01's content is
   built.
2. **The whole page is fake.** Every number, date and manager name in §01 is a prototype literal
   under the undismissable banner. Nothing is fetched. Phase 2 is not done until `IP01` is empty.
3. **§02–§07 are still empty shells** — heading, scope note and rule only.
4. **The stacked strip at narrow widths.** Below ~600px the freshness strip wraps to one cell per
   row and its 1px vertical rules end up stranded between stacked cells, reading as stray marks.
   That is the prototype's own CSS behaving as written; it never gets that narrow at a 1440
   viewport. Worth a decision before §02 if we care about it.
5. **The dumbbell shrinks with the column.** `viewBox` scaling means labels get small on a phone
   (390px column). Again the prototype's own behaviour, ported as drawn.
6. **Two honesty tensions carried forward verbatim, as phase 1 requires.** "Confirmed in last 30
   days · 32%" (we do not track filing confirmations) and the adjusted register `767M + 9.7M = 776M`
   (summing a 13D/G total, a Form 4 transaction and a 13F holding invents a share count nobody
   filed — attempt 3 omitted it deliberately and the operator's Batch B passed on that reasoning).
   **Each needs an operator decision in phase 2**, because each changes the layout.

---

## Verification

- **e2e headless render check**: institutional `errors=0`, institutional-legacy `errors=0`,
  institutional-nolocation `errors=0`. 44 shots.
- **One real e2e regression found and fixed.** The phase-1 scaffold (`54d1522`) re-routed
  `?tab=institutional` to the port, which broke the `institutional-nolocation` holder-geography
  regression guard — it clicks `#inst-subtabs`, markup that now lives at the legacy slug. Repointed,
  and a shot added for the port itself.
- **Two failures remain and are pre-existing**, confirmed by stashing this run's changes and
  re-running the same check: `sectorapp-company` (errors=8) and `sectorapp-company-refocus`
  (errors=14), both 502s on `/sectors?view=company&symbol=900001` — a synthetic fixture CIK with no
  upstream data, on pages this change does not touch.
- **No `pytest` run: no Python changed.** This run touched `company.css`, `company.js` and the e2e
  URL list only.
- Console/page errors on the ported view: **none**, at 1440 / 900 / 430.

---

---

## Second run — the two rails, and §01's expander (operator answers, 2026-07-30)

The operator's read on §01 was *"yes, but I don't see the right column"* — correct, and a gap I had
not surfaced. Measured against the running prototype:

| | prototype | port, before | port, now |
|---|---|---|---|
| left rail | 178px — views **+ a SECTIONS 01–07 jump list** | views only | views + jump list |
| content column | 694px | 960px | **732px** |
| right rail | 262px — Filing timeline | *absent* | 262px |

The column is 732px rather than 694px because our view rail is 132px against the prototype's 178px.
That width is V3-P2's, settled for every page in the app; the port does not get to change it. All
§01 diffing is done with the column pinned to 694px, so the comparison is unaffected.

**Right rail — the prototype's frame, our honest empty state** (operator's choice). The prototype
fills it with nine sample filings; we have no filing index until V3-P3, and inventing one is the
single thing P4 deliberately refused to do. Its own `.ip-rr-*` namespace, so P4's signed-off
Overview / Financial history rail is untouched. Scoped to the ported view only.

**Sections jump list** — added to `shell.js`'s `rail()` behind an optional `sections` argument. A
view that declares none renders exactly what it did before, so no other page changes. Labels are
the prototype's SHORT forms ("Over time & holders", not "Register over time & holders").

**Expanders are wired** (operator's choice). The bar toggles the block after it and relabels itself
`− Hide`, exactly as the prototype does. §01's is built: the six-filing table (form · filer/what
changed · shares · accepted), the exclusion caveat, and the five-row "how fast each form arrives"
list — 573px of content that was previously not ported at all.

### Scroll-spy: two bugs found by measuring, one behaviour left honest

1. The first version used an `IntersectionObserver` band and was **reliably off by one** — a jump to
   §03 marked §02, because `scroll-margin-top` parks the target inside the band while the previous
   section is still in it. Replaced with a direct rect test.
2. The rect test then missed by **exactly one pixel**: a jumped-to section lands at top = 121px and
   the line was `<= 120`. Moved to 150.
3. **Left as-is, deliberately:** driving `scrollIntoView` at the last sections still marks the
   previous one, because the page cannot scroll them under the line. Clicking a rail link is
   correct — the click marks its own target and holds the scroll handler off for 900ms. Re-check
   once §02–§07 have real height; with all seven built the page is ~11,700px and only the very last
   section can hit the clamp, which is how every jump list behaves.

### §01 after these changes

Re-diffed at the pinned 694px column: **still zero bands of difference, still exactly 1 pixel above
32/255.** e2e: 44 shots, all company views `errors=0`, only the two pre-existing sectorapp 502s.

---

## Where this leaves the port — measured, not estimated

Expanded ground truth is captured for all seven sections (`literals-open.json`,
`proto-i<N>-open.png`). Their heights **with the expanders open**:

| §01 | §02 | §03 | §04 | §05 | §06 | §07 | total |
|---|---|---|---|---|---|---|---|
| 1700 | 2026 | 3017 | 1961 | 1177 | 1304 | 540 | **11,725px** |

§01 is done, expander included. **§02–§07 are still empty shells** — heading, scope note and rule.
That is ~10,000px of design and, from the captures, roughly eight more chart builders to port:
paired mini bar charts and a nine-quarter stacked area (§02); a diverging flow chart, a ranked bar
list, a cumulative-share curve and a treemap (§03); §04–§06 not yet inventoried.

I did not start §02 in this run. The reason is the one this attempt exists to avoid: §01 reached
pixel-identical only because every element was measured, and four of its defects were invisible
without measuring. Building six more sections at lower rigour is exactly what produced three
rejected attempts. The tooling to do it is now in place and re-runnable.

---

## Third run — §02 Register over time & holders

**Collapsed: pixel-identical.** Height 808px in both. Of 2.2M pixels, 32 differ by more than
32/255 — four 4-pixel spots at the right edge of the two mini charts, where the end-marker circle's
centre is carried at full precision in the prototype and rounded to three decimals here.

Element boxes (`tools/boxes.js`, 71 in the prototype): **5 flagged, all comparator artifacts** —
the badge/expander nesting seen in §01, plus "Net change this quarter: −33 holders" being one text
node here and two there.

### Chart builders ported (three more)

`ipAreaChart` (mini area with a five-tick value axis), `ipStackedArea` (nine-quarter 100% stack),
`ipSparkline` (per-series normalised, shape not level). All three are hand-authored SVG on a fixed
`viewBox`, like §01's dumbbell — never Plot, never measuring a container.

Every series was **recovered numerically from the captured SVG path data**, not transcribed:
the two mini charts, the five stacked bands across nine quarters, and all twelve sparklines.

### Five more defects the measurement caught

1. **`⤡ Expand` chip 2px too tall** — same root cause as §01's badge: the prototype's is a
   `<button>` on the UA's `normal` line box (13px), a `<span>` inherits the body's. Every element
   below it in the card sat 3px low.
2. **§02's card heads use an 11px bottom margin, §01's 12px.** The prototype genuinely differs by a
   pixel between sections, and a pixel there moves everything under it.
3. **`var(--gaap)` does not exist in this app** — ours is `--gaap-color`. The second chart's line
   silently vanished (invalid custom property → `stroke` falls back to none, `fill` to black) and
   its end marker turned black. Second token whose name differs from the prototype's, after
   `--rule` → `--border-tint-rule`.
4. **Axis tick labels are not computable from a rounded maximum.** The prototype's own maxima are
   fractional (~1814.2, ~837.8), so quarters of a rounded max print 210M/629M where it prints
   209M/628M. The ticks are now carried as literals.
5. **The legend's proportion bar and its prior-quarter tick carry `opacity: 0.55`** — invisible in
   a computed-style dump that only asks for `background-color`, and worth 7,400 differing pixels.
   Also `min-width: 20px` on the track, so a 4% band still reads as a bar.

### §02's expander — rebuilt after getting it wrong

I first built the expander body from the section's *text*, and got a flat list of eight manager
rows. The prototype has something else entirely: a card containing a **3×4 grid of twelve
per-manager sparkline panels**, then a **ten-row table**, each with its own header, sub-bar and
caption. Reading the text instead of the tree is precisely the failure this method exists to
prevent; the side-by-side caught it immediately.

Rebuilt against the tree. **Expanded height is now 2026.8px against the prototype's 2025.8px**, and
the structure matches — but **~5.7% of pixels still differ**, concentrated in the panel grid
(bands repeating every ~124px, the panel row pitch) and the card head above it. That is one more
measurement pass, not a rebuild: `tools/boxes.js` against `#i2` with the expanders open will name
it the way it named the five above.

**Honesty note carried into the port:** both figures in a panel's footer are `--ink-soft`
regardless of direction. Each panel is scaled to its own range, and the prototype's own caption says
to read the trajectory and the printed figures rather than the relative heights — so a colour there
would score a shape it explicitly tells you not to read as one.

### State at the end of this run

| | §01 | §02 collapsed | §02 expanded | §03–§07 |
|---|---|---|---|---|
| height matches | ✅ 1127 | ✅ 808 | ~1px (2026.8 v 2025.8) | — |
| pixels > 32/255 | 1 | 32 | ~320k (5.7%) | — |
| built | ✅ incl. expander | ✅ | structure ✅, fidelity pass outstanding | ❌ empty shells |

e2e: 44 shots, every company view `errors=0`, only the two pre-existing sectorapp 502s.

---

## Fourth run — the columns were wrong app-wide (operator, 2026-07-31)

The operator spotted the middle column looking squeezed and the rail squashed. Measured at 1440:

| band | prototype | ours (before) | |
|---|---:|---:|---|
| sidebar | 210 | 210 | ✓ |
| page padding | **28** | **32** | +4 |
| view rail | **178** | **132** | **−46** |
| gap | 20 | 20 | ✓ |
| **content column** | **694** | **732** | **+38** |
| gap | 20 | 20 | ✓ |
| right rail | 262 | 262 | ✓ |

`1440 = 210 + 28 + 178 + 20 + 694 + 20 + 262 + 28` — the prototype's frame resolves exactly. Ours
did not, so the rail gave the space to the content column: **six of the seven jump-list labels
wrapped to two lines and "Register limits & supply" wrapped to three** (the prototype wraps three of
seven). That was the visible squashing.

Three rules, all shell-wide, changed **app-wide on the operator's call**:

```
style.css   .page            padding 12px 32px 72px  ->  12px 28px 72px
shell.css   .shell-rail      width 132px             ->  178px
shell.css   .shell-viewport  max-width 960px         ->  976px   (694 + 20 + 262)
```

The `max-width` mattered: at 960 the cap bound *before* the content reached its designed width, so
widening the rail alone would have landed the column on 678px rather than 694px.

**Result: rail 238/178, content 436/694, right rail 1150/262, jump-list heights
`[28,28,43,43,28,43,28]` — identical to the prototype's, band for band.**

### Blast radius, checked rather than assumed

- e2e: 44 shots, no new failures; only the two pre-existing sectorapp 502s.
- Every company view, `/sectors`, `/sectors?view=company`, `/compare`, `/screen`, `/manager`, at
  1440 **and** 1280: no horizontal scroll, no element escaping the viewport, no page errors.
- Two pages report SVGs authored wider than their mount — `/company/{sym}/institutional-legacy` (3)
  and `/manager` (4). **Pre-existing**, confirmed by re-measuring with V3-P2's widths restored: the
  same 3 and 4, and the gap actually *narrows* slightly under the new columns. This is the
  `ClearyFi.chartWidth()` bug that attempt 3's "fix 1" addressed; that fix lives only on the archive
  branch and is not on this one.
- **§01 re-diffed: now 0 pixels above 32/255** (was 1). §02: 30 (was 32). Both heights still exact.

## Open question for the operator

**Is §01 the fidelity bar?** It is pixel-identical at the prototype's own column, and the four
defects above are the kind only a measurement finds. §02–§07 follow the same method if so.
*(Answered 2026-07-30: yes. §02–§07 follow it.)*

---

## Fifth run — §02's remaining 68k pixels, and two capture bugs behind most of them

Picking up the one item left open: §02 expanded still differed on ~68k pixels / 19 bands, in two
clusters — a pair of full-width bands high in the section that the *collapsed* diff did not show,
and one band per row of the ten-row manager table.

**Result: all four states are now at §01's bar — zero bands, and 0 / 0 / 30 / 34 pixels above
32/255.** Two of the four defects were in the *measurement*, not the port, and both had been
quietly inflating every §02 number reported so far.

| state | pixels ≠ | >8/255 | >32/255 | bands | height |
|---|---:|---:|---:|---:|---|
| §01 collapsed | 704 | 36 | **0** | **0** | 1127 = 1127 |
| §01 expanded | 659 | 50 | **0** | **0** | 1700 = 1700 |
| §02 collapsed | 220 | 77 | 30 | **0** | 808 = 808 |
| §02 expanded | 1160 | 147 | 34 | **0** | 2025.8 = 2025.8 |

The 30/34 are the mini charts' end-marker circles, whose centres the prototype carries at full
precision and we round to three decimals. Four spots, four pixels each.

### Two measurement bugs — both made the port look worse than it was

1. **The captures were rasterised at different sub-pixel origins.** §01's capture pinned the
   section's fractional origin (see "the method", above); §02's did not — ours landed on `.8438`
   against the prototype's `.5`. Chrome snaps line boxes to device pixels, so that alone rewrote
   every glyph's antialiasing and produced two full-width bands that were not layout at all.
   Now handled by `tools/shot2.js`, which takes `FRACX`/`FRACY` and shifts the column to match.
2. **`captureBeyondViewport` paints sticky chrome into the middle of a tall section.** Any section
   taller than the 1200px viewport — §02 open is 2026px — gets the topbar composited ~380px down
   the clip. It looked like a real band because our topbar and the prototype's genuinely differ
   there (`⌘K` vs `Ctrl K`, and its `API REFERENCE ↗` chip). `HIDESTICKY=1` hides every
   `position: fixed|sticky` element outside the section, on **both** sides, before the shot.
   ⚠️ §01 collapsed is 1127px and never hit this, which is why it never appeared before §02.

### Three real defects, all invisible to a 32/255 pixel diff

3. **The manager table carried one ink and one size where the prototype has three of each.**
   Read off the render: the name is `--ink-body` (rgb 84,79,70), the two count columns `--ink` at
   **11.5px**, and the Δ column `--ink-soft` at **11px**. Ours had every cell at 11px/`--ink`,
   which darkened the name and the Δ *and* shifted both right-aligned count columns — that was the
   band under each of the ten rows.
4. **The expander button had no `background`, so it took the UA's `buttonface` grey** — in both
   states. Against the card's cream that is 10–25/255: *under* the diff threshold in the closed
   state, and under it again in the open state where the prototype paints `--accent-wash` (#F3E4D5)
   vs the same grey. It only surfaced on a `>8` pass. Closed is `transparent`, open is
   `--accent-wash` + `--accent-ink`.
5. **`.ip-chip` was `--ink-muted` where the prototype is `--ink-soft`** — a 15/255 difference, also
   invisible at 32.

### The font stacks: four, not two, and not guessable

The `Δ` in §02's caption "…as of 1Q26 · Δ is quarter over quarter in shares" drifted everything
after it: 390.44px in the prototype, 390.03px here. Cause is the one §01 already hit twice (`ƒ`,
`↗`): **the glyph is absent from the loaded Google-Fonts subset, so the *fallback* decides its
width** — and the prototype's stacks are not ours.

Comparing every element's computed `font-family` across §01 and §02 gives a rule that is *almost*
"HTML bare, SVG with fallback", with real exceptions:

| stack | who gets it |
|---|---|
| `"IBM Plex Mono"` | most HTML that declares a mono font |
| `"Hanken Grotesk"` | `.ip-sec-title`, `.ip-card-title` |
| `"IBM Plex Mono", monospace` | every SVG `<text>`, **and** §02's panel component (`.ip-panel-cls`, `.ip-panel-foot`) |
| `"Hanken Grotesk", sans-serif` | SVG labels, `.ip-panel-name`, `.ip-mtab-name` |

Now four port-local variables (`--ip-mono`, `--ip-sans`, `--ip-mono-fb`, `--ip-sans-fb`) rather
than `--font-mono` / `--font-sans`, which are *both* fallback stacks. ⚠️ **Phase 2 must revisit
this**: a real filer name can carry glyphs outside the latin subset, and a bare stack renders those
in the UA default rather than a monospace.

### Tooling added — this is what §03–§07 should be built with

| script | what it does |
|---|---|
| `shot2.js` | one section, either app, collapsed or open, at a matched column **and** matched fractional origin, with sticky chrome hidden. Replaces the ad-hoc per-section shot scripts. |
| `diff.js` | pixel diff computed in Chromium's own canvas (no image deps): counts at three thresholds, contiguous **row bands**, hot columns, amplified diff PNG. Bands are the signal; scattered pixels are antialiasing. |
| `crop.js` | the same region from both captures stacked proto / ours / diff, zoomable — turns a band's y-range into something you can actually look at. |
| `text.js` | every element's box, font, letter-spacing, colour, and per-text-node run widths. Localises a drift to one run. |
| `compare.py` | matches elements by text and reports every property mismatch. **This is the one that finds what a pixel diff cannot** — defects 3, 4 and 5 above, and all 72 font-stack mismatches. |

Run order per section: capture both → `compare.py` (properties) → `diff.js` (rasterisation) →
`crop.js` on any band that survives.

Also re-checked at **device pixel ratio 1**, where §01's badge defect only became a whole pixel:
§01 expanded 2 pixels above 32/255, §02 expanded 2, **zero bands in both**.

### e2e

44 shots. `institutional`, `institutional-legacy`, `institutional-nolocation` all `errors=0`; every
company view `errors=0`. The two `sectorapp-company` / `sectorapp-company-refocus` failures are the
same pre-existing 502s on `/sectors?view=company&symbol=900001` (a synthetic fixture CIK), on pages
this change does not touch. No `pytest` run — no Python changed.

---

## Sixth run — §03 Flows & concentration, and the measurement bug it exposed

§03 is the biggest section in the view: **3016.5px open**, 600 nodes, four hand-authored charts,
eight sub-components across three cards and a two-row expander. It came out **pixel-clean in both
states on the first build** — but only after a defect in the *comparison* was found, and that
defect had been silently degrading every diff in this port.

| state | pixels ≠ | >8/255 | >32/255 | bands | height |
|---|---:|---:|---:|---:|---|
| §03 collapsed | 1269 | 52 | **0** | **0** | 1832.5 = 1832.5 |
| §03 expanded | 1001 | 78 | **0** | **0** | 3016.5 = 3016.5 |
| §03 expanded @1× | 422 | 5 | 2 | **0** | — |

`compare.py`: **218 of 218 texts matched**, and every remaining property mismatch is one of the
three known comparator artifacts.

### The measurement bug: matching the viewport fraction is not enough

The first diff of §03 read **200,685 pixels over 32/255 in 111 bands** — while every DOM box, every
line box, every wrapper in the chain and all four SVGs measured **identical to three decimals**, at
both device pixel ratios, in both states. `tools/align.js` (written for exactly this) then showed
what was happening: the top of the capture aligned at `dy 0` with a *perfect zero*, and everything
below the Lorenz curve aligned at `dy −2` with a *perfect zero*. Not a layout difference — the same
pixels, one CSS pixel apart.

**Cause: Chrome snaps each paint op to the device-pixel grid, and that grid is anchored to the
DOCUMENT, not the viewport.** Two pages whose sections sit at the same *viewport* offset but
different *document* offsets round some glyph runs up and some down. Below a certain point the
rounding diverges and everything after it is a pixel out. It cannot be seen in any DOM measurement,
because the DOM is right.

`shot2.js` now takes `SNAP=1`, which shifts the pinned column (ours) or the section itself (the
prototype, which has no column to pin) so the section's **document-space** top is integral on both
sides. One flag: **200,685 → 6,003 pixels, 111 bands → 4.**

⚠️ This affected §01 and §02 too. Both were re-measured with `SNAP=1` and are unchanged or slightly
better — but a section whose content happened to straddle a rounding boundary could have been
declared clean when it was not, or chased for a defect it did not have.

### Two real defects, both fabricated literals

The 4 bands that survived were in one card, and `compare.py` had already named them: I had
transcribed the domicile card's last two rows as *Ireland 2.5% / Other · undisclosed 1.3%*. The
prototype's are **Norway · sovereign fund 1.6% / Rest of world 2.2%** — I had read eight rows of the
markup and invented the ninth and tenth. One overlap row was wrong the same way (*4 of 5 peers* for
*5 of 5*). After the fix: **0 pixels over 32/255, 0 bands.**

This is the failure mode D-literals exists to prevent, and the reason `compare.py` runs before the
pixel diff: an invented literal that happens to be the right *length* is invisible to the eye and
nearly invisible to a pixel diff.

### The four chart builders, and how their series were recovered

Every series was recovered numerically from the captured SVG and **round-trip-checked** — recompute
the geometry from the recovered numbers and it must reproduce the prototype's own coordinates.

| builder | recovery | check |
|---|---|---|
| `ipDivergingBars` | bar pixel heights ÷ the largest, carried back through a 74.25M maximum (the absolute scale is arbitrary — only each value over the largest is drawn) | the net rule is `add − red`, and recomputing it reproduces all six rule positions to 1e-4px |
| `ipRankedShare` | each manager's share is the **first difference of the cumulative curve's circle centres**, which carry full precision; the printed `15.0%` etc. are rounded and are separate literals | reproduces all ten bar heights to **5e-14** |
| `ipLorenz` | 61 cumulative-share points off the path; x fitted to `38.24 + 4.2384i` | reproduces all 61 printed abscissae at the prototype's own 1dp |
| `ipPeerMatrix` | 30 cells, each carrying **both** the printed percentage and the capture's own `fill-opacity` — the opacity is not a linear function of the rounded percentage | the label flips to the card colour above 0.47: checked against all 30 cells, **0 misses** |

Two things worth carrying forward: the ranked chart draws **two scales in one frame** (the line on
the 0–100% axis, the bars scaled so the largest fills half the plot) — the prototype's own choice,
and its caption says so; and §03 confirms §01's finding that **manager colour is carried per row,
not derived** — Idx A/B/C are accent, Act D is `#a88c5f`, Act E is `#8b8579`, Sov G is accent again.

### New tooling

| script | what it does |
|---|---|
| `align.js` | finds the (dx, dy) device-pixel shift that best aligns a REGION of one capture onto the other. Answers what a band cannot: *is this a layout difference, or the same pixels drawn a fraction off?* This is the tool that found the paint-grid bug. |
| `hprec.js` | full-precision (4dp) geometry of a section, its children and every SVG — for when two sides report the same one-decimal height |
| `lines.js` | per-LINE-BOX geometry: line-height, half-leading, where each line actually starts |
| `chain.js` | walks an anchor's ancestor chain and following siblings with margins/padding/borders — the only probe that sees a WRAPPER, which no text-based comparison can |

---

## Seventh run — the three affordances made live (operator, 2026-07-31)

`⤡ Expand`, `ƒ DERIVED` and `Treemap` were `<span>`s that rendered identically and did nothing.
They are now real controls, ported from the **running** prototype — a control's behaviour is not in
its markup, so each was driven with `tools/click.js` / `overlay.js` / `where.js` and its result read
back before anything was written.

### What each one actually does

| control | behaviour, read off the prototype |
|---|---|
| **⤡ Expand** | opens a lightbox: `rgba(28,26,22,.55)` backdrop, a `--bg-card` dialog (`max-width 1360px`, `max-height 92vh`), head with the modal's OWN title + note + a `CLOSE` button, body `min-height: min(58vh, 520px)`. The chart is **re-authored at the dialog's measured inner width** — the card's 660-unit viewBox becomes 1316 — never scaled up. Each of the five chips has its own title/note, none of them the card's. |
| **ƒ DERIVED** | reveals a `--bg-tint` "how this is computed" panel (formula, one row per input with its source filing, then a caveat) and flips its own label to `ƒ HIDE`. |
| **Treemap** | swaps the ranked chart for a squarified treemap, swaps the caption, and moves the pressed state. `⤡ Expand` then opens the TREEMAP, under its own title ("Who holds what · area is share of the 13F-reported register"). |

Chart builders are now width-parameterised, generalised from the two widths the prototype renders
at and verified against both: `ipRankedShare` `X1 = W−46`, `YB = H−58`, bar `min(54, step·0.6)`;
`ipAreaChart` `X1 = W−14`, `YB = H−34`; `ipDivergingBars` `X1 = W−12`; `ipPeerMatrix` scales by
`W/370`.

### Three defects the driving pass caught in my own work

1. **The lightbox head was never closed** — the body rendered *inside* the flex head, so the title
   and CLOSE sat at the bottom of an empty dialog. Visible immediately in the first driven capture.
2. **I hid `⤡ Expand` in treemap view.** `click.js`'s added/removed detection reuses element ids
   across snapshots, so it wrongly reported the chip as removed. Querying the prototype's live
   button list settled it: the chip **stays** (`vis: true, w: 68`). Fixed, and the probe's limits
   noted — a comparator that can be wrong is worse than no comparator unless you know where.
3. **`button.ip-chip` took the UA's grey.** The same trap as `.ip-expander-btn`, hit again the
   moment a `<span>` became a `<button>`: only ~15/255 against the card, so it passed a 32/255 diff
   and showed up only as `>8` climbing from 80 to 4,636 pixels on §02. **Any span that becomes a
   button needs `background: transparent`.**

### Two deliberate deviations, both listed

- **The derivation panel's placement.** The prototype renders it in a single shared slot at a fixed
  position — **`y 343`, a direct child of the section, between the first card and "Since the last
  13F"** — no matter which badge opened it. Clicking the badge on the tiles (`y 938`) opens a panel
  600px above it, next to an unrelated card. We render it under the block it explains, at full
  section width. Porting the shared slot would be porting a bug; say the word and it goes back.
- **§01's card-head badge opens nothing in the prototype** — it flips its label and changes not one
  other pixel (verified: two clicks return the DOM to byte-identical). Ported as a label-only
  toggle rather than inventing a panel for it.
- **The treemap in the lightbox.** The prototype **re-squarifies** at the modal's aspect
  (`1316×658`), so its cells are arranged differently there. We scale the card's own layout, which
  keeps every cell's share of the area exact but not its position. Its markup does not expose the
  squarify variant.

Left inert, and named so: `Set intersections`, `Trend`, and the clickable "Effective holders" stat.

### Verified

- **`tools/drive.js`, 28 driven assertions, 0 failures** — every lightbox by title and viewBox,
  Escape / Close / backdrop dismissal, the panel's hidden→shown→hidden cycle with its label and
  `aria-expanded`, both chart views with their captions and pressed states, and zero page or
  console errors across the whole pass.
- **No regression in the default rendering.** All six section states re-diffed: heights unchanged,
  **still zero bands**, still 0 / 0 / 30 / 34 / 0 / 0 pixels above 32/255.
- e2e: 44 shots, all three institutional shots `errors=0`, only the two pre-existing sectorapp 502s.

---

## Eighth run — §04 Ownership & stewardship, the first section built under D-behaviour

The first section ported with the control inventory as **step 1** rather than an afterthought, and
it shows: **1961px exact on the first build, 104 of 104 texts matched, 0 pixels above 32/255, 0
bands, in both states and at both device pixel ratios.**

| state | pixels ≠ | >8/255 | >32/255 | bands | height |
|---|---:|---:|---:|---:|---|
| §04 collapsed | 92 | 2 | **0** | **0** | 1487 = 1487 |
| §04 expanded | 15,106 | **4** | **0** | **0** | 1961 = 1961 |
| §04 expanded @1× | 3,433 | **0** | **0** | **0** | — |

`compare.py`: **104 / 104**, one property mismatch and it is the known expander nesting artifact.

### The inventory came first, and it changed the order of work

`tools/controls.js` against `#i4` before anything was written: **6 controls — four `↗` links, one
`⤡ Expand`, one expander. No `ƒ DERIVED` badges and no view toggles.** That mattered immediately:
the unresolved D1 deviation (derivation-panel placement) sets a precedent §04 would have inherited,
and the inventory proved §04 does not touch it. The build could start without waiting on that
ruling. Under the old order I would have found that out at the end.

Ours ships **6 controls, 0 inert.**

### What §04 contains

Two cards above the fold — **Beneficial ownership filings** (a lane chart, one lane per 5%-threshold
holder, then the current filings on file) and **Voting behavior** (four headline tiles, a 100% bar
per ballot item split for/against/abstain, then the managers who voted against management) — and two
behind the expander: **Vote-weighted ownership** and **Activism trail**.

`ipLaneChart` is the ninth chart builder. Its x positions were **recovered from the captured SVG**
(the prototype maps filing dates onto a time axis we do not have), like §01's dumbbell. Two layout
rules were derived and both reproduce all four lanes exactly: event labels alternate 16/32px below
the lane so neighbours cannot collide, and the last label right-anchors at the frame when its dot
sits past x=600.

### Two defects, both the same class

1. **I invented two ballot items.** The markup I had read was truncated at row 2, so rows 3 and 4
   went in from memory as *"Ratify auditor 91.8% / 8.2%"* and *"Elect directors (slate)"*. The
   prototype's are **"Election of directors (slate) · all elected · 91.7 / 8.3 / 0.0"** and
   **"Ratification of auditor · approved · 97.3 / 2.4 / 0.3"** — different wording, different
   figures, different order. `compare.py` named all six strings before a single pixel was compared.
   **Second time in two sections** (§03's domicile rows were the first). The rule that keeps
   catching it: *extract the literals mechanically, never fill a gap from memory.*
2. **The caption and one apostrophe were paraphrased** — the real caption ends "…ordered by the
   against share. Totals are the certified figures in 8-K Item 5.07.", and the prototype uses a
   straight apostrophe in "manager's" where I had typed a curly one.

Also caught by reading rather than by luck: §04's markup uses **`var(--gaap)`** again, which does
not exist here (ours is `--gaap-color`) — an invalid custom property makes the against-segment's
background fall back to nothing and the bar silently loses a colour. Third token-name mismatch after
`--rule` and §02's own `--gaap`.

### §04's links go somewhere different

§01–§03 link at EDGAR **full-text search**; §04's four links go at the registrant's **own filings by
CIK** (`cgi-bin/browse-edgar`, types `SC 13` and `8-K`) except `N-PX ↗`, which is full-text search.
`ipLink` now takes a target. The driving pass asserts the split (3 CIK-based + 1 N-PX).

`drive.js` is now **53 assertions, 0 failures**, including §04's lightbox
("Beneficial ownership filings · one lane per holder above the 5% threshold", `0 0 1316 278`).
No regression in §01–§03: heights identical, zero bands, `>32/255` unchanged.

---

## Ninth run — §05 Holder behavior

| state | pixels ≠ | >8/255 | >32/255 | bands | height |
|---|---:|---:|---:|---:|---|
| §05 collapsed | 31 | 4 | **0** | **0** | 780 = 780 |
| §05 expanded | 12,414 | **4** | **0** | **0** | 1177 = 1177 |
| §05 expanded @1× | 3,676 | **0** | **0** | **0** | — |

`compare.py`: **99 / 99**. **5 controls, 0 inert.** `drive.js` now **64 assertions, 0 failures**.

### The inventory answered a question that was blocking

§05 has **two `ƒ DERIVED` badges**, so it inherits D1 — the unruled deviation about where a
derivation panel opens. Driving them settled it before a line was written: **§05's panels land at
the bottom of their own card** (measured y700, w660, inside the card, no next sibling). That is
what the port already does. **§01's shared-slot behaviour is the prototype's outlier, not its
pattern** — which strengthens the case for the D1 deviation rather than weakening it, and meant §05
could be built without waiting on the ruling.

Tenth chart builder: **`ipCohortGrid`**, a triangular retention heatmap — 9 entry cohorts × a
shrinking row of quarters, 45 cells. Like §03's peer matrix, each cell carries **both** the printed
retention and the capture's own `fill-opacity` (the opacity is computed from the unrounded share, so
it cannot be derived from the label), and the value flips to the card colour above 0.46 — the
threshold that separates the capture's two groups (darkest `--ink` cell 0.449, lightest `--bg-card`
0.468).

### Three defects, and two were structural

1. **A caption I never extracted.** The funds card ends with **two** sentences in two spans, and my
   regex found only the first. `compare.py` named the missing one immediately.
2. **`line-height` on the stat value.** §05's headline stats declare **no** line-height where §03's
   declare `1`. At `normal` a 19px value box is ~25px instead of 19 — **5px**, and every element
   below it in the card moved. Third distinct size for this one component across three sections
   (26px / 21px / 19px), and now a third distinct line-height too. *The prototype does not
   normalise its own components; stop expecting it to.*
3. **The expander bar is a GRID ITEM here.** The prototype puts it inside the section's grid with
   `grid-column: 1 / -1`, so it picks up the grid's own 14px gap on both sides. I had it as a
   sibling *after* the grid, which lost 14px, and the revealed card then needed `--flush` because a
   grid item carries no card margin of its own. Two structural pixels-of-nothing worth 30px in
   total, invisible in any text comparison — only `hprec.js` on the grid's children showed it.

`var(--gaap)` appeared for the **fourth** time (the fund weight bars). Still `--gaap-color` here.

---

## Tenth run — §06 and §07, and phase 1's build is complete

| state | pixels ≠ | >8/255 | >32/255 | bands | height |
|---|---:|---:|---:|---:|---|
| §06 collapsed | **1** | **0** | **0** | **0** | 524 = 524 |
| §06 expanded | 17,721 | **0** | **0** | **0** | 1303.97 = 1303.97 |
| §06 expanded @1× | 4,139 | **0** | **0** | **0** | — |
| §07 collapsed | **0** | **0** | **0** | **0** | 540 = 540 |
| §07 expanded | 15,468 | **0** | **0** | **0** | 540.08 = 540.08 |
| §07 expanded @1× | 3,483 | **0** | **0** | **0** | — |

`compare.py`: §06 **99/99**, §07 **25/25 with ZERO property mismatches** — the only section with
none, because it has no expander and no badge, so none of the three nesting artifacts apply.
§07 collapsed is **byte-identical**: not one pixel differs.

**§06: 5 controls, 0 inert. §07: 0 controls** — the only section in the view with none, which
`tools/controls.js` confirmed against the prototype before anything was built.

### Three more builders, and one reuse that needed a real change

`ipTimeline` (dated windows on a shared axis, with a "today" rule), `ipBubbles` (one dot per Form 144
notice, placed by filing date and sized by shares proposed; filled = under a 10b5-1 plan), and
`ipHistogram` (acceptance lag, with the median called out where it falls). Twelve → **fifteen**.

The amendments-per-100 chart is `ipAreaChart` again — but its **bottom gridline is 2.9, not 0**.
`ipAreaChart` gained an `axisMin` rather than storing the series pre-offset: the picture would have
been identical either way, and phase 2 would have inherited a set of numbers that are not the
quantity they claim to be. The recovered series round-trips exactly, and the histogram's recovered
counts come out as **clean integers** (3, 2, 9, 20, 41, 84, 118, 163, 89, 71, 43, 16, 5, 4) — which
is the evidence its axis was recovered rather than guessed.

### One structural defect, worth 689px

§06's expander bar and the two cards it reveals are **grid items** of the section's own
`repeat(auto-fit, minmax(320px, 1fr))` grid, and the bar carries `grid-column: 1 / -1`. Ours put the
bar and both cards inside a single grid item, so the bar landed in a 340px column — its note wrapped
to two lines — and the two cards stacked instead of sharing a row. **1992px against 1304.**
`compare.py` had already matched 99/99 texts at that point: the words were right and the layout was
not, which is exactly the split those two tools exist to separate. Fixed with `grid-column: 1 / -1`
on `.ip-expander` / `.ip-expander-body` (inert wherever they are not grid items, so it is safe to
state once) and a nested grid for the revealed pair.

`var(--gaap)` appeared for the **fifth** time, in the amendments line.

### Where the port stands after §07

**All seven sections are built.** Fourteen states measured, at both device pixel ratios:

| | §01 | §02 | §03 | §04 | §05 | §06 | §07 |
|---|---|---|---|---|---|---|---|
| collapsed, >32/255 | **0** | 30 | **0** | 8 | **0** | **0** | **0** |
| expanded, >32/255 | **0** | 34 | **0** | **0** | **0** | **0** | **0** |
| bands, either state | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| height | exact | exact | exact | exact | exact | exact | exact |
| controls live | 3/4* | 7/7 | 11/11 | 6/6 | 5/5 | 5/5 | 0/0 |

\* §01's card-head badge opens nothing in the prototype either — a listed deviation, not a gap.

§02's 30/34 are the mini charts' end-marker circles; §04's 8 are the lane chart's dot antialiasing,
which moves between runs (0 on the previous pass). No bands anywhere, in any state, at either DPR.

**`tools/drive.js`: 71 driven assertions, 0 failures.**

**Fifteen chart builders**, all hand-authored SVG on a fixed `viewBox`, every series recovered
numerically from the capture and round-trip-checked: `ipDumbbell` · `ipAreaChart` · `ipStackedArea` ·
`ipSparkline` · `ipDivergingBars` · `ipRankedShare` · `ipLorenz` · `ipPeerMatrix` · `ipTreemap` ·
`ipUpset` · `ipLaneChart` · `ipCohortGrid` · `ipTimeline` · `ipBubbles` · `ipHistogram`.
📌 All fifteen expire when the prototype's d3 charts land — see D-protocharts.

### P1g — the full-page diff

The last measurement, and the only one that can see the spacing **between** sections: per-section
diffs are blind to it by construction. `shot2.js` gained `SEL2`, which extends the clip to that
element's bottom, so the capture runs from §01's top to §07's bottom in one image — deliberately
excluding the banner, the rails and the topbar, all of which differ by decision.

| run | size | pixels ≠ | >8/255 | >32/255 | bands |
|---|---|---:|---:|---:|---:|
| all seven, collapsed | 694 × **7,231** both | 828 | 24 | **0** | **0** |
| all seven, expanded | 694 × **11,856** both | 1,569 | 62 | **4** | **0** |

Run at **1×**: a 2× capture of 11,856 CSS px is 23,712 device rows, past Chrome's 16,384 canvas
limit — the diff cannot be computed at all. Every section was already measured at 2× individually.

Both totals match to the pixel, and `align.js` reports a **perfect zero at (0,0) on all six section
boundaries** — which is the direct evidence the inter-section spacing is right. A spacing error
would shift everything below it and band the rest of the image.

**Phase 1's build and its measurement are complete.**

---

## 🚦 The gate — passed, 2026-07-31, and the one thing every measurement missed

Walked interactively with the operator against the running prototype. Verdict: **"Confirmed — the
design is faithful."** §04–§07 and the whole-page rhythm came back *indistinguishable*; all four
listed deviations were accepted as built; steps 1–15 of `4b-manual-verification.md` all pass.

**One defect, and it is the important part of this entry.** §01–§03 raised: *"the left rail is not
fixed like in the prototype."*

`.shell-rail` **was** `position: sticky; top: 74px` — correct, and correct since V3-P2. But its
mount host (`#viewRail` / `#railHost`) is a flex item of `.shell-body { align-items: flex-start }`,
so it shrink-wrapped to the rail's own **549px**. A sticky element is bounded by its parent's box,
so the rail came unstuck the moment you scrolled past 549px and rode away with the page. The
prototype's `<nav>` is a direct child of the ~7,300px flex row, which is why its rail stays put.
Fixed shell-wide with `.shell-rail-host { align-self: stretch; }` and the class added at both mount
points. After a 2,500px scroll our rail now sits at **y = 74**, the same as the prototype's.

**Why fifteen tools and 71 assertions missed it:** every diff in this port is a *static capture of
one scroll position*. Sticky behaviour does not exist at a scroll position — it exists in the
**difference between two**, and nothing in the tooling compared those. `tools/rail.js` now does:
probe the rail before and after a scroll, on both sides.

That is the second defect the hands-on gate has caught that the automation could not (after the
overlap `⤡ Expand`), and it is the argument behind **D-manual-gate**: pixel-perfect and fully
driven is still not the same as *used*.

### Where the port stands after §05

| | §01 | §02 | §03 | §04 | §05 | §06–§07 |
|---|---|---|---|---|---|---|
| collapsed, >32/255 | **0** | 30 | **0** | **0** | **0** | — |
| expanded, >32/255 | **0** | 34 | **0** | **0** | **0** | — |
| bands, either state | **0** | **0** | **0** | **0** | **0** | — |
| height | exact | exact | exact | exact | exact | — |
| controls live | ✅ 3/4* | ✅ 7/7 | ✅ 19/19 | ✅ 6/6 | ✅ 5/5 | — |
| built | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ empty shells |

\* §01's card-head badge opens nothing in the prototype either — a listed deviation, not a gap.

§02's 30/34 are the mini charts' end-marker circles (full precision in the capture, three decimals
here) — four spots, four pixels each. Remaining: **§06 1304px · §07 540**, ≈1,844px.

**Twelve chart builders so far**, all hand-authored SVG on a fixed `viewBox`: `ipDumbbell` ·
`ipAreaChart` · `ipStackedArea` · `ipSparkline` · `ipDivergingBars` · `ipRankedShare` · `ipLorenz` ·
`ipPeerMatrix` · `ipTreemap` · `ipUpset` · `ipLaneChart` · `ipCohortGrid`. Every series in them was recovered
numerically from the capture and round-trip-checked. 📌 **All twelve expire when the prototype's d3
charts land** — see D-protocharts.

e2e: 44 shots, `institutional` / `institutional-legacy` / `institutional-nolocation` all
`errors=0`, only the two pre-existing `sectorapp-company*` 502s on a synthetic fixture CIK. No
`pytest` run — no Python changed.

### Known comparator artifacts — not defects, don't chase them

`compare.py` reports these on every section; they are structural, not visual:
- **badge / expander / table cell**: the prototype nests `<button><span>text</span></button>` and a
  grid cell `<span><span>value</span></span>`; ours puts the text directly in the outer element, so
  the two tools measure different boxes (ours = the 64/54/58px track, theirs = the 41.4px text).
- **inline vs block captions**: our `<span>` caption reports its widest line (588px) where the
  prototype's `<div>` reports the container (660px). Same wrap points, same height, same pixels.
- **split text nodes**: the prototype splits `index / passive · 13F-HR · filed 2026-05-11` into
  three spans plus separators; ours is one string. Identical rendering.

---

## Run 11 — prototype v4 lands (d3), and what it actually changes · 2026-07-31

`SEC Sector Analytics Prototype(3).zip` is the d3 rewrite D-protocharts anticipated. Before
deciding whether to chase it, it was **measured** against v3 (what we ported) and against our
shipped pages. Both prototypes were served side by side — v3 on `proto-srv:9000`, v4 on
`proto-v4:9001` with its CDN `d3@7` swapped for our vendored `vendor/d3.min.js` (v7.9.0) — and run
through the same `shot2.js` → `diff.js` gate as the port itself.

### The finding that decides the sequencing

**`instData` — the 554-line function that produces every number the Institutional view renders —
is byte-identical between v3 and v4. Zero diff.** So are all 185 lines of the chart call sites
(`d.lorenz=this.lorenzChart(d.concentration2.lorenzPts, HALF, 220)` is the same line in both).

The d3 rewrite changed **how the charts draw**. Plumbing changes **what they draw from**. They meet
at a builder signature that did not move, so neither ordering makes the other cheaper — which frees
the decision to be made on risk instead. Real data is what breaks charts (real N, real ranges,
`null`), so plumbing goes first and the d3 rewrite happens later against known-good data shapes.

### Markup: two changes in 1,044 lines

| § | change |
|---|---|
| §01 | **+4 lines** — a caption + link to the new *Insider activity* view |
| §06 | **−28 / +4** — the "Insider filings beyond Form 4" card **gutted**: Form 144 dot calendar, notices list, `⤡ Expand`, cooling-off line all deleted, replaced by two prose lines + a link |

§02, §03, §04, §05, §07 are byte-identical.

### Pixels — our shipped pages vs v4, collapsed default

| § | `>32/255` | bands | what moved |
|---|---|---|---|
| §01 | **0** | 0 | identical for all 1127px; v4 then appends 59px |
| §02 | 8,747 (0.39%) | 14 | axis tick labels ~1px (d3 `tickPadding` vs hand-placed) |
| §03 | 112,816 (2.22%) | 26 | **diverging bars repositioned + resized**; **pareto bars gained rounded tops**; rest are 1–2px label shifts |
| §04 | 7,631 (0.19%) | 1 | one 16-row band |
| §05 | **0** | 0 | identical |
| §06 | 1,658 (0.11%) | 1 | the acceptance-lag histogram, `scaleBand` shift |
| §07 | **0** | 0 | identical |

Heights match exactly everywhere except §01. In the **treemap view: 313,686px in one 680-row
band** — `d3.treemapSquarify` produces a genuinely different picture than v3's hand-rolled
recursive split. That one is a re-layout, not a nudge.

Ours-vs-v4 tracks v3-vs-v4 to within 30 pixels on every section, which is the independent
confirmation that our port is still exactly v3 and the whole delta is the prototype's own change.

### What was taken now

Only the two markup changes — operator decision, "take the two markup changes and record it".

- **§01** gained `ip01InsiderXref()`: the caption that names the insider-ownership figure as the
  **DEF 14A** table (a different measurement from the Form 4 ledger) plus the way out.
- **§06**'s `ip06Form144()` is now two prose lines + the same link. This **retired live code**:
  `ipBubbles` (the dot calendar), the `06-notices` lightbox entry, `IP_EDGAR_144` / `IP_EDGAR_F4`,
  the `notices` / `recent` / `noticesNote` / `form144Note` literal blocks and the
  `.ip-notice-*` / `.ip-planlist` CSS. Fourteen fabricated Form 144 dots and four named notices
  left the codebase — D-literals progress that came free.
- The prototype uses `href="#"` plus a handler. Ours is a **real anchor** to
  `/company/{symbol}/insider`, so it is keyboard-reachable and a modified click still opens a tab;
  the delegated `[data-ip-go]` handler turns a plain left click into `selectTab()`. **Deviation,
  listed** — the mechanism is the prototype's, the affordance is better.

Our destination is the Insider tab this hub already has, **not** the prototype's new *Insider
activity* view (a whole new Company Hub sibling that v4 also adds — out of V3-P5a's scope).

### Verification

- **§01 vs v4: height 1186 = 1186, `>32` = 0, bands = 0.** Exact.
- **§06 expanded vs v4: height 1301 = 1301**, and the rewritten card region diffs blank; the 12
  remaining bands are the acceptance-lag histogram's d3 shift, unchanged from before this edit.
- §02–§05, §07 re-diffed against their own pre-edit captures: **0 bands, 0 differing pixels**
  (§04's 8 is the same pre-existing rasterisation noise). No regression.
- Both links **driven**: 4/4 assertions pass, 0 page errors, and they land on the real Form 4
  ledger (`Cook Timothy D · 2026-06-15`), not an empty view.
- e2e: `institutional` `errors=0`; only the two pre-existing `sectorapp-company*` 502s on the
  synthetic fixture CIK 900001. No `pytest` — no Python changed.

### What this costs later

The d3 rewrite, when it is taken, is **4 of 15 builders** plus a treemap re-layout — not a re-port.
`ipDivergingBars`, `ipRankedShare`, `ipTreemap` and `ipHistogram` carry essentially all of it;
everything else is a 1–2px axis-label shift. RECONCILIATION §5 calls it "a copy list, not a
translation plan", and the prototype's d3 is liftable. It also brings hover readouts, transitions,
and a `ResizeObserver` for fluid width — real interactivity, but interactivity over fabricated
literals is polish on a placeholder, which is the second reason it waits.

---

## Run 12 — §01 plumbed · 2026-07-31

First section off the literals. `IP01` shrank from 4,384 characters to two blocks — `scope` and
`speed` — which are **statements of filing rules, not figures**: what Section 13(f) covers, and each
form's statutory deadline. They are the same for every registrant and are not fetched from anywhere.

**The data layer** (`IP_DATA` / `ipLoad`): one load per (symbol, period) over
`/institutional-periods` → `-register`, `-register-shape`, `-filed-since`, `-activity` in parallel.
The four are **settled, not raced** — a failure in one renders that block's own error and leaves
the rest of the page standing. `IP_DONE` names the sections that have made the trip, and **the
banner reads it**, so the warning shrinks section by section and removes itself when the last
literal goes.

**A plumbed section never falls back to a literal.** `ipSection01` guards on
`IP_DATA.status`: loading renders `states.loading`, a failure renders `states.error` with the
status and the API's detail. The `|| IP01.x` fallbacks that survived the first draft were deleted —
the banner now tells the reader §01 is real, so a fallback would make the banner lie for the
duration of a fetch, and a dead path to fabricated numbers is what D-literals exists to prevent.

### Three things real data broke that literals never would have

This is the argument for plumbing before the d3 port, and it showed up within one section:

1. **`ipDumbbell` had the prototype's scale baked in** — `domainMax: 123.43` (millions). A real
   register runs to billions, so every dot clamped onto the track's right edge and the chart drew
   three flat lines. `domainMax` is now a parameter, derived from the rows with 6% headroom.
2. **The freshness strip wrapped.** Four cells, no width share — the API's `reason` is a sentence
   where the prototype had three words, so the fourth cell dropped to a second row.
   `.ip-strip-cell` now takes `flex: 1 1 118px; min-width: 0` and the reason wraps in its own cell.
3. **Two captions had become false.** The dumbbell's said *"Colour is manager type"* — we do not
   classify managers by type and inventing a class from the name is the fabrication phase 2
   removes, so it is one accent now and the caption says what it is: **DERIVED by diffing two
   quarter-end snapshots, not reported trades**, naming the prior quarter, and saying that only
   managers reporting in both quarters appear. The card head said *"by EDGAR acceptance time"*;
   `filed-since` returns **filing dates** (acceptance timestamps are V3-P3), so it says "by filing
   date".

Also fixed: `Base 13F ↗` pointed at the prototype's own AVGO full-text search. `ipEdgarFts()` now
follows the viewed issuer. The CIK-keyed §04 targets still carry the prototype's CIK — §04 is not
plumbed yet.

### CANNOT-SOURCE, as rendered

Four figures the prototype prints have no honest source. **None of them renders a number**, and
each carries its reason where the prototype puts its prose:

| figure | what it says now |
|---|---|
| Confirmed in last 30 days | `N/A` · "we do not track per-holding filing confirmations, so no share of the register can be called confirmed" |
| Filed since (`+9.7M`) | `N/A` · "0 of 4 filings state a position; the rest report single transactions, which do not sum into a register" |
| Adjusted register (`776M`) | `N/A` · "a 13D/G total, a Form 4 transaction and a 13F holding do not add — the sum would be a share count nobody filed" |
| Institutional share · Insider ownership | `N/A` · needs shares outstanding, which the register does not carry; the DEF 14A table is not ingested |

⚠️ **Open for the operator:** RECONCILIATION §3 wants a `statusChip()` on every derived value.
Adding chips would break the pixel match just accepted, so phase 2 keeps the prototype's shape and
puts the honesty in the note slot the prototype already uses for prose. That is a reading, not a
ruling — it needs one.

### Verification

Driven on the live page after the fetch settles, not inspected in source:

- **AAPL** — 1Q26 filed 2026-03-31 · 122 days; next window 2026-11-14 in 106 days (from the
  statutory rule, not a literal); 4 filings since; base register 2.9B; 7 reporting managers;
  dumbbell rows **VANGUARD / STATE STREET / BERKSHIRE** at +60M / +50M / −20M; the filing table is
  four real Form 4s (Cook, Maestri, Adams, O'Brien).
- **JPM** — a thinner register renders the same way: 2 managers, 3.8M shares, real manager names.
- **ZZZZ** — 404 into the app's own not-found state.
- **`zeros: []`** on every capture — the check that scans every value slot for `0` / `0.0` / `0%`.
  **No missing value is rendered as zero.**
- 0 page errors. e2e: `institutional` `errors=0`, only the two pre-existing `sectorapp-company*`
  502s on synthetic CIK 900001.

**§01's pixel gate is retired by design** — it now renders this company's numbers, not the
prototype's, so height and text no longer match the capture and should not. What is preserved is
the layout, and it is: the strip, the equation panel, the dumbbell, the tiles and the expander all
sit exactly where the port put them.

---

## Run 13 — §01's QA cycle: three defects, one cause · 2026-08-01

The operator reported the equation panel. Fixing it turned up two more of the same kind, and the
pattern is worth stating plainly because §02–§06 will meet it again:

> **Every layout constant in the port was sized for the prototype's own short sample strings.**
> Real filings text is longer — and for text inside SVG it is also **font-dependent**.

| | what broke | measured |
|---|---|---|
| **D-1** *operator* | The base/filed-since/adjusted panel is an **arithmetic statement**; `+` and `=` only read as operators while the terms share a row. `.ip-eq` had no width share on its children, so a cell sized to max-content (**607px in a 660px panel**) wrapped each term onto its own line | **248px / 3 rows → 81px / 1 row** |
| **D-2** *swept* | Same cause one cell over: the freshness strip's "Confirmed in last 30 days" reason, a 17-word sentence in a 118px cell | **157px → 105px** |
| **D-3** *operator* | The dumbbell's label gutter is a hard-coded 210 units. Labels are right-anchored so they run **left**, and `svg.ip-db` is `overflow: hidden` — a long manager name is **silently cut** | see below |

**D-3 is the one to remember.** The same name measures **165.8 units with Hanken Grotesk loaded and
184.7 without (+11%)**, so whether it clips depends on which font actually resolved. It rendered
clean in every headless capture and was cut on the operator's screen. A 63-character name lands at
**leftEdge −212.6**.

The fix is the rule `RECONCILIATION.md` §6 already states and this port had not applied:
**measure, don't estimate.** `ipFitDumbbell()` runs after paint and again on `document.fonts.ready`,
calls `getComputedTextLength()` on the real rendered text, grows the gutter to fit (capped at 330,
past which the track is too short to read), and trims with an ellipsis beyond that — keeping the
full name on a `<title>`. Verified at the worst case, a 63-character name **with the webfont
blocked**: gutter 210 → 329, `CLIPPED: false`, all dots inside, short labels untouched.

`domainMax` and `gutter` are now both parameters on `ipDumbbell`; the literal fallback still passes
the prototype's constants, so phase 1's rendering is unchanged.

### D-chips — the status vocabulary, settled

The open question from run 12 was answered: **(c) chips only on N/A and approximate**. A value that
is fine carries no chip, which preserves the rendering accepted at the fidelity gate; a value that
is `N/A` or `approximate` carries the **shared `ClearyFi.statusChip`**, not a local lookalike, so
the port speaks the same vocabulary as the rest of the product. Implemented on §01 in the same
cycle rather than left as debt.

**Asserted, not eyeballed:** a slot carries a chip **iff** its value is `N/A`. Across all eleven of
§01's value slots — 5 chips on 5 `N/A`, 0 on 6 clean, **`violations: []`**.

### What the tooling should carry into §02–§06

Two of the three defects came from the operator, and no automated check in this repo would have
caught D-3. Before plumbing the next section:

1. **Sweep every hard-coded label gutter** with `getComputedTextLength()` — §02's manager table,
   §03's ranked-share and treemap, §04's lanes, §05's cohort grid all have the same exposure.
2. **Run the layout checks with the webfont blocked.** That is the condition the captures do not
   reproduce and a real browser does.
3. **Keep `zeros: []` and `violations: []` in the driving script** for every section — they are
   cheap, and they are the two invariants that would be a lie rather than a blemish if they broke.

e2e `institutional` `errors=0`; 609 pytest. Section 1173px. Artifacts: `4-qa.md` and a **signed**
`4b-manual-verification.md`; phase 1's are preserved as `*-phase1.md`.

---

## Run 14 — §02 plumbed · 2026-08-01

`IP02` deleted entirely (6,260 chars) — unlike §01, **nothing survived**: every value in it was a
figure, not a filing rule. `ipStackedArea` went with it (1,876 chars), the only consumer being the
manager-mix chart described below.

**Sources.** Holder count and reported shares per quarter come from `/institutional-register` asked
**once per ingested quarter** rather than re-derived from the per-manager series — the API owns
those numbers and applies the same exclusions everywhere, and the axis is five quarters, so it is a
bounded handful of cache-aside reads. Panels and the as-of dates come from
`/institutional-holdings-series`; the table from the register's ranked `share_vector`; Δ from
`/institutional-activity`.

### The one block that cannot be sourced — Manager mix

The prototype's own card note says **"classification assigned by ClearyFi"**, and that is exactly
the problem: **we assign no such classification.** Index / active / hedge fund / pension is not on
a 13F cover page and is not derivable from one. Inferring it from a manager's *name* is the same
fabrication that cost §01's dumbbell its three-colour encoding.

Rendered as an honest empty state with that reason, carrying an `∅ N/A` chip per D-chips. The
card's other half — **Top ten managers** — is the register's own `top10_share` and is real.

⚠️ **Operator decision still open:** empty-state (as built) vs remove the block vs replace it with
something we *can* source over the same axis. Logged in `3-implementation.md`.

### Two labels the prototype had that we cannot honestly keep

- **"% out"** → **"% of register"**. The prototype's column is a share of *shares outstanding*,
  which the register does not carry — the same gap that makes §01's institutional-share tile N/A.
  `weight` is a share of the ingested filers' reported shares. Renamed, not dropped: the number is
  real, the prototype's label for it was not.
- **"Manager · classification"** → **"Manager"**, and each panel's classification sub-line became
  **"N quarters reported"** — which is what a reader actually needs to weigh the shape.

### Three defects, and one of them was mine from run 12

1. **Integer axis.** `ipNiceAxis` treated a holder count as continuous, so 7 filers produced ticks
   `0 / 1.8 / 3.6 / 5.4 / 7.2` printing as **"0 2 4 5 7"** — visually uneven — and 2 filers printed
   **"0 1 1 2 2"** with duplicate labels. Counts now step by whole numbers: `0 2 4 6 8` and
   `0 1 2 3 4`.
2. **A pre-existing inert badge, from phase 1.** `ipBadge("02-topten")` rendered with **no
   `IP_DERIVATIONS` entry**, so it opened nothing — a D-behaviour violation that phase 1's 71
   driven assertions missed because nothing drove *that* badge. It now has a real derivation, which
   §02's real data made possible to write.
3. **A double-bound listener — mine, introduced in run 12.** `ipBindAffordances()` had no
   bind-once guard, and splitting `renderInstitutionalPort` into paint → fetch → repaint made it
   run **twice per load**. Every *toggle* therefore ran its handler twice and landed back where it
   started: the derivation badge relabelled to "ƒ hide" and instantly back to "ƒ derived", opening
   nothing. `ipBindExpanders` already had the guard; `ipBindAffordances` now does too.

**Defect 3 is the lesson.** It only appears on a control whose handler is a *toggle* — the lightbox
and the cross-view links kept working perfectly, because running their handler twice is idempotent.
A driving pass that only checks "did something happen" would have passed it. Assert the *resulting
state*, not that a click was accepted.

### One-point series

A manager reporting a single quarter gets **no sparkline** — one point drawn as a line asserts a
trend we have not observed. The panel says "one quarter reported — no trend to draw", and a
genuinely flat series says "unchanged across the quarters we hold". Four of AAPL's seven filers are
in that state, so this is the common case on a thin register, not an edge case.

### Verification

- **Controls: 4/4** driven (expander, both `⤡ Expand` lightboxes, the derivation badge), 0 page
  errors. §01's cross-view links re-driven after the bind fix: still 4/4.
- **The mandated clipping sweep, all four combinations** (AAPL/JPM × webfont loaded/blocked):
  `svgOverflow=0  domBleed=0  docScroll=false`. This is the check run 13 said to add, and §02
  passed it before shipping rather than after a report.
- **`zeros: []`** on both companies across §01+§02.
- AAPL: 7 filers, 2.9B shares, 4 ingested quarters, top-ten 100.0% (correctly, and the note says
  "which is all of them, so this reads 100% by construction"). JPM: 2 filers, 3.8M, 2 quarters.
- **609 pytest**; e2e `institutional` `errors=0`.

Banner now reads **"4 of these sections are still design placeholders"** — §03–§06.

---

## Run 15 — `typeOfReportingPerson`: the one manager classification that IS filed · 2026-08-01

Operator asked whether Schedule 13D/G Item 3's self-identification could stand in for the manager
classification §02 cannot source. **Nearly** — the right field is next to it.

### What the forms actually carry

Read out of our own fixtures, not assumed:

| | field | value in the fixture |
|---|---|---|
| 13G cover page | `typeOfReportingPerson` | `IA` |
| 13G **Item 3** | `typeOfPersonFiling` | `IA` |
| 13D cover page | `typeOfReportingPerson` | `OO ×5`, `CO` |
| 13D **Item 3** | `fundsSource` | **free prose** — "Source and Amount of Funds" |

So **Item 3 is not one field across the two forms.** On 13G it is the classification; on 13D it is
an entirely different item, and it is narrative text — Track 2, deliberately not parsed. Worse,
13G's Item 3 only applies under **Rule 13d-1(b)** (the qualified-institution route); a 13d-1(c)
passive filer marks it not-applicable.

**The cover-page `typeOfReportingPerson` box is on every structured 13D and 13G, once per reporting
person**, from a fixed SEC code set. That is what we now parse — recorded in `schema.py`'s
`TYPE_OF_REPORTING_PERSON`, with the Item-3 distinction written down beside it so nobody re-derives
this.

### The join, and why it is by name

A 13D/G names its reporting persons **in text and carries no CIK for them** — the accession's filer
CIK is the *submitter*, which on a jointly-filed 13D is one of several persons and can be an agent.
So the join to the 13F register is by name, and deliberately **exact after normalization**, the same
conservative posture as `normalize/cusip.py`: a near-match is not a match, and an unmatched manager
gets no type rather than a guessed one. It lives in `routes.py`, not the client — the API owns the
matching rule.

Measured against real name pairs, 4 of 5 matched immediately. The miss was
`"The Vanguard Group, Inc."` vs `"VANGUARD GROUP INC"` — a **leading article**. `normalize_issuer_name`
now drops a leading `THE`, which is not a step toward fuzzy matching: two different entities cannot
be distinguished by an article. (It also fixes "The Coca-Cola Company" vs "Coca-Cola Co" for the
CUSIP resolver, which shares the function. 610 tests green either way.)

### Coverage is the honest limit, and it decides the design

**Only holders above 5% file 13D/G at all.** On the fixture: 3 of 7 managers carry a type; in the
real market AAPL has ~1,600 13F filers and roughly three 13G filers.

That is fine for a **table column** — type beside the largest managers, `—` where nobody filed. It
is *not* enough for the **composition chart** §02's manager-mix card draws, which needs every filer
or it describes three managers while looking like it describes the register. The mix card therefore
**keeps its empty state**, and its copy now names the distinction rather than flatly saying "we do
not classify managers", which would have contradicted the new column:

> We do not classify managers **by strategy** … The filers above 5% do declare an **entity type** on
> their Schedule 13D/G cover page — adviser, bank, corporation — and that is shown per manager in
> the table below. It is a different statement from strategy, and it exists for only the largest few.

### Verification

- **Migration proved on a live volume, not just a fresh one.** The pre-existing `e2e.db` came back
  with `type_of_reporting_person` **appended at the end** of `PRAGMA table_info` — `ALTER TABLE ADD
  COLUMN` ran against a populated table — and its existing 53 rows read `NULL`, which is the honest
  answer for a filing parsed before we looked at the field.
- **Driven live:** `VANGUARD GROUP INC → IA Investment adviser`, `STATE STREET CORP → BK Bank`,
  `BERKSHIRE HATHAWAY INC → CO Corporation`, and `—` for the four with no 13D/G. All three matched
  across a different name style on each side.
- **610 pytest** (+1: the new code-maps-to-a-label test, plus assertions on both existing parser
  tests — 13G's `IA`, and 13D's `["OO","OO","OO","OO","OO","CO"]` per reporting person).
- **ruff**: identical findings before and after on all four changed backend files — zero added.
- Clipping sweep all four combinations: `svgOverflow=0 domBleed=0`. Controls 4/4. `zeros: []`.
  e2e `institutional` `errors=0`.

### Still on the table, not taken

13G also carries `soleVotingPower` / `sharedVotingPower` / `soleDispositivePower` /
`sharedDispositivePower` — we are already inside that XML and do not extract them. Voting vs
dispositive power separates **influence from custody**, which is arguably the more interesting split
than entity type. Same 5% coverage limit. Not in scope here; worth its own task.

---

## Run 16 — the manager mix gets real data: SIC on the manager's own registration · 2026-08-01

Operator asked whether there is a *semantic* way to bucket managers. Three readings, and they
land in very different places:

1. **NLP over ADV/N-PORT/prospectus text** → **Track 2. Flagged and not built.**
2. **The filer's own SIC code** → a real taxonomy, filed, **whole-register coverage**. Built.
3. **Behavioural measures** (portfolio breadth, turnover, options usage, 13D-vs-13G) → real, but
   they are *measurements*, not identity. Logged, not built.

### Why SIC is the answer the mix card needed

Every EDGAR filer carries `sic` / `sicDescription` in the top level of its own
`/submissions/CIK##########.json` — the same two fields `ingest/sic_backfill.py` already reads for
issuers, and `company_profiles` is keyed on a **bare CIK**, so a manager sits in the same table.

Crucially it reaches **the whole register**, where Schedule 13D/G's cover-page type (run 15) reaches
only the filers above 5%. That coverage difference is exactly why one is a *column* and this one
can be a *composition chart*.

**The gap that had to close:** `run_sic_backfill` sourced CIKs from `RawFactRepository.all_ciks()`
— companies with XBRL facts. **Managers file no XBRL**, so they were unreachable. Added
`all_manager_ciks()` to the holdings repository and a `--only issuers|managers` flag; the default
runs both and de-duplicates, because a CIK can be both (Berkshire is the obvious one).

### `normalize/manager_category.py` — the new classifier, and its one load-bearing rule

SIC → institution type (adviser / bank / insurance / fund / broker-dealer / trust / other),
following `geography.py`'s pattern: pure, documented, interpreted at the serve edge so `sec/` stays
free of business logic.

**`None` is not `"other"`.** No SIC on file returns `None` and the holder is counted as
*unclassified*; `"other"` means we HAVE a code and it is not a named institution type. Folding the
first into the second would turn a coverage gap into a finding about the register. `composition()`
therefore reports `coverage` — *a mix over 97% of the register and a mix over 30% are different
claims* — and there is a test for each half of that distinction.

### What it does NOT say, written into the code and the caption

SIC is a **registration** category, not a strategy: **an index fund, a stock-picker and a quant shop
all register as 6282**. It is self-assigned, rarely revisited, coarse, and describes the filing
entity rather than the fund complex behind it. That sentence is in `manager_category.py`'s
docstring, in `_COMPOSITION_CANNOT`, in the `02-mix` derivation panel, and in the chart caption. It
is the difference between this card being honest and being the fabrication the empty state existed
to prevent.

The fixture makes the point by itself: **Berkshire is 6331, insurance** — it holds those shares as
an insurer, not as a fund manager, which is precisely the thing registration type reveals and a
strategy label would have hidden.

### Two defects, both in the restored builder

`ipStackedArea` came back from `a9fe149^` and brought a latent bug with it:

1. **Labels placed at `i * 2 * step`.** The prototype passed a *pre-thinned* list (5 labels for 9
   quarters) and the builder doubled the step to compensate. With 4 real quarters and 4 labels,
   labels 2 and 3 landed at **x=381 and x=550 in a 306-unit viewBox** and were silently clipped.
   The thinning rule cannot live at the call site when the quarter count is whatever the data has —
   the builder now takes one label per point and decides.
2. **The last label still overran by 1.4 units** once placed correctly. Fixed by **edge anchoring**
   — `RECONCILIATION.md` §6 rule 1, the rule this port had not yet applied: first label anchors
   `start`, last anchors `end`, middle stay centred. Not width arithmetic.

**The sweep found both**, before the operator did. That is the check run 13 added and run 14 said to
run per section — the first time it has caught something rather than confirming a clean bill.

### Verification

- **620 pytest** (+10: the classifier and composition, including `None` vs `"other"`, the coverage
  arithmetic, the na-with-a-reason path, and an empty register).
- **ruff clean** on every new and changed file (`All checks passed`).
- Live: composition `status: ok`, **coverage 96.85%** — advisers 61.73% (3), bank 23.10%,
  insurance 10.11%, fund 5.05% — with **1 holder unclassified and excluded, not bucketed**.
- Clipping sweep all four combinations `svgOverflow=0 domBleed=0`; **controls 5/5** (the `02-mix`
  derivation badge is live again now the card has a real derivation to show).
- e2e `institutional` `errors=0`; `zeros: []`.

### Logged, not built

- **Behavioural buckets**: `investment_discretion` (stored, just not selected by `holders_of()` —
  one line), options usage via `putCall`, portfolio breadth, and 13D-vs-13G declared intent. All
  filed facts. They describe *observed behaviour*, so they must be labelled as measurements, never
  as identity.
- **13G voting vs dispositive power** — still unextracted, still the sharper split (influence vs
  custody), still bounded by the same 5% coverage limit.
