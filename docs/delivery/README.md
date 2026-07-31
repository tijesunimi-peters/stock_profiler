# Delivery pipeline (ways of working)

How a feature or change moves from idea to production on secfin / ClearyFi. Five roles,
each a skill in `.claude/skills/`, run in sequence. Every role is grounded in the
engineering source of truth — **`CLAUDE.md`** (scope, architecture, conventions,
guardrails) — plus the role-specific docs its skill names.

```
Product Manager  →  Principal Architect  →  Senior Engineer  →  QA Tester  →  DevOps Engineer
  brief               design / plan          code + tests        verified      deploy (gated)
 /product-manager    /principal-architect    /senior-engineer    /qa-tester    /devops-engineer
                                              ├─ /senior-backend-engineer  (Python / API)
                                              └─ /senior-frontend-engineer (static/ UI)
```

Stage 3 (Senior Engineer) has **two sub-specialties**: `senior-backend-engineer` (`sec/`,
`ingest/`, `normalize/`, `storage/`, `api/`) and `senior-frontend-engineer` (`api/static/`). Invoke
the one the architecture plan calls for; for a full-stack feature, run backend first (endpoint +
`pytest`), then frontend (consume it + e2e) **on the same branch**. `/senior-engineer` is the
umbrella — read it to route, or invoke a sub-specialty directly when the side is obvious.

## How to use it

You are the conductor. The roles do **not** auto-advance — you invoke each one when you're
satisfied with the previous handoff, so every stage boundary is a review checkpoint you control.

**Automated option — `/deliver <request>`.** To run the four build stages end to end in one pass
(PM → architect → engineer → QA) without invoking each role by hand, use `/deliver`. A new run
(`/deliver <request>`) starts at the PM and needs a `/clear`ed or `/compact`ed context; it tracks
progress in `docs/delivery/_active.md`, so **`/deliver` (or `/deliver resume`) continues the active
task from wherever it stopped — even in a fresh session with no prior context** (it rebuilds context
from the state file + the stage handoff docs; resuming needs no reset). It runs the stages
sequentially in one context, loops a QA failure back to the owning engineer (≤3 cycles), and stops
at the QA gate — then pauses for the operator to hand-run the manual-verification questionnaire
(`4b-manual-verification.md`) before the task is marked done. It never commits, pushes, or deploys,
and still pauses for genuine operator decisions and scope-gate flags. Use the manual flow below when
you want a checkpoint at every stage boundary.

1. **Reset, then start.** `/clear` (new task) or `/compact` (keep a related thread), then
   `/product-manager <your request>`. Only this first step needs the reset.
2. **Advance one role at a time.** When a stage hands off, invoke the next slash command —
   `/principal-architect`, then `/senior-engineer`, then `/qa-tester`, then `/devops-engineer`.
   You don't need to re-explain the task; the context carries forward within the task.
3. **Don't `/clear` between roles** — only at the top of a task. Downstream roles need the
   accumulated context to read the prior stage's handoff.
4. **Let the gates hold.** The PM/architect will stop and flag anything out of Track‑1 scope;
   the DevOps role will present a deploy plan and wait for your explicit "yes, deploy."
5. **QA fails backward.** A failing QA report returns the work to the Senior Engineer — the
   `senior-backend-engineer` or `senior-frontend-engineer` that owns the defect — re-run that role
   to fix, then `/qa-tester` again. It never advances broken work to DevOps.

### Worked example

```
/clear
/product-manager  let managers on the institutional tab be filtered by minimum % ownership
      → brief + acceptance criteria; asks whether the threshold is a preset or free input
/principal-architect
      → plan: frontend-only filter on holderOwnershipPanels, no API change
/senior-frontend-engineer            (frontend-only → the frontend sub-specialty directly)
      → implements on a branch; e2e green + screenshots eyeballed; self-verified
/qa-tester
      → checks each criterion, screenshots, PASS → "ready to deploy"
/devops-engineer
      → shows the deploy plan, waits …  you reply "yes, deploy"  → deploys + verify_deployment.py
```

You can also stop after any stage (e.g. run only `/product-manager` and `/principal-architect`
to produce a spec + design without building), or invoke a single role directly for a one-off —
the sequence is the default, not a cage.

## Starting a task: reset context first

**Every task begins by clearing or compacting context, then invoking the Product Manager.**
The PM must scope from the request and the docs — not from a previous task's residual
assumptions, decisions, or code (that is how scope creep and stale constraints leak in).

- New, unrelated task → **`/clear`**.
- Continuation of a long thread you need to keep → **`/compact`**.

