---
name: deliver
description: Run the delivery pipeline (Product Manager → Principal Architect → Senior Engineer backend/frontend → QA Tester) end to end in one pass, OR resume it mid-pipeline. Tracks the active task and its progress in docs/delivery/_active.md, so it can resume from any stage — even in a fresh session with no prior context — by reading that state file plus the completed stage handoffs. Sequential and context-sharing (not parallel subagents); loops a QA failure back to the owning engineer until green; stops at the QA gate. Invoke as "/deliver <request>" to start, or "/deliver" / "/deliver resume" to continue the active task. Never commits, pushes, or deploys.
---

# /deliver — run (or resume) the delivery pipeline end to end

Orchestrates the four **build** stages of the delivery pipeline (`docs/delivery/README.md`) in one
pass, in a single task-scoped context:

```
Product Manager → Principal Architect → Senior Engineer(s) → QA Tester
 /product-manager   /principal-architect   /senior-*-engineer   /qa-tester
```

You are the orchestrator. You invoke each stage skill **in-context** (via the `Skill` tool), follow
its instructions to produce that stage's handoff doc, update the state file, then invoke the next
stage — which reads the prior handoff from the shared context (or, on a resume, from disk). The run
is **sequential and context-sharing** (not parallel subagents like `launch-parallel`): downstream
stages need the accumulated context, so do not spawn cold subagents and do not clear between stages.

## The state file — `docs/delivery/_active.md`

The single source of truth for what's being worked on and how far it's got. `/deliver` **reads it
first** on every invocation and **rewrites it after every stage transition**. Because the brief,
design, and handoffs are durable docs, this file + those docs let `/deliver` resume **with no prior
conversation context**.

Format (overwrite in full each update):

```markdown
# Active delivery task
task_slug: <kebab-slug>          # also the docs/delivery/<slug>/ folder
request: <the original one-line request>
branch: <branch name | "not yet branched">
next_stage: <pm | architect | backend | frontend | qa | done | blocked>
qa_cycles: <int>                 # fix→QA loops used so far (cap 3)
updated: <YYYY-MM-DD>

## Progress
- [x] 1 Product Manager       -> 1-brief.md
- [x] 2 Principal Architect   -> 2-architecture.md
- [ ] 3 Backend  (full-stack: backend then frontend; else the one side that applies)
- [ ] 3 Frontend
- [ ] 4 QA Tester             -> 4-qa.md

## Notes / open loops
<e.g. "QA failed AC-3 (N/A shown as 0) — back to frontend, cycle 1"; or
 "BLOCKED: awaiting operator decision on Sankey vs Plot-native flow view">
```

When a task reaches `next_stage: done`, leave the file as the record of the last completed task (a
new `/deliver <request>` overwrites it — see the guard below). Not auto-committed (commit is
operator-gated); it lives in the working tree and survives session boundaries on disk.

## On every invocation: start or resume

1. **Read `docs/delivery/_active.md`** (if it exists) and the argument.
2. Decide:
   - **A new request was given** (`/deliver <request>`): if the state file shows an **unfinished**
     task (`next_stage` ≠ `done`), STOP and ask the operator whether to abandon it before
     overwriting — don't silently discard in-flight work. Otherwise start fresh at the **PM** stage
     and create the state file. A new run's PM stage still needs a clean context (see below).
   - **No request, or `resume`** (`/deliver` / `/deliver resume`): **resume the active task** from
     `next_stage`. First **reconstruct context from disk** — read the state file and the completed
     stage docs in `docs/delivery/<slug>/` (`1-brief.md`, `2-architecture.md`, `3-implementation.md`,
     `4-qa.md` as far as they exist) — then continue from `next_stage`. Do **not** require the
     operator to re-explain the task.
   - **Resume with a stage override** (`/deliver resume from architect`, `/deliver from qa`): resume
     as above but jump to the named stage (re-reading the docs it depends on).
