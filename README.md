# Plan Executor Tools Dev

Development project for **Plan Executor Tools** — the hook-enforced deterministic plan-execution system implementing Architecture A's enforcement kernel. Ships two CLIs and one PreToolUse hook. Defers the authoring/recipe/auto-verify convenience layer of the full Architecture A spec.

## What This Builds

Three deployed artifacts that together enforce deterministic plan execution:

- **`PlanGate.hook.ts`** → `~/.claude/hooks/PlanGate.hook.ts` — PreToolUse hook. Reads the current project's `validation.json`. Blocks Write/Edit/Bash tool calls (from main agent AND subagents) until the current task shows PASS. Allow-lists CheckRunner invocations so the system can verify without deadlocking.

- **`StateManager.ts`** → `~/.claude/PAI/Tools/StateManager.ts` — CLI. The SOLE legitimate writer to `validation.json`. Atomic writes. Plan checksum validation. Main agent + subagents cannot write to state directly — PlanGate blocks that path.

- **`CheckRunner.ts`** → `~/.claude/PAI/Tools/CheckRunner.ts` — CLI. Reads the current task from `validation.json`, runs each criterion's `command` (automated) or prompts the user (manual), collects evidence, calls StateManager to record results. Only CheckRunner causes PASS status to be written.

Plus `settings.json` registration of PlanGate, and documentation additions to `~/.claude/PAI/TOOLS.md` per the PAI tools convention.

## Design Reference

Canonical architectural spec: `~/projects/dev/dev-tools/projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md`.

Plan Executor Tools implement the enforcement-kernel subset of that architecture — see the "Note — 2026-04-21" block at the top of the architectural spec for scope rationale. Detailed design for this project: `docs/design.md`. Binding decisions: `docs/decisions.md`.

## Status

**Phase:** Scaffolded (2026-04-21). Implementation plan, validation.json, design doc, and decision log all authored. Ready for first execution session.

**Execution mode:** This project cannot enforce its own construction (chicken-and-egg). The build session runs under MANUAL DISCIPLINE — orchestrator manually reads `validation.json`, runs criteria, updates status/evidence. Once these tools are built, deployed, and registered, every subsequent Claude Code session has hook enforcement live for plan-execution work.

## Why a Subset Instead of Full Architecture A

The full Architecture A bundles plan authoring (Workflows/Create.md, PlanParser, CheckGenerator, Recipes YAML) with plan execution. The failure mode we're fixing is specifically about execution discipline — AI skipping verifications, claiming PASS without evidence. The enforcement kernel (PlanGate + StateManager + CheckRunner) addresses the failure mode. Authoring remains manual — a pattern validated twice by Drew, first on the impeccable-design-skill project (2026-04-14) and now being applied here. See the architecture-a note cited above for full reasoning.

## Scope Boundary (Critical)

Plan Executor Tools gate **development sessions under an active implementation plan.** They do **NOT** gate:

- Execution of finished skills (e.g., invoking the Presentations skill after it's built)
- Tier C eval runs (which invoke the skill under test — those tool calls must pass freely)
- Ad-hoc non-plan sessions (no `validation.json` pointer active → hook fails open)

## Subagent Coverage

Hooks registered in `settings.json` apply session-wide. PlanGate fires on main agent AND subagent tool calls equally. But subagents must be **briefed** on the plan-execution system by the main agent — otherwise they hit PlanGate blocks cold and have no idea what CheckRunner is. Every delegation spec in any implementation plan must include a Subagent Briefing Protocol entry.

## Project Structure

```
plan-executor-tools-dev/
├── README.md                      # This file (canonical)
├── CLAUDE.md                      # Read-only pointer to README.md
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── PlanGate.hook.ts           # PreToolUse hook (thin wrapper)
│   ├── StateManager.ts            # State-file CLI (atomic, sole writer)
│   ├── CheckRunner.ts             # Criteria execution CLI
│   ├── handlers/
│   │   └── PlanGateHandler.ts     # Hook logic (pure function, handler-delegate per D3)
│   └── lib/
│       ├── event-types.ts         # Event type definitions
│       ├── event-emitter.ts       # appendEvent() runtime
│       ├── state-types.ts         # validation.json schema types
│       └── hook-types.ts          # PreToolUseHookInput type
├── __tests__/                     # Tier A unit + Tier B integration tests
├── plans/
│   ├── active/                    # Current build's implementation-plan.md + validation.json (empty between builds)
│   └── archive/                   # Completed builds, one directory per initiative (YYYY-MM-DD-<slug>-vX.Y/)
└── docs/
    ├── README.md                  # Documentation index
    ├── design.md                  # Detailed design spec
    ├── decisions.md               # D1–D13 architectural decisions
    ├── test-plan.md               # Tier A + Tier B test plan
    ├── requirements-hardened.md   # FR / TR / AR requirements
    ├── plan-workflow.md           # plans/ lifecycle convention (active + archive)
    ├── state-manager.md           # StateManager reference
    ├── check-runner.md            # CheckRunner reference
    └── plan-gate.md               # PlanGate hook reference
```

Implementation plans and `validation.json` state files live under [`plans/`](plans/) — per-build artifacts, not timeless design. The lifecycle convention (author in `plans/active/`, archive on completion under `plans/archive/<date-slug>/`) is documented in [docs/plan-workflow.md](docs/plan-workflow.md).

## Development Workflow

- Source is developed and tested here
- Deployment target (hook): `~/.claude/hooks/PlanGate.hook.ts`
- Deployment target (CLIs): `~/.claude/PAI/Tools/`
- Registration: `~/.claude/settings.json`
- Documentation: append new sections to `~/.claude/PAI/TOOLS.md` per PAI convention
- Tests: `bun test`
- Execution discipline: build session runs under MANUAL discipline (chicken-and-egg); all subsequent sessions have hook enforcement live

## Naming History

This project was originally scaffolded as `plan-executor-mvp-skill-dev/` under `skills-dev/` — a vestigial naming from an earlier consideration of wrapping the tools in a skill. It was renamed and moved to `plan-executor-tools-dev/` under `tools-dev/` on 2026-04-21 to correctly reflect that what's being built is tools (per PAI CLI-First architecture), not a skill. The "MVP" qualifier was also dropped — these aren't prototype artifacts; they implement a twice-validated pattern (first on impeccable-design-skill, now here).

## Related Projects

- [presentations-skill-dev](../../../../dev-sor/agentics-dev/skills-dev/presentations-skill-dev/) — first real-world project to execute under hook enforcement once Plan Executor Tools ship
- [plan-execution-meta-skill-2026-03](../../../projects/plan-execution-meta-skill-2026-03/) — architectural reference (A, B, C options)
- [impeccable-design-skill-2026-04 (archived)](../../../../dev-sor/website-sor/projects/_archive/impeccable-design-skill-2026-04/) — precedent project using manual-discipline validation.json — this pattern's first successful use
