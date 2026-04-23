---
Status: COMPLETE — all phases PASS, Drew signed off 2026-04-23
Created: 2026-04-21
Completed: 2026-04-23
Owner: Drew Arnold
Archive slug: 2026-04-23-plan-executor-tools-v0.1
Related:
  - docs/design.md — detailed design (CLI specs, schema, hook contract, plan-checksum, anti-patterns)
  - docs/decisions.md — binding architectural decisions D1–D13 referenced in design.md and this plan
  - README.md — project summary
  - ~/projects/dev/dev-tools/projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md — parent architectural spec
Enforcement: MANUAL DISCIPLINE (this project could not enforce its own construction — chicken-and-egg). From v0.1 onward, subsequent projects run under live PlanGate enforcement.
---

# Plan Executor Tools — Implementation Plan

---

## Task Validation Protocol

**This plan uses deterministic task-level validation under manual discipline.** A companion `validation.json` file defines binary PASS/FAIL criteria for every task. Because this project builds the enforcement infrastructure itself, it cannot rely on that infrastructure to enforce its own construction. The orchestrator (main agent) reads `validation.json`, executes criteria, and updates status/evidence honestly.

### Why manual discipline (chicken-and-egg)

The Plan Executor Tools consists of:
- `PlanGate.hook.ts` (blocks tool calls until current task PASS)
- `StateManager.ts` (sole legitimate writer to `validation.json`)
- `CheckRunner.ts` (executes criteria, calls StateManager)

None of these exist until this plan builds them. Therefore, session N+1's execution of this plan relies on:
1. The orchestrator's honest reading of `validation.json`
2. The orchestrator's honest execution of each criterion's `command` or `prompt`
3. The orchestrator's honest updates to `validation.json` (status, evidence)
4. Drew's spot-checks as the ultimate safeguard

Once this plan completes and this project is deployed + registered in `settings.json`, all subsequent plans (e.g., the Presentations-skill build) are hook-enforced. This plan is the bootstrap.

### Execution Rules

1. **After completing each task**, read `validation.json` and execute all criteria for that specific task:
   - **Automated criteria** (`type: "automated"`): Run the `command` field in bash. Record the output as `evidence`. Set `status` to `PASS` or `FAIL`.
   - **Manual criteria** (`type: "manual"`): Present the `prompt` to Drew. Record his response as `evidence`. Set `status` to `PASS` or `FAIL` based on his answer.
2. **Update `validation.json` immediately** after each criterion is checked — set `status`, `evidence`, and update the task `status` when all its criteria pass.
3. **Do not proceed to the next task** until all criteria for the current task show `PASS`. If any criterion is `FAIL`, stop, fix the issue, re-run the check, and update the JSON.
4. **Update `current_task`** in `validation.json` only after all criteria for that task are `PASS`.
5. **A phase is complete** when all tasks within it have `status: "PASS"`. Update the phase `status` accordingly.

### Criteria Types

| Type | How Validated | Example |
|------|--------------|---------|
| `automated` | Run bash command, check output | `test -f src/StateManager.ts && echo PASS \|\| echo FAIL` |
| `manual` | Ask Drew, record his response | "Have you reviewed the hook's PlanGate behavior on a test run?" |

### Gate Check (appears after every task)

Every task ends with this block. Repetition is deliberate — it survives context compaction because it's local to the task being executed.

```
⛋ GATE: Read validation.json → execute all criteria for this task →
update status and evidence → confirm all PASS → proceed to next task.
```

### Important distinction from hook-enforced plans

