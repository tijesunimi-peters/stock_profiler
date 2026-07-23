# Implementation — Qualitative view prototype-fidelity pass

**Frontend-only.** Branch: **`qual-fidelity`** (off `master`). Uncommitted.

## Frontend (Senior Frontend Engineer) — DONE

`renderQualView` rebuilt in `sectorapp.js` + `.pa-qual-*` layout in `sectorapp.css`. Static; no fetch/
state/interaction; **no data** — every cell is an honest placeholder.

- Keep the honest base: section head + subhead + the **Track-2 banner** (why + "nothing here is
  fabricated") + the closing foot line. The "planned category cards" (Phase 4) are replaced by the
  prototype layout.
- `QUAL_THEMES` (7 real theme labels, hardcoded to avoid init-order coupling with CO_THEMES),
  `QUAL_SIDE` (3 cards), `QUAL_MATRIX_COLS` (5 headers).
- **`3fr 2fr` grid:** left "Risk-factor themes" card = 7 rows (`1fr 130px 74px`: theme name · empty
  `.pa-qual-rtbar` + "—" · "planned" chip) + a Track-2 footer note; right column = 3 cards (heading +
  "—" + a "to be defined · no filers shown" body).
- **Per-filer signals matrix** = column headers (`2fr 1fr 1fr 1fr 1fr`) + a placeholder body ("no
  filers shown; nothing here is fabricated"). No rows.
- CSS: `.pa-qual-cols`, `.pa-qual-rt/rtrow/rtname/rtmid/rtbar(empty dashed, no fill)/rtfoot`,
  `.pa-qual-sidecard`, `.pa-qual-phbody/phtag`, `.pa-qual-matrix/mhead/mcol/mbody`; mobile reflow.

### Verified
- `node --check` clean; no favorability tokens; no fabricated data in `renderQualView` (grep).
- `pytest` 511/6; e2e **PASS errors=0**; scripted driving **9/9** (incl. honesty landmine); eyeballed
  desktop + mobile.
