# Implementation — Company view prototype-fidelity pass

**Frontend-only** (per `2-architecture.md`). Branch: **`company-fidelity`** (off `master`). Uncommitted.

## Frontend (Senior Frontend Engineer) — DONE

All in `sectorapp.js` + `sectorapp.css` (+ `headless_check.js`); no backend. Company view stays
color-free; every synthetic prototype element is an honest placeholder/omission — never fabricated.

- **`sectorapp.js`**
  - State: `focalTicker`, `defaultFocalTried`, `coCompOpen`.
  - **`resolveDefaultFocal()`** — largest sector by `peer_count`, **falling through to the next-largest
    sector that actually returns companies** (a sector can be scored but have no per-company metrics),
    then first-alpha → `selectFocalCik` + `ensureCompanyData`; honest empty state on no-resolve.
    Triggered from `setView("company")` and `init()` (only when no `?symbol=`; `?symbol=` wins).
  - **`focalTicker`** set **only** from a ticker search (`selectFocal`); cleared on `selectFocalCik`
    (dot-click / dropdown / default). **Never derived.**
  - **`coHead()`** rebuilt: `sector › [name <select> of SIC peers] [ticker pill?] · [context pill]
    [FY basis]`. `focalPeerList()` supplies the dropdown (de-duped, name-sorted) from the loaded
    `coValues`. Context pill = "N peers · SIC {group}" (real count); basis = `focalYear()`.
  - **`renderCompanyView`** — "Peer distribution" heading + "Click any peer dot…" affordance line.
  - **`coRailHtml`** composite — keeps the real derived percentile + "not a ranked position"; adds a
    **"trend — to be defined"** placeholder and a `#coCompBtn` that toggles a per-theme-percentile
    decomposition (`coCompOpen`).
  - **`wireCompanyView`** — `#coFocalSel` change → `selectFocalCik`; `#coCompBtn` → toggle decompose.
- **`sectorapp.css`** — header (`.pa-co-crumbwrap`/`.pa-co-headright`), `.pa-co-sel` (dropdown name),
  `.pa-co-ticker` (dark pill), `.pa-co-ctx`/`.pa-co-basis`, `.pa-co-sech` (heading), `.pa-co-afford`,
  composite `.pa-co-comp-val` (button), `.pa-co-comp-decomp`, `.pa-co-comp-trend.pa-ph`; mobile wraps.
- **`headless_check.js`** — `sectorapp-company-empty` → `sectorapp-company-default` (now populated);
  the `sectorapp-company` shot clicks `#coCompBtn` (decompose).

### Verified
- `pytest` **511 passed, 6 skipped**; Company view color-free (grep); `focalTicker` only from search.
- e2e **PASS errors=0** (after the default-focal fall-through fix — see `4-qa.md`); eyeballed the
  default-populated view, header pills, composite trend placeholder, and mobile.