This plan does NOT use CheckRunner (it doesn't exist yet). This plan does NOT use StateManager (it doesn't exist yet). This plan does NOT use PlanGate (it doesn't exist yet). The orchestrator manually reads `validation.json`, manually runs the commands, manually updates the file.

Once this plan is complete, THIS file (`validation.json` for plan-executor-tools-dev) remains a historical record. Future hook-enforced plans use their own `validation.json` files managed by StateManager — not this one.

---

## Scope Boundary

This plan builds the enforcement kernel of Architecture A from the plan-execution-meta-skill project. Scope is explicitly limited to the three components + deployment + registration:

**In scope:**
- `PlanGate.hook.ts` — PreToolUse hook
- `StateManager.ts` — state file CLI
- `CheckRunner.ts` — criteria execution CLI
- Unit + integration tests for all three
- Deployment to `~/.claude/hooks/` and `~/.claude/PAI/Tools/`
- Registration in `~/.claude/settings.json`
- Smoke test against a canned `validation.json`

**Out of scope (deferred for potential future `_PLANEXECUTOR` full skill):**
- `PlanParser.ts` (plan.md → plan-structure.json)
- `CheckGenerator.ts` (criteria → recipe mapping)
- Recipes YAML files (Filesystem, Coding, Deployment)
- `PlanAutoVerify.hook.ts` (PostToolUse auto-triggering)
- `PlanRecorder.hook.ts` (append-only forensic log)
- Authoring workflows (Create, Execute, Fix, Status)

See `architecture-a-gate-keeper.md` "Note — 2026-04-21" block for rationale.

---

## Subagent Briefing Protocol

Every delegated subagent prompt MUST include the following sections:

1. **Task context:**
   - Current task ID (e.g., "You are executing task 4.1")
   - Task description
   - Parent phase name

2. **Validation criteria:**
   - Full list of `validation.json` criteria for this task
   - Clear statement: "Report back with your artifact locations and a summary of what you did. The orchestrator (main agent) will verify criteria and update `validation.json`. You do NOT update `validation.json` directly."

3. **Tool allow-list** (see per-task allow-lists below):
   - Explicit list of tools the subagent may use
   - Explicit list of tools the subagent may NOT use

4. **Reporting format:**
   - Return structured summary: artifact paths, test pass/fail counts, any blockers encountered
   - Do not claim task completion — the orchestrator decides PASS/FAIL after running criteria

5. **Explicit prohibitions:**
   - Never edit `validation.json` directly
   - Never claim PASS — that's the orchestrator's call after running checks
   - Never wander off-scope (only work on the named task)
   - Never spawn recursive subagents unless task spec says otherwise

**Rationale (different from hook-enforced plans):** Because this project builds the enforcement infrastructure that future plans will rely on, there is NO hook enforcement during this project's own execution. The briefing discipline + orchestrator's honest verification are the sole mechanisms. Drew's spot-checks are the backstop.

---

## Tool Allow-List Conventions

Each task specifies which tools are allowed. Tools NOT listed are implicitly forbidden for that task.

Standard categories:

| Category | Tools | Scope typical |
|---|---|---|
| **Read-only** | Read, Glob, Grep | Any file paths relevant to the task |
| **Write scoped** | Write, Edit | Explicit file paths only; never `validation.json` |
| **Shell scoped** | Bash | Explicit command patterns only (e.g., `bun test`, `git status`) |
| **Delegation** | Task | Only when task explicitly calls for delegation; briefing requirements apply |

Forbidden for all tasks unless specifically granted:
- Edit or Write against `validation.json` (only the orchestrator updates it, manually, after verification)
- Bash invocations of `rm -rf`, force pushes, package installs outside declared dependencies
- Recursive Task spawning (subagents spawning their own subagents) unless task spec says otherwise

---

## Delegation Reference

For this project, the delegation matrix is narrower than Presentations — most work is TypeScript TDD which maps cleanly to Engineer.

| Work type | Execution | Agent | Model | Why |
|---|---|---|---|---|
| Requirements extraction | Direct | — | — | Requires design-context reading; low volume |
| Requirements hardening | Delegated | Architect | Opus | Specialization: requirements rigor |
| Test plan generation | Delegated | Engineer | Opus | TDD is Engineer's domain per PAI delegation matrix |
| TypeScript component implementation (TDD) | Delegated | Engineer | Sonnet | Canonical TDD work — Engineer specializes in red-green-refactor |
| Integration test implementation | Delegated | Engineer | Sonnet | Same pattern as unit tests |
| Deployment / settings.json registration | Direct | — | — | Low volume, high stakes; no delegation benefit |
| Manual review / sign-off | Drew | — | — | Decision gates requiring human judgment |

Note: no Tier C evals in this project. This project is deterministic infrastructure — unit tests (Tier A) + integration tests (Tier B) only. No LLM-based behavior to evaluate.

---

## Dependency Map

```
Phase 0 (Git Setup)
    ↓
Phase 1 (Scaffold) [ALREADY PASS — completed in session N]
    ↓
Phase 2 (Requirements Document: BRD+FRD+TRD)
    ↓
Phase 3 (Test Plan — Tier A + Tier B only)
    ↓
Phase 4 (StateManager.ts via TDD)
    ↓
Phase 5 (CheckRunner.ts via TDD) ← depends on Phase 4 (CheckRunner calls StateManager)
    ↓
Phase 6 (PlanGate.hook.ts via TDD) ← depends on Phase 4 (hook reads state via StateManager interface contract)
    ↓
Phase 7 (Integration Tests — Tier B)
    ↓
Phase 8 (Deploy + Register + Smoke Test)
```

**Critical path:** StateManager first (foundation), CheckRunner second (depends on StateManager), PlanGate third (depends on state-file format defined by StateManager). Integration tests and deployment come last.

---

## Phase 0: Git Setup

### Tasks

**Task 0.1: Initialize git repo**

Execution: Direct
Allowed tools: Bash (`git init`)

```bash
cd ~/projects/dev/dev-tools/agentics-dev/tools-dev/plan-executor-tools-dev
git init
```

> ⛋ GATE: Read `validation.json` → execute all criteria for task 0.1 → update status and evidence → confirm all PASS → proceed to task 0.2.

**Task 0.2: Create GitHub remote**

Execution: Direct (requires Drew to authorize `gh repo create` or provide URL)
Allowed tools: Bash (`gh repo create`, `git remote add`)

```bash
gh repo create <owner>/plan-executor-tools-dev --private --source=. --remote=origin
# or: Drew provides URL, run git remote add origin <url>
```

> ⛋ GATE: Read `validation.json` → execute all criteria for task 0.2 → update status and evidence → confirm all PASS → proceed to task 0.3.

**Task 0.3: Initial commit and push**

Execution: Direct
Allowed tools: Bash (`git add`, `git commit`, `git push`)

```bash
git add .
git commit -m "chore: initial scaffold for Plan Executor Tools skill dev project"
git push -u origin main
```

> ⛋ GATE: Read `validation.json` → execute all criteria for task 0.3 → update status and evidence → confirm all PASS → proceed to Phase 2.

---

## Phase 1: Scaffold [ALREADY PASS]

### Status
Completed manually in session N (2026-04-21). Pre-marked PASS in `validation.json`.

### Tasks (retroactively validated)

**Task 1.1: TypeScript project structure**

Execution: Direct (already done)
Evidence: Directories exist at `src/`, `__tests__/`, `docs/`; `package.json`, `tsconfig.json`, `.gitignore`, `CLAUDE.md`, `README.md` present at root.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 1.1 → update status and evidence → confirm all PASS → proceed to task 1.2.

**Task 1.2: README and CLAUDE pointer files**

Execution: Direct (already done)
Evidence: `README.md` contains project summary + references to architecture-a-gate-keeper.md; `CLAUDE.md` is a read-only pointer to README.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 1.2 → update status and evidence → confirm all PASS → proceed to Phase 0.

---

## Phase 2: Requirements Document (BRD+FRD+TRD)

### Prerequisites
- Phase 1 PASS (scaffold)
- Phase 0 PASS (git set up)

### Tasks

**Task 2.1: Draft requirements document**

Execution: Direct
Rationale: Requires integrated understanding of this project scope. The orchestrator reads persisted design context and authors the requirements doc directly.

Reference inputs (all persisted, no session-context dependency):
- `docs/design.md` — detailed design (CLI specs, schema, hook contract, plan-checksum, anti-patterns) — PRIMARY SOURCE
- `README.md` — project summary (scope, three components, deployment targets)
- `~/projects/dev/dev-tools/projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md` — parent architectural spec (referenced by design.md, NOT restated)
- `~/.claude/PAI/CLIFIRSTARCHITECTURE.md` — CLI-First pattern (grounds TR-* requirements)
- `~/.claude/PAI/TOOLS.md` — PAI tool deployment pattern (grounds deploy-target requirements)
- `~/.claude/PAI/THEHOOKSYSTEM.md` — hook conventions (grounds PlanGate requirements)

Allowed tools: Read (reference inputs), Write (`docs/requirements.md`)
Deliverable: `docs/requirements.md` with three sections — `## Business Requirements (BR-X)`, `## Functional Requirements (FR-X.X)`, `## Technical Requirements (TR-X.X)`. Each requirement atomic, ID'd, independently testable.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 2.1 → update status and evidence → confirm all PASS → proceed to task 2.2.

**Task 2.2: Harden requirements document (Architect/Opus)**

Execution: Delegated
  Agent: Architect
  Model: Opus
  Why: Fresh eyes on atomicity, testability, coverage gaps.
  Briefing requirements: Full draft + SKILLSYSTEM.md anti-pattern list + "every requirement must be atomic and independently testable." Per Subagent Briefing Protocol. Explicit reminder: do NOT update `validation.json`; report artifact location and summary to orchestrator.
  Allowed tools for subagent: Read, Write (`docs/requirements-hardened.md`), Edit (same file); NO Bash, NO Task.
  Verification: Orchestrator reviews diff between `docs/requirements.md` and `docs/requirements-hardened.md`; confirms changes align with atomicity/testability criteria.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 2.2 → update status and evidence → confirm all PASS → proceed to task 2.3.

**Task 2.3: Drew approves hardened requirements**

Execution: Drew (manual)
Prompt: "Have you reviewed `docs/requirements-hardened.md` and approved it as the authoritative requirements document for the Plan Executor Tools?"

> ⛋ GATE: Read `validation.json` → execute all criteria for task 2.3 → update status and evidence → confirm all PASS → proceed to Phase 3.

---

## Phase 3: Test Plan (Tier A + Tier B)

### Prerequisites
- Phase 2 PASS (requirements document approved)

Note: No Tier C. This project is deterministic infrastructure. All tests are code (Tier A) or integration (Tier B).

### Tasks

**Task 3.1: Generate two-tier test plan**

Execution: Delegated
  Agent: Engineer
  Model: Opus
  Why: TDD is Engineer's domain per PAI delegation matrix.

Reference inputs (all persisted):
- `docs/requirements-hardened.md` (Task 2.3 output)
- `architecture-a-gate-keeper.md` (architecture spec)

  Briefing requirements: Per Subagent Briefing Protocol + explicit: "Produce a test plan keyed to FR-X.X and TR-X.X IDs from requirements-hardened.md. Each test entry specifies: tier (A/B), test file location, requirement(s) verified. Tier A covers StateManager unit tests, CheckRunner unit tests, PlanGate unit tests. Tier B covers end-to-end tests against a canned validation.json. No Tier C in this project — all tests are Tier A (unit) or Tier B (integration)."
  Allowed tools for subagent: Read, Write (`docs/test-plan.md`), Edit (same); NO Bash, NO Task.
  Verification: Orchestrator confirms every FR and TR has ≥1 test mapped; every anti-criterion has ≥1 negative test.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 3.1 → update status and evidence → confirm all PASS → proceed to task 3.2.

**Task 3.2: Drew approves test plan**

Execution: Drew (manual)
Prompt: "Have you reviewed `docs/test-plan.md` and approved it? Tier A and Tier B coverage look right?"

> ⛋ GATE: Read `validation.json` → execute all criteria for task 3.2 → update status and evidence → confirm all PASS → proceed to Phase 4.

---

## Phase 4: StateManager.ts via Red-Green TDD

### Prerequisites
- Phase 3 PASS (test plan)

Foundation component. Everything else depends on StateManager.

### Tasks

**Task 4.1: Write failing Tier A unit tests for StateManager.ts**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: `docs/test-plan.md` Tier A section for StateManager + `docs/requirements-hardened.md` FR/TR for StateManager + explicit red-green discipline: "Write tests FIRST. Implementation file does not exist yet. Tests should FAIL with module-not-found or similar."
  Allowed tools for subagent: Read, Write (`__tests__/StateManager.test.ts`, stub `src/StateManager.ts` if needed for type imports), Edit, Bash (`bun test __tests__/StateManager.test.ts` — expect failures); NO Task.
  Verification: Orchestrator confirms test file exists, runs `bun test __tests__/StateManager.test.ts`, expects failures (red phase).

> ⛋ GATE: Read `validation.json` → execute all criteria for task 4.1 → update status and evidence → confirm all PASS → proceed to task 4.2.

**Task 4.2: Implement StateManager.ts to green**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: Failing tests + StateManager spec from architecture-a-gate-keeper.md. Per Subagent Briefing Protocol + explicit: "Make tests pass with minimum viable implementation. Must support: atomic writes, plan checksum validation, read task state, write criterion results, advance current_task."
  Allowed tools for subagent: Read, Write (`src/StateManager.ts`), Edit (same), Bash (`bun test`); NO Task.
  Verification: Orchestrator confirms `bun test __tests__/StateManager.test.ts` exits 0.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 4.2 → update status and evidence → confirm all PASS → proceed to task 4.3.

**Task 4.3: Refactor StateManager.ts (if needed)**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Allowed tools for subagent: Read, Write, Edit (`src/StateManager.ts`), Bash (`bun test`); NO Task.
  Verification: Tests still green.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 4.3 → update status and evidence → confirm all PASS → proceed to Phase 5.

---

## Phase 5: CheckRunner.ts via Red-Green TDD

### Prerequisites
- Phase 4 PASS (StateManager exists)

### Tasks

**Task 5.1: Write failing Tier A unit tests for CheckRunner.ts**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: `docs/test-plan.md` Tier A section for CheckRunner + CheckRunner spec (reads task criteria, runs automated commands, prompts for manual, calls StateManager). Per Subagent Briefing Protocol + red-green discipline.
  Allowed tools for subagent: Read, Write (`__tests__/CheckRunner.test.ts`, stub `src/CheckRunner.ts`), Edit, Bash (`bun test`); NO Task.
  Verification: Tests fail (red).

> ⛋ GATE: Read `validation.json` → execute all criteria for task 5.1 → update status and evidence → confirm all PASS → proceed to task 5.2.

**Task 5.2: Implement CheckRunner.ts to green**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: Failing tests + CheckRunner spec from architecture-a-gate-keeper.md. Per Subagent Briefing Protocol.
  Allowed tools for subagent: Read, Write (`src/CheckRunner.ts`), Edit (same), Bash (`bun test`); NO Task.
  Verification: Tests green.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 5.2 → update status and evidence → confirm all PASS → proceed to task 5.3.

**Task 5.3: Refactor CheckRunner.ts (if needed)**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Allowed tools for subagent: Read, Write, Edit (`src/CheckRunner.ts`), Bash (`bun test`); NO Task.
  Verification: Tests still green.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 5.3 → update status and evidence → confirm all PASS → proceed to Phase 6.

---

## Phase 6: PlanGate.hook.ts via Red-Green TDD

### Prerequisites
- Phase 4 PASS (state file format defined by StateManager)
- Phase 5 PASS (CheckRunner interface defined — PlanGate must allow-list its invocations)

### Tasks

**Task 6.1: Write failing Tier A unit tests for PlanGate.hook.ts**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: `docs/test-plan.md` Tier A section for PlanGate + PlanGate spec (PreToolUse hook; reads validation.json; blocks Write/Edit/Bash if current task not PASS; allow-lists CheckRunner; guards validation.json path). Per Subagent Briefing Protocol + red-green discipline.
  Allowed tools for subagent: Read, Write (`__tests__/PlanGate.test.ts`, stub `src/PlanGate.hook.ts`), Edit, Bash (`bun test`); NO Task.
  Verification: Tests fail (red).

> ⛋ GATE: Read `validation.json` → execute all criteria for task 6.1 → update status and evidence → confirm all PASS → proceed to task 6.2.

**Task 6.2: Implement PlanGate.hook.ts to green**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: Failing tests + PlanGate spec + hook input/output format from `~/.claude/PAI/THEHOOKSYSTEM.md` (if exists) or PAI hook precedent (e.g., MdListGuard.hook.ts). Per Subagent Briefing Protocol.
  Allowed tools for subagent: Read, Write (`src/PlanGate.hook.ts`), Edit (same), Bash (`bun test`); NO Task.
  Verification: Tests green.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 6.2 → update status and evidence → confirm all PASS → proceed to task 6.3.

**Task 6.3: Refactor PlanGate.hook.ts (if needed)**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Allowed tools for subagent: Read, Write, Edit (`src/PlanGate.hook.ts`), Bash (`bun test`); NO Task.
  Verification: Tests still green.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 6.3 → update status and evidence → confirm all PASS → proceed to Phase 7.

---

## Phase 7: Integration Tests (Tier B)

### Prerequisites
- Phases 4, 5, 6 PASS (all three components exist with unit tests green)

### Tasks

**Task 7.1: Write Tier B integration tests**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: `docs/test-plan.md` Tier B section + architecture-a-gate-keeper.md for the integration model. Per Subagent Briefing Protocol + red-green discipline + "Integration tests verify: (1) full happy-path — task PENDING → CheckRunner runs → all criteria PASS → StateManager advances current_task; (2) FAIL path — one criterion fails → state reflects FAIL → gate remains closed; (3) block path — PlanGate blocks a Write attempt when current task is PENDING."
  Allowed tools for subagent: Read, Write (`__tests__/integration/*.test.ts`, fixture `validation.json` under `__tests__/fixtures/`), Edit, Bash (`bun test`); NO Task.
  Verification: Tests fail initially (red — integration seams not yet wired if any fix needed).

> ⛋ GATE: Read `validation.json` → execute all criteria for task 7.1 → update status and evidence → confirm all PASS → proceed to task 7.2.

**Task 7.2: Pass Tier B integration tests**

Execution: Delegated
  Agent: Engineer
  Model: Sonnet
  Briefing requirements: Failing tests + any integration glue that needs adding to StateManager/CheckRunner/PlanGate. Per Subagent Briefing Protocol.
  Allowed tools for subagent: Read, Write, Edit (`src/*.ts`, test fixtures), Bash (`bun test`); NO Task.
  Verification: All integration tests green.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 7.2 → update status and evidence → confirm all PASS → proceed to Phase 8.

---

## Phase 8: Deploy + Register + Document + Smoke Test

### Prerequisites
- Phase 7 PASS (all tests green locally)

### Tasks

**Task 8.1: Deploy CLIs to `~/.claude/PAI/Tools/`**

Execution: Direct
Allowed tools: Bash (`cp`, `chmod`)
```bash
cp src/StateManager.ts ~/.claude/PAI/Tools/
cp src/CheckRunner.ts ~/.claude/PAI/Tools/
chmod +x ~/.claude/PAI/Tools/StateManager.ts
chmod +x ~/.claude/PAI/Tools/CheckRunner.ts
```

Per `~/.claude/PAI/TOOLS.md` §"Adding New Tools" step 1 — flat directory, TitleCase filenames (already conform). If bundling per design.md §9.4, these are single self-contained files with lib imports inlined.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 8.1 → update status and evidence → confirm all PASS → proceed to task 8.2.

**Task 8.2: Deploy hook to `~/.claude/hooks/`**

Execution: Direct
Allowed tools: Bash (`cp`, `chmod`)
```bash
cp src/PlanGate.hook.ts ~/.claude/hooks/
chmod +x ~/.claude/hooks/PlanGate.hook.ts
```

Per design.md §9.4, the handler is inlined into the bundled hook file — no separate `~/.claude/hooks/handlers/PlanGateHandler.ts` deploy.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 8.2 → update status and evidence → confirm all PASS → proceed to task 8.3.

**Task 8.3: Register hook in `~/.claude/settings.json`**

Execution: Direct
Allowed tools: Read, Edit (`~/.claude/settings.json`)

Append PlanGate as an ADDITIONAL hook entry on the `Write|Edit|Bash` PreToolUse matchers (alongside SecurityValidator, sequential execution per D12). Use the verbatim JSON block from design.md §2.2.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 8.3 → update status and evidence → confirm all PASS → proceed to task 8.4.

**Task 8.4: Update `~/.claude/PAI/TOOLS.md`**

Execution: Direct
Allowed tools: Read (`docs/design.md` §11 for verbatim insert text), Read (`~/.claude/PAI/TOOLS.md`), Edit (`~/.claude/PAI/TOOLS.md`)

Per `~/.claude/PAI/TOOLS.md` §"Adding New Tools" step 2: append two new sections documenting the newly deployed CLIs. Format matches the existing `Inference.ts`, `GetTranscript.ts`, `RemoveBg.ts` entries — tool location, usage examples, when-to-use triggers, environment variables (none for these two), technical details. The verbatim insert text lives at `docs/design.md` §11.1 (StateManager) and §11.2 (CheckRunner).

After the insert, verify `~/.claude/PAI/SKILL.md` indexes `TOOLS.md` in its documentation list (per step 3 of the "Adding New Tools" protocol); add the reference if missing.

> ⛋ GATE: Read `validation.json` → execute all criteria for task 8.4 → update status and evidence → confirm all PASS → proceed to task 8.5.

**Task 8.5: Smoke test — canned `validation.json` under hook enforcement**

Execution: Direct (orchestrator manually runs the smoke test)
Allowed tools: Write (fixture `/tmp/smoke-test/validation.json`), Bash (CheckRunner, test Write attempts that should be blocked)

Procedure:
1. Create a canned `validation.json` at `/tmp/smoke-test/validation.json` with one phase, one task, one automated criterion (e.g., `test -f /tmp/smoke-test/marker && echo PASS || echo FAIL`), current_task set to "0.1", criterion PENDING.
2. Attempt `Write` to an arbitrary file in `/tmp/smoke-test/` — PlanGate MUST block (current task not PASS).
3. Invoke CheckRunner — should be allowed through the hook, should execute the criterion (initially FAIL since marker doesn't exist), StateManager records FAIL.
4. Create the marker file manually. Invoke CheckRunner again. Now PASS. StateManager updates state.
5. Retry the Write — now allowed.
6. Verify event log written to `/tmp/smoke-test/.plan-executor/events.jsonl` with expected `plan.gate.blocked`, `plan.criterion.failed`, `plan.criterion.passed`, `plan.gate.allowed`, `plan.task.advanced` entries (per design.md §9.3).

> ⛋ GATE: Read `validation.json` → execute all criteria for task 8.5 → update status and evidence → confirm all PASS → proceed to task 8.6.

**Task 8.6: Drew final review and sign-off**

Execution: Drew (manual)
Prompt: "Have you reviewed the Plan Executor Tools end-to-end behavior (block / allow / advance / events logged / PAI/TOOLS.md documented) and approved it? Ready to use for the Presentations-skill build in the next session?"

> ⛋ GATE: Read `validation.json` → execute all criteria for task 8.6 → update status and evidence → plan `status: COMPLETE` set.

---

## Plan Complete

When Task 8.6 shows PASS, update `validation.json` top-level `status: COMPLETE` and record final `notes`. This project is deployed at `~/.claude/hooks/PlanGate.hook.ts` and `~/.claude/PAI/Tools/{StateManager,CheckRunner}.ts`, registered in `~/.claude/settings.json`, and documented in `~/.claude/PAI/TOOLS.md`. Subsequent plans (e.g., the Presentations-skill build) execute under hook enforcement from the next session onward.
