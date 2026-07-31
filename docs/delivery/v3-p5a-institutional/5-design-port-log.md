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

`tools/` holds five scripts, all re-runnable for §02–§07:

| script | what it does |
|---|---|
| `capture.js` | drives the prototype to Companies → Institutional; PNG per section, `literals.json` (every element's text + computed CSS), `tokens.json` |
| `ours.js` | same section from our app, pinned to the prototype's exact column and origin; PNG + geometry |
| `boxes.js` | every text box's position/size relative to its section, for a numeric diff |
| `shot.js` | plain screenshots at 1440 / 900 / 430, no harness tricks |
| `frac.js` | fractional geometry at 1× and 2× — catches layout that only breaks at one device pixel ratio |

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

## Open question for the operator

**Is §01 the fidelity bar?** It is pixel-identical at the prototype's own column, and the four
defects above are the kind only a measurement finds. §02–§07 follow the same method if so.
