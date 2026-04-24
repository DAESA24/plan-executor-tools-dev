---
status: current
updated: 2026-04-23
---

# Plan Executor Tools — Documentation

User-facing reference for the three deployed components. For architecture and design decisions, see [design.md](design.md) and [decisions.md](decisions.md). For implementation plans (active and archived) and postmortems, see [`../projects/`](../projects/) — lifecycle convention in [`../projects/project-workflow.md`](../projects/project-workflow.md).

## The enforcement kernel

Plan Executor Tools is a three-component kernel that enforces plan-execution discipline for Claude Code sessions. A hand-authored `validation.json` declares a project's phases, tasks, and criteria; the tools then prevent AI-assisted work from drifting off-plan by (a) blocking file edits until the current task's criteria have PASSed, (b) deterministically evaluating those criteria, and (c) recording everything to a project-local event log.

| Component | Kind | Deploy path | Reference |
|---|---|---|---|
| **StateManager** | CLI + programmatic API | `~/.claude/PAI/Tools/StateManager.ts` | [state-manager.md](state-manager.md) |
| **CheckRunner** | CLI | `~/.claude/PAI/Tools/CheckRunner.ts` | [check-runner.md](check-runner.md) |
| **PlanGate** | PreToolUse hook | `~/.claude/hooks/PlanGate.hook.ts` | [plan-gate.md](plan-gate.md) |

Design-decision anchors cited throughout (D1–D13) resolve to entries in [decisions.md](decisions.md).

## Shared concepts

**validation.json** — the single state file all three components read and write. StateManager is the sole writer; CheckRunner and PlanGate are read-only. Schema documented in [state-manager.md § Schema](state-manager.md#validationjson-schema) and [design.md §3](design.md).

**Active-plan pointer** — `$HOME/.claude/MEMORY/STATE/plan-executor.active.json`. Written by `StateManager init`, deleted by `StateManager advance-task` on plan completion. PlanGate reads this to decide whether *any* plan is currently being enforced — no pointer means silent allow (the hook is a no-op).

**plan_checksum** — SHA256 over the sorted *criteria structure* (phase/task/criterion ids + `check`/`type`/`command`/`prompt`), not the prose plan. Computed once at `init`, validated on every `readState`. A mismatch is treated as tampering; the tools halt (exit 3, hook blocks) until the operator restores or re-inits. Details: [design.md §8](design.md).

**Event log** — `<projectRoot>/.plan-executor/events.jsonl`, append-only JSONL. One line per event: `plan.gate.allowed`, `plan.gate.blocked`, `plan.task.advanced`, `plan.criterion.passed`, `plan.criterion.failed`. Every event carries `timestamp`, `session_id`, `source`, `type` plus type-specific fields. Details: [design.md §9.3](design.md).

## Typical workflow

```bash
# 1. Hand-author validation.json describing the plan.
#    Example starter at docs/design.md §3.6.

# 2. Initialise — computes plan_checksum, writes pointer.
bun ~/.claude/PAI/Tools/StateManager.ts init --path ./validation.json

# 3. Work the plan. PlanGate now blocks Edit/Write until the
#    current task's criteria pass.

# 4. Run CheckRunner to evaluate the current task's criteria.
#    If all PASS, the task auto-advances.
bun ~/.claude/PAI/Tools/CheckRunner.ts run --path ./validation.json

# 5. Repeat 3–4 until every task is PASS. The final advance-task
#    sets plan status = COMPLETED and deletes the pointer.
```

## Exit-code summary

Both CLIs use a common convention (per D7):

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | User error or precondition violation (or criterion FAIL for CheckRunner) |
| 2 | System error |
| 3 | `plan_checksum` mismatch |
| 4 | CheckRunner-only: manual criterion needs AskUserQuestion |

PlanGate hook always exits 0 and expresses block/allow through the `permissionDecision` JSON envelope (per Claude Code hook schema).

## Further reading

- [state-manager.md](state-manager.md) — full StateManager reference
- [check-runner.md](check-runner.md) — full CheckRunner reference
- [plan-gate.md](plan-gate.md) — full PlanGate hook reference
- [design.md](design.md) — architectural spec (§2 deployment, §3 schema, §4–7 component specs, §8 checksum, §9 libraries)
- [decisions.md](decisions.md) — D1–D13 binding decisions
- [`../projects/project-workflow.md`](../projects/project-workflow.md) — `projects/active/` + `projects/archive/` lifecycle convention
- [`../projects/`](../projects/) — implementation plans, validation-state history, and per-build postmortems (current active build in `projects/active/`, completed builds in `projects/archive/<date-slug>/`)
