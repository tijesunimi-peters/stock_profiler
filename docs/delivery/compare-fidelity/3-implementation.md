# Implementation — Compare view prototype-fidelity pass

**Frontend-only.** Branch: **`compare-fidelity`** (off `master`). Uncommitted.

## Frontend (Senior Frontend Engineer) — DONE

`sectorapp.js` + `sectorapp.css`; no backend, no new data (Compare is all real → no placeholders).

- **`cmpHead(A, B)`** — the prototype A/B header: accent swatch + A name · "vs" · blue swatch + B
  name · spacer · counts ("N vs M filers" via new `sectorPeerCount`; "—" if unknown, never faked).
  Replaces the "01 Sector compare" section head.
- **`cmpThemesHtml`** — rows wrapped in `.pa-cmp-scorecard` (bg-card + shadow) with a "Composite
  scores · shared 0–100 scale" label; provisional note kept below.
- **`cmpScoreRow` / `cmpNotScoredRow`** — restructured to the prototype `170px 1fr 84px` grid:
  theme name · `.pa-cmp-bars` (the two `cmpBar` lines) · gap. Dropped the extra not-scored reason
  sub-line (single-line rows).
- **`cmpMetricsHtml`** — unchanged markup; CSS only.
- **CSS** — `.pa-cmp-head2`/`.pa-cmp-sw`/`.pa-cmp-aname`/`.pa-cmp-vs`/`.pa-cmp-counts`;
  `.pa-cmp-scorecard`; `.pa-cmp-row` grid `170px 1fr 84px` + `.pa-cmp-bars`; `.pa-cmp-cards` →
  `auto-fit minmax(280px,1fr)`; `.pa-cmp-card` → `--bg-tint`; mobile reflow (row → `1fr auto`, bars
  full-width). Dropdowns kept.

### Verified
- `node --check` clean; no favorability tokens in Compare; `pytest` 511/6.
- e2e **PASS errors=0**; scripted driving **13/13**; eyeballed `sectorapp-compare.png` + mobile.