3. **Context reset applies only to a NEW run's PM stage.** A fresh `/deliver <request>` begins with
   the PM, which must scope from a clean context — if this session still holds another task's
   context, STOP and ask the operator to `/clear` or `/compact` first. A **resume** does NOT need a
   reset (it rebuilds context from the state file + docs) — that's the whole point.

## The run (each stage: do the work, then update `_active.md`)

1. **Product Manager** — `Skill: product-manager` with the request → write `1-brief.md` (problem/user,
   scope + out-of-scope, testable acceptance criteria incl. honesty rules, risks/open decisions).
   **Scope gate:** Track-2 / out-of-scope → STOP, surface the in-scope alternative. Then set
   `next_stage: architect`.
2. **Principal Architect** — `Skill: principal-architect` → `2-architecture.md` (files per stage,
   which engineer sub-specialty owns each, criteria → concrete checks). Re-flag scope drift (STOP if
   Track 2 / new base dep / weakened SEC compliance). Set `next_stage` to `backend` or `frontend`
   (full-stack → `backend`, and record in Progress that frontend follows).
3. **Senior Engineer(s)** — branch off `master` (record the `branch` in the state file); route by the
   architecture:
   - backend-only → `Skill: senior-backend-engineer`; frontend-only → `Skill: senior-frontend-engineer`;
   - **full-stack → backend FIRST** (endpoint + `pytest` + JSON contract), then **frontend** (consume
     it + e2e) on the **same branch**. After backend, set `next_stage: frontend`; after the last
     engineer stage, set `next_stage: qa`. Each self-verifies via Docker before handing off.
4. **QA Tester** — `Skill: qa-tester` → `4-qa.md`: verify each acceptance criterion (`pytest`, e2e,
   drive the real flow, honesty contract). On **pass** → `next_stage: done`. On **fail** → see below.

## QA failure → loop back (bounded)

Hand back to the **owning** sub-specialty — `senior-backend-engineer` (API/data/logic) or
`senior-frontend-engineer` (rendering/copy/layout) — with the failing criteria + repro, fix, and
re-run **QA** (not the whole pipeline). Set `next_stage` to that side, bump `qa_cycles`, and note the
failing criteria. Repeat until green, **up to 3 fix→QA cycles**. If still red after 3, set
`next_stage: blocked`, note why, and **STOP and escalate to the operator** — don't keep looping or
lower the bar.

## Where it stops

- **Ends at a green QA report** (`next_stage: done`). A green report unlocks a deploy *request* — it
  is **not** a deploy.
- **Never commits, pushes, or deploys.** Engineer stages commit only when explicitly asked; DevOps
  (deploy) is a separate operator-gated stage (`/devops-engineer`) outside this run. End by
  summarizing the QA verdict and the operator's next options (commit the branch / request a deploy).

## Pauses (not fully unattended)

Flow through the stages, but **PAUSE and ask the operator** when: a scope gate fires (Track 2 /
out-of-scope); a stage raises a genuine fork only the operator can decide (`AskUserQuestion`); or QA
is still red after 3 cycles. Record the pause reason in the state file's Notes (`next_stage:
blocked`) so a later `/deliver resume` picks up exactly there. Otherwise don't stop at each stage
boundary for approval — `/deliver` removes the manual hand-offs, not the judgment.

## Inherited rules (non-negotiable)

Every stage keeps its own SKILL's rules; `/deliver` relaxes none — only the manual hand-offs:
- **Track 1 only**; data honesty is the brand (derived numbers labeled + provenance, N/A never `0`,
  13F deltas stay derived, caveats present).
- **Docker for all build/test** (host has no pip/venv); rebuild the `api` image after `src/` changes.
- **Branch off `master`**, one branch per change; **commit/push/deploy only when asked**.
- SEC compliance (User-Agent + process-wide throttle); DuckDB batch-only, never on the request path.

The per-stage handoff docs in `docs/delivery/<slug>/` (`1-brief` … `4-qa`) are the durable, auditable
trail — and, with `_active.md`, the memory that makes `/deliver` resumable without prior context.
