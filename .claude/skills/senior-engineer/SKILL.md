---
name: senior-engineer
description: Stage 3 of the delivery pipeline (docs/delivery/README.md) — the Senior Engineer role, now split into two sub-specialties. Dispatches to senior-backend-engineer (Python/API — sec/, ingest/, normalize/, storage/, api/) and senior-frontend-engineer (the static/ UI). Invoke this when unsure which to use, or read it to route; invoke a sub-specialty directly when the task is clearly one side.
---

# Senior Engineer (stage 3 — two sub-specialties)

The Senior Engineer role — implement the architect's plan as correct, conventional, tested code and
verify it before handoff — is split into two sub-specialties. Pick by what the architecture plan
(stage 2) actually changes:

- **`senior-backend-engineer`** — the Python/API half: `sec/`, `ingest/`, `normalize/`, `storage/`,
  `api/` (routes + wiring), `analytical/`, `config.py`. Owns the repo conventions (CIK-as-int, raw
  units + provenance, mapping-over-hardcoding, DB-behind-interface, no raw SQL in the API, SEC
  compliance, DuckDB batch-only). Test gate: `pytest` via `docker compose --profile test run --rm test`.
- **`senior-frontend-engineer`** — the UI half: `src/secfin/api/static/` (`app.js` shared
  components, `company.js`, `manager.js`, pages, CSS, `vendor/`). Owns the STYLE_GUIDE, the
  status/provenance affordances, self-contained (CSP) assets, theme-awareness, and never-render-0.
  Test gate: the Docker e2e headless render check + eyeballing screenshots.

## How to route

- **Backend-only change** (new/changed endpoint, repository, normalization, ingest) →
  `senior-backend-engineer`, then hand to QA.
- **Frontend-only change** (chart, layout, copy, an existing endpoint's rendering) →
  `senior-frontend-engineer`, then hand to QA.
- **Full-stack change** (a new endpoint *and* its UI, like most tab features) → **one branch**,
  `senior-backend-engineer` first (land the endpoint + its `pytest` coverage and the JSON
  contract), then `senior-frontend-engineer` on the same branch (consume that contract, verify with
  e2e). One combined handoff to QA.

## Shared rules (both sub-specialties)

- **Branch off `master`**, one change per branch; a full-stack change shares one branch across both.
- **Data honesty is the brand:** derived numbers carry status + provenance; a missing/inapplicable
  value is **N/A, never `0`**; 13F deltas stay **derived**, never "reported trades."
- Build/run/test via **Docker** (no host pip/venv); rebuild the `api` image after any `src/` change.
- Commit and push **only when asked** (end messages with the `Co-Authored-By` line). Neither
  sub-specialty deploys — that's the operator-gated DevOps role.

See each sub-specialty's SKILL for its full read-first list, conventions, and verification steps.
QA (`/qa-tester`) fails backward to whichever sub-specialty owns the defect.
