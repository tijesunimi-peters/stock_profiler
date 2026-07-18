# Delivery pipeline (ways of working)

How a feature or change moves from idea to production on secfin / ClearyFi. Five roles,
each a skill in `.claude/skills/`, run in sequence. Every role is grounded in the
engineering source of truth — **`CLAUDE.md`** (scope, architecture, conventions,
guardrails) — plus the role-specific docs its skill names.

```
Product Manager  →  Principal Architect  →  Senior Engineer  →  QA Tester  →  DevOps Engineer
  brief               design / plan          code + tests        verified      deploy (gated)
 /product-manager    /principal-architect    /senior-engineer    /qa-tester    /devops-engineer
```

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
| 3 | Senior Engineer | `senior-engineer` | the plan | code + tests on a branch, self-verified |
| 4 | QA Tester | `qa-tester` | the branch + the brief | QA report: pass/fail per acceptance criterion + evidence |
| 5 | DevOps Engineer | `devops-engineer` | a QA-passed change | deployment — **only after operator confirmation** |

## Hard gates (never bypass)

1. **Scope gate (stages 1–2).** Track 1 only (structured numeric SEC data). If a task
   drifts toward Track 2 (free-text / LLM summarization) or cross-company screening ahead
   of its milestone, or implies price/market data — **STOP and flag it**; do not design or
   build it. See `CLAUDE.md` § "Scope".
2. **Deployment gate (stage 5).** The DevOps role **deploys only after explicit
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
  (`1-brief.md`, `2-architecture.md`, `3-implementation.md`, `4-qa.md`, `5-deploy.md`) so
  the trail survives the conversation.
- **A stage starts by reading the previous stage's artifact.** If it is missing or thin,
  ask for it rather than guessing — don't skip a stage.

Roles hand *forward* on success and *backward* on failure (QA that fails returns the work
to the engineer; it does not advance to DevOps).
