# Profin UI — Style Guide (READ BEFORE BUILDING NEW PAGES)

This is the canonical style reference for every Profin data-facing page (Data Explorer,
Company Fundamentals, Compare Companies, and anything new). **Read this in full before
writing a new page.** It exists so a new screen looks like it was always part of the
product — same paper, same rules, same numeric treatment, same honesty conventions.

The aesthetic is a **"retro ledger / filing-cabinet"** system: warm paper, hard offset
shadows, tight radii, IBM Plex Mono for anything machine-ish (data, tags, metadata),
Hanken Grotesk for human copy. It reads like a well-set financial statement, not a SaaS
dashboard. When in doubt, make it calmer and more document-like, not flashier.

> **Non-negotiable rule that outranks aesthetics:** never fabricate or imply precision we
> don't have. The status vocabulary (§7) and the provenance/"show your work" pattern (§8)
> are load-bearing product features, not decoration. A new page that drops them is wrong
> even if it looks right.

---

## 1. Color tokens

Use these exact values. Do not introduce new hues; if a repo-level token system exists,
map these onto it rather than re-declaring.

### Paper & surfaces (warm neutrals)
| Token | Hex | Use |
|---|---|---|
| Paper base | `#EDE4D0` | Page background |
| Paper dots | `#E4D9C0` | Dotted-grid overlay on the page bg (see §4) |
| Panel warm | `#E7DCC3` | Query/legend panels |
| Panel deep | `#E1D5B9` | Header strips, table header rows |
| Panel soft | `#E9DFC9` | Loading / empty / group-header surfaces |
| Panel pale | `#EFE6D0` | Toolbars, provenance expansion bg |
| Card fill | `#F4EEDF` | Primary card / table interior (the "active" surface) |
| Card inactive | `#EDE3CD` | Resting metric card / non-applicable cell fill |

### Ink (text)
| Token | Hex | Use |
|---|---|---|
| Ink | `#221F18` | Primary text, heavy rules, inverse-button fill |
| Ink muted | `#4A4335` | Body copy |
| Ink soft | `#6E6553` | Secondary/meta text, mono labels |
| Ink faint | `#8A8069` | Captions, uppercase micro-labels |
| Ink fainter | `#9A8F76` | De-emphasized meta, disabled hints |
| Token grey | `#B0A588` | N/A & N/M values (deliberately drained of ink) |

### Rules / borders
| Token | Hex | Use |
|---|---|---|
| Rule hair | `#E4DAC2` | Row dividers inside cards/tables |
| Rule mid | `#C9BB98` | Structural borders, inactive pill borders |
| Rule warm | `#BCAC89` | Secondary masthead rule, dashed containers |
| Rule heavy | `#221F18` | Primary borders, 2px section underlines |

### Accent — ink blue (the ONLY chromatic accent for "good"/interactive)
| Token | Hex | Use |
|---|---|---|
| Accent | `#2F5B8F` | Eyebrows, active states, sparklines, links, primary buttons-on |
| Accent deep | `#264C77` | Totals, big numeric emphasis, position-bar markers |
| Accent wash | `#DDE5EE` | Active pill fill, revealed-value highlight, US-GAAP badge bg |
| Accent hairline | `#B9C6D6` / `#C9D6E6` | Dotted underlines on clickable values, badge borders |

### Warm flag — terracotta (RESERVED — see §7)
| Token | Hex | Use |
|---|---|---|
| Flag | `#B15E3C` | APPROX marker, extension badge text, 404 code, mismatch warnings |
| Flag bg | `#F0DDD1` | APPROX chip / EXT badge fill |
| Flag border | `#E3C4B4` | APPROX chip / EXT badge border |

**Terracotta is a semantic reserve.** It means "shown but flagged / caveat / doesn't
reconcile." Never use it decoratively, and never use accent-blue to mean "good value" in
a judgmental sense — see §9.

### Shadow
Hard offset ledger shadow, never blurred:
- Cards / panels: `box-shadow: 5px 5px 0 #D8CCB2;`
- Emphasis containers (matrix, hero): `6px 6px 0 #D8CCB2;`

---

## 2. Typography

Two families only. Load both (Google Fonts): `Hanken Grotesk` (400–900) + `IBM Plex Mono`
(400–600, plus italic 400).

**Hanken Grotesk** — human/display: page titles, company names, metric names, body copy,
buttons with word labels.
**IBM Plex Mono** — machine/data: all numeric values, tickers, status tags, metadata,
uppercase micro-labels, API paths, source tags, captions.

