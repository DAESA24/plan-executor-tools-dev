---
status: dev-preserved-prod-sacrificed
updated: 2026-05-22
---

# Plan Executor Tools Dev

Development workspace for **Plan Executor Tools** — the hook-enforced deterministic plan-execution system implementing the enforcement-kernel subset of Architecture A.

> **Current state (2026-05-22):** None of the three components are deployed. PlanGate, StateManager, and CheckRunner were **sacrificed during the PAI v5.0.0 upgrade** per decisions D8 / D16 / D23 (see [Status](#status--v01-sacrificed-during-the-pai-v500-upgrade) below). The dev tree at this path is preserved and continues to be maintained. **Whether to resume building plan-execution tools is still an open question** — tracked at [`DAESA24/plan-executor-tools-dev` issue #3](https://github.com/DAESA24/plan-executor-tools-dev/issues/3).

## Live Project Context — Check GitHub First

Local files describe the project's history and design; the GitHub repo carries the live work signals. **When picking this project back up — or before recommending next steps — check these first:**

- **Repo:** [`github.com/DAESA24/plan-executor-tools-dev`](https://github.com/DAESA24/plan-executor-tools-dev) (private)
- **Open issues:** [`/issues?q=is%3Aissue+is%3Aopen`](https://github.com/DAESA24/plan-executor-tools-dev/issues?q=is%3Aissue+is%3Aopen) — most importantly issue #3 (the post-v5 resume-vs-retire decision)
- **Open PRs:** [`/pulls?q=is%3Apr+is%3Aopen`](https://github.com/DAESA24/plan-executor-tools-dev/pulls?q=is%3Apr+is%3Aopen)

Issues and PRs are the source of truth for in-flight thinking that hasn't yet landed in `docs/` or `projects/archive/`.

## What This Dev Tree Builds (When Active)

Three artifacts that, when deployed together, enforce deterministic plan execution:

- **`PlanGate.hook.ts`** → deployment target `~/.claude/hooks/PlanGate.hook.ts` — PreToolUse hook. Reads the current project's `validation.json`. Blocks Write/Edit/Bash tool calls (from main agent AND subagents) until the current task shows PASS. Allow-lists CheckRunner invocations so the system can verify without deadlocking.

- **`StateManager.ts`** → deployment target `~/.claude/PAI/Tools/StateManager.ts` — CLI. The SOLE legitimate writer to `validation.json`. Atomic writes. Plan checksum validation. Main agent + subagents cannot write to state directly — PlanGate blocks that path.

- **`CheckRunner.ts`** → deployment target `~/.claude/PAI/Tools/CheckRunner.ts` — CLI. Reads the current task from `validation.json`, runs each criterion's `command` (automated) or prompts the user (manual), collects evidence, calls StateManager to record results. Only CheckRunner causes PASS status to be written.

Plus `settings.json` registration of PlanGate, and documentation additions to `~/.claude/PAI/TOOLS.md` per the PAI tools convention.

## Status — v0.1 Sacrificed During the PAI v5.0.0 Upgrade

**v0.1 shipped 2026-04-23 and ran in production until the v5.0.0 upgrade in May 2026.** The component build was sound — test suite **126/126 pass** at v0.1 cut (67 StateManager + 33 CheckRunner + 23 PlanGate + 3 integration); Drew signed off on Task 8.6 after the smoke test passed end-to-end. The artifacts and test suite remain in `src/` and `__tests__/`.

What changed: during the v5.0.0 upgrade planning, three decisions in [`~/projects/personal/pai-upgrades/5.0.0-upgrade/docs/decisions.md`](file:///Users/drewarnold/projects/personal/pai-upgrades/5.0.0-upgrade/docs/decisions.md) dispositioned the production registrations as sacrificial:

- **D8 — Re-register plan-executor-tools (PlanGate hook) against v5, or retire?** — `DEFERRED — post-v5`. Resume vs. retire requires a fresh look at PlanGate behavior vs. v5's `CheckpointPerISC` + `ISASync` hooks. Tracked at [`DAESA24/plan-executor-tools-dev` issue #3](https://github.com/DAESA24/plan-executor-tools-dev/issues/3).
- **D16 — PlanGate registration source-of-truth: chezmoi template or rendered-only?** — `DEFERRED — post-v5`. Flips with D8's outcome. PlanGate was verified rendered-only in v4 (zero matches in chezmoi sources); if D8 resolves to RESUME, capturing into the chezmoi template becomes the action.
- **D23 — Per-item rendered-only `settings.json` capture.** — `RESOLVED 2026-05-08`. The three PlanGate hook registrations (`PreToolUse:Bash`, `PreToolUse:Edit`, `PreToolUse:Write`) were dispositioned as **SACRIFICIAL** pending the D8/D16 outcome. The hook file itself was never in chezmoi sources (source-of-truth is this dev tree). Drew confirmed 2026-05-08 he was fine with the rendered registrations being wiped during the v5 upgrade because the dev tree survives unconditionally and recovery is mechanical from here.

**What was sacrificed (production paths that are no longer occupied):**

- `~/.claude/hooks/PlanGate.hook.ts` — not present after v5 install
- `~/.claude/PAI/Tools/StateManager.ts` — not present after v5 install
- `~/.claude/PAI/Tools/CheckRunner.ts` — not present after v5 install
- `~/.claude/settings.json` PreToolUse PlanGate registrations on `Bash` / `Edit` / `Write` — not in the v5-rendered settings.json
- `~/.claude/PAI/TOOLS.md` PlanGate section — superseded by v5's regenerated TOOLS.md

**What survives:** this dev tree (source, tests, docs, archive, plans). The v0.1 artifacts can be redeployed mechanically from here if D8 resolves to RESUME — the pre-upgrade registration snapshot was captured at [`docs/settings-snippet.md`](docs/settings-snippet.md) for exactly that purpose.

**Resume vs. retire — open.** Drew has not yet decided whether to continue building plan-execution tools post-v5. The relevant comparison is between PlanGate-as-enforcement and v5's native `CheckpointPerISC.hook.ts` + `ISASync.hook.ts` (which solve adjacent — but not identical — pieces of the "AI claimed PASS without evidence" problem). The decision lives at [issue #3](https://github.com/DAESA24/plan-executor-tools-dev/issues/3); the dev tree is preserved against either outcome.

## Design Reference

Canonical architectural spec: [`projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md`](projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md).

Plan Executor Tools implement the enforcement-kernel subset of that architecture — see the "Note — 2026-04-21" block at the top of the architectural spec for scope rationale. Detailed design for this project: [`docs/design.md`](docs/design.md). Binding decisions: [`docs/decisions.md`](docs/decisions.md).

## v0.1 Build History

**v0.1 — built and deployed 2026-04-23, sacrificed during PAI v5.0.0 upgrade May 2026.**

At cut, the v0.1 three-component enforcement kernel was built, tested, deployed, and live. The test suite was **126/126 pass at v0.1** (67 StateManager + 33 CheckRunner + 23 PlanGate + 3 integration). Drew signed off on Task 8.6 after the smoke test passed end-to-end.

The v0.1 implementation plan, final `validation.json`, and `postmortem.md` are archived at [`projects/archive/2026-04-23-plan-executor-tools-v0.1/`](projects/archive/2026-04-23-plan-executor-tools-v0.1/). Full user-facing reference for the components in [`docs/`](docs/). Lifecycle convention for future builds: [`projects/project-workflow.md`](projects/project-workflow.md).

**Execution mode during v0.1 build:** ran under MANUAL DISCIPLINE — the project couldn't enforce its own construction (chicken-and-egg). Once shipped, every Claude Code session had hook enforcement live for plan-execution work until the v5.0.0 upgrade.

## Why a Subset Instead of Full Architecture A

The full Architecture A bundles plan authoring (Workflows/Create.md, PlanParser, CheckGenerator, Recipes YAML) with plan execution. The failure mode v0.1 targeted was specifically execution discipline — AI skipping verifications, claiming PASS without evidence. The enforcement kernel (PlanGate + StateManager + CheckRunner) addressed that failure mode. Authoring remained manual — a pattern Drew validated twice, first on the impeccable-design-skill project (2026-04-14) and then on this one. See the architecture-a note cited above for full reasoning.

## Scope Boundary (Critical, When Deployed)

When Plan Executor Tools are deployed, they gate **development sessions under an active implementation plan.** They do **NOT** gate:

- Execution of finished skills (e.g., invoking a Presentations skill after it's built)
- Tier C eval runs (which invoke the skill under test — those tool calls must pass freely)
- Ad-hoc non-plan sessions (no `validation.json` pointer active → hook fails open)

## Subagent Coverage (When Deployed)

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
├── projects/
│   ├── project-workflow.md        # projects/ lifecycle convention (active + archive)
│   ├── active/                    # Current build's implementation-plan.md + validation.json (empty between builds)
│   └── archive/                   # Completed builds, one directory per initiative (YYYY-MM-DD-<slug>-vX.Y/)
│                                  #   — contains implementation-plan.md + validation.json + (optional) postmortem.md
└── docs/
    ├── README.md                  # Documentation index
    ├── design.md                  # Detailed design spec
    ├── decisions.md               # D1–D13 architectural decisions
    ├── test-plan.md               # Tier A + Tier B test plan
    ├── requirements-hardened.md   # FR / TR / AR requirements
    ├── settings-snippet.md        # Pre-v5 PlanGate registration snapshot (mechanical redeploy reference)
    ├── state-manager.md           # StateManager reference
    ├── check-runner.md            # CheckRunner reference
    └── plan-gate.md               # PlanGate hook reference
```

Implementation plans and `validation.json` state files live under [`projects/`](projects/) — per-build artifacts, not timeless design. The lifecycle convention (author in `projects/active/`, archive on completion under `projects/archive/<date-slug>/` alongside the build's postmortem if one was written) is documented in [`projects/project-workflow.md`](projects/project-workflow.md).

## Development Workflow (Inactive Pending Resume Decision)

When a future build session reopens this project:

- Source is developed and tested here
- Deployment target (hook): `~/.claude/hooks/PlanGate.hook.ts`
- Deployment target (CLIs): `~/.claude/PAI/Tools/`
- Registration: `~/.claude/settings.json` (mechanical reapply from [`docs/settings-snippet.md`](docs/settings-snippet.md); D16 may flip to chezmoi-template capture depending on D8's outcome)
- Documentation: append new sections to `~/.claude/PAI/TOOLS.md` per PAI convention
- Tests: `bun test`
- Execution discipline (for the rebuild session itself): same chicken-and-egg as v0.1 — manual discipline during build, hook enforcement live from the next session forward if redeployed

## Naming History

This project was originally scaffolded as `plan-executor-mvp-skill-dev/` under `skills-dev/` — a vestigial naming from an earlier consideration of wrapping the tools in a skill. It was renamed and moved to `plan-executor-tools-dev/` under `tools-dev/` on 2026-04-21 to correctly reflect that what's being built is tools (per PAI CLI-First architecture), not a skill. The "MVP" qualifier was also dropped — these weren't prototype artifacts; they implemented a twice-validated pattern (first on impeccable-design-skill, then v0.1 here).

## Related Projects

- [`projects/plan-execution-meta-skill-2026-03/`](projects/plan-execution-meta-skill-2026-03/) — architectural reference (A, B, C options)
- [`impeccable-design-skill-2026-04` (archived)](../../../dev-sor/website-sor/projects/_archive/impeccable-design-skill-2026-04/) — precedent project using manual-discipline `validation.json` — this pattern's first successful use
- [PAI v5.0.0 upgrade project](../../../../personal/pai-upgrades/5.0.0-upgrade/) — origin of the D8 / D16 / D23 sacrificial dispositions; consult [`docs/decisions.md`](../../../../personal/pai-upgrades/5.0.0-upgrade/docs/decisions.md) there for full reasoning