Only the PM stage resets. The downstream roles (architect → engineer → QA → DevOps) then run
in that same task-scoped context, each reading the prior stage's handoff — do **not** clear
between them, or the handoff is lost.

## Stages

| # | Role | Skill | Input | Output artifact |
|---|------|-------|-------|-----------------|
| 1 | Product Manager | `product-manager` | a request / idea | product brief: problem, users, scope, acceptance criteria, out-of-scope |
| 2 | Principal Architect | `principal-architect` | the brief | technical design + ordered implementation plan |
| 3 | Senior Engineer | `senior-engineer` → `senior-backend-engineer` / `senior-frontend-engineer` | the plan | code + tests on a branch, self-verified |
| 4 | QA Tester | `qa-tester` | the branch + the brief | QA report (`4-qa.md`) + **operator manual-verification questionnaire** (`4b-manual-verification.md`) |
| 4b | Operator interactive acceptance | (operator walks `4b-manual-verification.md`, interactively) | the QA-passed branch | operator acceptance (Confirmed / accepted at QA-tester level / defect) recorded in the questionnaire |
| 5 | DevOps Engineer | `devops-engineer` | a QA-passed **and operator-verified** change | deployment — **only after operator confirmation** |

## Hard gates (never bypass)

1. **Scope gate (stages 1–2).** Track 1 only (structured numeric SEC data). If a task
   drifts toward Track 2 (free-text / LLM summarization) or cross-company screening ahead
   of its milestone, or implies price/market data — **STOP and flag it**; do not design or
   build it. See `CLAUDE.md` § "Scope".
2. **Interactive-acceptance gate (stage 4→4b) — MANDATORY, no exceptions bar backend-only.**
   After a green QA report, the QA stage emits an operator-fillable questionnaire
   (`4b-manual-verification.md`) — the operator's **interactive acceptance** of the
   qa-tester-reported change. The change **pauses for the operator to walk the checks
   (interactively — e.g. batched `AskUserQuestion`) and sign off** before it can advance; QA's own
   evidence is never the acceptance.

   **Operator policy, 2026-07-31:** this is **blocking for every change with a rendered surface** —
   layout-only, CSS-only, copy-only and placeholder changes included. The earlier rule that let
   those be "accepted at the QA-tester level" **has been removed**, and the only sign-off outcomes
   are **Confirmed** or **Defect found**. The single exception is a backend-only change with no
   rendered surface, which must still be stated in the report rather than skipped silently. A defect
   found here loops back to the owning engineer.

   *Why it hardened:* the gate keeps catching what the scripts pass over — the `company-fidelity`
   dead-end recovery bug, and V3-P5a's overlap-`⤡ Expand` defect, which 71 green driven assertions
   missed.
3. **Deployment gate (stage 5).** The DevOps role **deploys only after explicit
   confirmation from the operator, every time.** No auto-deploy, no "while I'm here." It
   never buys or provisions paid resources (domains, droplets, services) — those are the
   operator's.

## Shared guardrails (all roles)

- **SEC compliance is non-negotiable**: a descriptive `User-Agent` and the process-wide
  rate limit stay. Never weaken them to "go faster."
- **Data honesty is a product feature**: the status vocabulary + the provenance /
  "show your work" pattern ride on every derived number; a missing value is never rendered
  as `0`. 13F "buy/sell" is DERIVED by diffing quarter-end snapshots (`normalize/flows.py`),
  never reported trades — carry the long-only / ~45-day-lag caveats.
- **Dev/test run in Docker** (this host has no local pip/venv): `docker compose --profile
  test` and `--profile e2e`; rebuild the image after source changes (it bakes in `src/`).
- **Architecture invariants**: DB stays behind its repository interface; no raw SQL in the
  API; extend the mapping table (`normalize/mapping.py`) rather than hard-coding fixes;
  DuckDB is batch/analytical only, never on the live request path; single-process is a
  deliberate constraint (no `--workers`).
- **Public-facing copy** additionally loads `.claude/skills/marketing-guardrails`.

## Handoff convention

- **Small tasks**: hand off inline — end the turn with a short **Handoff** block stating
  what you produced, open questions / decisions, and which role is next.
- **Substantial tasks**: write the artifact to `docs/delivery/<task-slug>/<n>-<role>.md`
  (`1-brief.md`, `2-architecture.md`, `3-implementation.md`, `4-qa.md`,
  `4b-manual-verification.md`, `5-deploy.md`) so the trail survives the conversation.
- **A stage starts by reading the previous stage's artifact.** If it is missing or thin,
  ask for it rather than guessing — don't skip a stage.

Roles hand *forward* on success and *backward* on failure (QA that fails returns the work
to the engineer; it does not advance to DevOps).