### Scale (px, desktop)
| Role | Family / weight | Size | Notes |
|---|---|---|---|
| Page title (`h1`) | Hanken 800 | 38 | letter-spacing −0.02em, line-height 1 |
| Company/section name | Hanken 800 | 20–28 | letter-spacing −0.015em |
| Card / metric name | Hanken 600 | 13–15 | line-height 1.25 |
| Big numeric value | Plex Mono 600 | 16–28 | `font-variant-numeric: tabular-nums`, ls −0.01em |
| Total value | Plex Mono 700 | 18 | accent-deep `#264C77` |
| Body copy | Hanken 400 | 13–15 | color ink-muted, line-height 1.5 |
| Eyebrow | Plex Mono 600 | 11 | uppercase, ls 0.18em, accent |
| Micro-label | Plex Mono 400/600 | 8.5–10 | uppercase, ls 0.12–0.16em, ink-faint |
| Status tag / badge | Plex Mono 600 | 8.5–9 | uppercase, ls 0.06–0.08em |
| Caption / footnote | Plex Mono 400 | 9.5–11 | ink-faint |

**Numbers are always tabular** (`font-variant-numeric: tabular-nums`) so columns and
stacked values align. Negatives use accounting parentheses in the Explorer table
(`($108.5B)`); the minus glyph `−` (U+2212) is acceptable for growth deltas.

---

## 3. Layout & spacing

- **Centered single column.** Max-width by density: 1020px (Explorer), 1120px
  (Fundamentals), 1180px (Compare). Page padding `40px 24px 72px`.
- **Masthead is fixed furniture** on every page (see §5) — do not redesign it per page.
- Section rhythm: ~26–40px between major sections. Card grids use `gap:16px`.
- **Always flex/grid + `gap`** for any group of siblings (chips, cards, meta rows, cells).
  Never rely on inline-block whitespace.
- Radii are tight: **2–3px** everywhere. No pill-rounded cards, no big radii.
- Fixed label columns: 88px (Explorer query rows), 236px (Compare sticky metric column).

---

## 4. Signature treatments (the things that make it "Profin")

1. **Dotted paper background** on the page root:
   `background:#EDE4D0; background-image:radial-gradient(#E4D9C0 0.6px, transparent 0.6px); background-size:22px 22px;`
2. **Double masthead rule:** a `2.5px solid #221F18` line, then a `1px solid #BCAC89` line
   3px below it. This is the ledger signature — repeat it verbatim at the top of every page.
3. **Hard offset shadow** (§1) — never `blur`. Cards look like stacked paper.
4. **Section headers:** mono number (`01`, accent) + Hanken 800 name + a `2px solid #221F18`
   underline, with the same thin `#BCAC89` hairline 3px beneath.
5. **Segmented controls / pills:** 1.5px ink border, 2px radius; active = accent fill on
   `#F4EEDF`-to-accent, inactive = transparent/`#F4EEDF` with mid-grey border.
6. **Inverse primary button:** `#221F18` fill, `#EDE4D0` text, mono uppercase label.
7. `::selection { background:#2F5B8F; color:#F4EEDF; }`

---

## 5. Standard page shell (copy this skeleton)

Every page opens with the same masthead and closes with the same footer:

- **Masthead:** mono eyebrow "Profin — SEC …, normalized" (accent) → Hanken 800 `h1`
  page title → right-aligned mono "as-of / basis" caption → **double rule**.
- **Footer:** thin `#BCAC89` top rule → 1–2 mono accent links (real routes, see the
  handoff prompt — `/docs`, `/explorer`, `/fundamentals`, etc., each with a `↗`) →
  muted tagline "Profin · public SEC data, cleaned & queryable".

Links: accent color, no underline, a `1px solid #B9C6D6` bottom border instead, `↗` for
external/route jumps. Resolve every href to a real destination — never leave placeholders.

---

## 6. Components inventory (reuse, don't reinvent)

- **Status chip / marker** — §7. Present on every metric, value, and cell.
- **Metric card** — name + status chip header; big mono value + basis tag; optional inline
  caveat note (left terracotta-ish rule); peer-rank bar; 8Q sparkline; "Show your work"
  expander. Resting = `#EDE3CD` no shadow; expanded/active = `#F4EEDF` + offset shadow +
  ink border.
- **Metric matrix** (Compare) — sticky 236px metric column, company columns min 196px,
  horizontal scroll, collapsible category groups, per-cell status + position bar,
  full-width provenance expansion keyed on the metric row.
- **Ticker chip** — mono, `#221F18` fill, `#F4EEDF` text, 2px radius. The company identity
  token; used in headers and hero cards.
- **Sparkline** — inline SVG polyline, `#2F5B8F` 1.5px stroke, self-scaling to its series
  min/max, last point dotted. ~8 quarters. Hidden (with a mono "no series" note) when the
  value is N/A or N/M.
- **Peer-rank / position bar** — `#E4DAC2` track, `#264C77` 3px marker. **Descriptive
  only** (see §9). Excludes N/A and N/M.
