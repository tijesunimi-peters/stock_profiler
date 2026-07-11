---
name: launch-parallel
description: Parallel work mode for launch readiness — spawns the four track agents (launch-code, launch-data, launch-writing, launch-infra) as background subagents, coordinates file ownership, monitors progress, and converges results into docs/product/LAUNCH_READINESS.md. Invoke as /launch-parallel [tracks], e.g. "/launch-parallel" (all runnable tracks) or "/launch-parallel data writing".
---

# /launch-parallel — parallel launch-readiness mode

You are the orchestrator. The work itself is done by the four track agents defined in
`.claude/agents/` (launch-code, launch-data, launch-writing, launch-infra); your job
is dispatch, monitoring, integration, and escalation. Do not do a track's work inline
while its agent runs.

## Before dispatch

1. Read `docs/product/LAUNCH_READINESS.md` and each `docs/product/tracks/*.md` that
   exists — a previous run may have partially completed items. Never re-dispatch work
   already marked done.
2. Check dispatch preconditions:
   - **data** needs Docker up and a real `SEC_USER_AGENT` in `.env` — verify before
     spawning; this track makes hours of real SEC requests.
   - **code**'s pricing item needs `docs/product/PRICING.md`; if absent, tell the
     agent to do revocation only (its definition already handles this — just don't
     expect pricing work back).
   - **writing** and **infra** have no preconditions.
3. If the user named tracks in the arguments, dispatch only those.

## Dispatch

Spawn each runnable track as a **background** Agent with `subagent_type` set to the
track's agent name. Isolation comes from each agent's own definition (code, writing,
infra get worktrees; data runs against the live volume — never give it a worktree).
The prompt for each: point at its LAUNCH_READINESS.md section, list any items already
done per the tracks notes, and state its file-ownership lane (below).

**File-ownership map (enforce in prompts; it prevents merge conflicts):**

| Track | Owns | Must not touch |
|---|---|---|
| code | `src/secfin/` (except `api/static/`), `tests/`, `docs/product/tracks/code.md` | static pages, ingest runs, other tracks' notes |
| data | live DB via Docker, `docs/product/tracks/data.md` | ALL source code |
| writing | `src/secfin/api/static/`, page routes in `api/main.py`, `docs/product/drafts/`, `docs/product/tracks/writing.md` | everything else in `src/` |
| infra | `deploy/` (new), `docs/DEPLOYMENT.md`, `scripts/verify_deployment.py`, `docker-compose.yml`, `docs/product/tracks/infra.md` | application source, tiers |

`docs/product/LAUNCH_READINESS.md` is owned by YOU, the orchestrator — agents report
in their track notes; only you flip checkboxes.

## While agents run

- You'll be notified as each completes; use SendMessage for follow-ups to a running
  agent rather than respawning (respawns lose context).
- Long waits (the data track runs for hours): don't poll — handle other completions
  as they arrive, and give the user a consolidated status when asked.

## Convergence (after tracks complete)

1. Read each agent's final report and track notes. Verify the load-bearing claims
   yourself (run the tests via Docker, curl the endpoints the data track seeded) —
   trust but verify before flipping any checkbox.
2. Update `LAUNCH_READINESS.md`: check completed items with date + one-line evidence,
   ROADMAP.md-style.
3. Merge worktree branches (code, writing, infra) — resolve honestly; the ownership
   map should make conflicts rare. Run the full test suite via Docker after merging.
4. Produce the escalation list: every item agents flagged as needing the user
   (price-point decision, Stripe account, domain, VPS, legal review, env secrets),
   deduplicated and ordered. Present it clearly — these are now the critical path.
5. The convergence-phase verifications that need a deployed host (timed stranger
   test, external signup test, spike re-check) stay unchecked until the operator
   provides one; say so rather than marking them done.

## Standing rules

- All repo guardrails and `marketing-guardrails` compliance rules bind every track.
- Commits happen on track branches; merging to master happens in convergence, with
  the user's awareness. Never let two agents write the same file.
- If a track fails or stalls, report what it completed (its notes file survives),
  fix the blocker, and re-dispatch that track alone.