- **Provenance / "Show your work"** — §8.
- **Loading state** — pulsing accent dot + status line + shimmer bars + cold-path note.
- **Empty vs 404** — visually distinct; empty is calm ("filing on record, no mapped
  fields"), 404 is a mono `HTTP 404` in terracotta with recovery chips.
- **Disclosure / data-notes** — dashed `#BCAC89` container, `+`/`−` toggle, honesty copy.

---

## 7. Status vocabulary (LOAD-BEARING — every data point carries one)

Four statuses, distinguishable by **glyph + label + border style**, never by color alone
(accessibility + honesty). Chip = mono, 8.5–9px, uppercase, 2px radius.

| Status | Glyph | Tag | Meaning | Chip style |
|---|---|---|---|---|
| OK | `●` | OK | Trustworthy value | text ink-faint, transparent bg, `1px solid #C9BB98` |
| Approximate | `≈` | APPROX | Shown, but flagged imprecise | text/`#B15E3C`, bg `#F0DDD1`, border `#E3C4B4` |
| Not applicable | `∅` | N/A | Structurally meaningless for this industry | text ink-soft, bg `#E4DAC2`, `1.5px solid #BCAC89` |
| Not meaningful | `~` | N/M | Computable but would mislead | text ink-soft, transparent, `1.5px dashed #8A8069` |

Rules:
- **N/A and N/M are never rendered as 0, blank, or an invented number.** Show the token
  (`N/A` / `N/M`) in drained grey `#B0A588`, with a one-line sub-reason and full reason in
  provenance.
- **APPROX still shows the value** with the `≈` marker inline — the number is useful, the
  caveat rides alongside it.
- Solid border = N/A (hard structural), dashed border = N/M (soft judgment). Keep that
  distinction.
- A legend explaining all four appears near the top of any page that shows metrics.

---

## 8. Provenance / "Show your work" (mandatory for derived numbers)

Any computed/derived figure must be able to explain itself via progressive disclosure.
The Explorer uses it for the raw-XBRL-tag → clean-field mapping; the metric pages use it
for formula + basis + flag reason. A "Show your work" / "Show provenance" toggle (mono,
accent-on when open) reveals:
- **Formula** — mono, plain-language (`Gross profit ÷ Revenue`).
- **Source basis** — the exact filing basis per company (TTM vs as-of, filing date,
  accession where relevant). Surface fiscal-calendar mismatches here.
- **Why {flag}** — for any APPROX/N/A/N/M, the specific reason in human copy.

Provenance is closed by default, opens in place, and never blocks the primary read.

Related: **basis is always labelled** — income & cash-flow metrics are **TTM**,
balance-sheet metrics are **as-of** a date. Tag every value (`TTM` / `AS-OF`) and never
mix bases silently.

---

## 9. Honesty conventions (product rules, enforce in every page)

These are the reason the product exists. A page that violates them is broken.

1. **Never fabricate precision.** No zeros-as-missing, no blanks, no made-up numbers.
   Missing/again-inapplicable → the right status token, always.
2. **Descriptive, never prescriptive.** Peer ranks and position bars describe *where* a
   value sits, not whether it's good. **Never color a metric good/bad**, never pick a
   "winner" in a comparison, never rank companies overall. Accent-blue is for
   interaction/emphasis and terracotta is for caveats — neither is a verdict.
3. **Comparability is explicit.** Rankings exclude N/A and N/M. A close gap between an
   APPROX value and a clean one is not a trustworthy head-to-head — say so.
4. **Alignment is surfaced, not hidden.** Different fiscal calendars, filing lag, and
   TTM-vs-as-of are shown in headers/banners, not silently reconciled.
5. **Approximations are honest, not buried.** If we show it, we flag it, and we explain
   why in provenance.
6. **Industry grouping is approximate** and labelled as such wherever peer context appears.
7. **Data is as-of the latest filing — not real-time.** State it in the masthead caption.
8. **Nothing here is investment advice.** The disclosure block should say so plainly.

---

## 10. Anti-patterns (do NOT do these)

- New colors, gradients, blurred/soft shadows, or big rounded corners.
- Color-coding metrics green/red for good/bad, or ranking companies overall.
- Rendering a missing/inapplicable value as `0`, `—`, blank, or a guess.
- Dropping the status chip, the basis tag, or the provenance affordance on a derived number.
- Emoji, decorative icons, or hand-drawn SVG imagery (sparklines/position bars are the only
  generated graphics; keep them literal and data-driven).
- Inter/Roboto/Arial substitutes for the two chosen families.
- Inline-block whitespace layout instead of flex/grid `gap`.
- Placeholder links. Every href resolves to a real route.

---

## 11. Reference implementations

Three built screens embody everything above — read them before starting a new page:
- `Profin Data Explorer.dc.html` — query flow, loading/404/empty states, raw→clean audit.
- `Company Fundamentals.dc.html` — single-company metric cards, status system, provenance.
- `Company Comparison.dc.html` — 2–3 company matrix, per-cell status, alignment surfacing.

New pages are built as Design Components in the same manner. Match these files' tokens,
type, spacing, and — above all — their honesty conventions.
