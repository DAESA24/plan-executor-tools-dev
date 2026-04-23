---
status: current
updated: 2026-04-23
---

# StateManager

Sole writer and reader of `validation.json` for the Plan Executor Tools. Every mutation goes through this tool — CLI or programmatic API — so plan state cannot be silently corrupted by hand-editing or concurrent-write races.

**Deploy path:** `~/.claude/PAI/Tools/StateManager.ts`

**Role in the enforcement kernel:** 1 of 3.
- **StateManager** — state lifecycle, CLI + API (this document).
- [CheckRunner](check-runner.md) — criterion evaluator.
- [PlanGate](plan-gate.md) — PreToolUse hook.

## `validation.json` schema

```jsonc
{
  "plan": "implementation-plan.md",
  "project": "my-project",
  "status": "IN_PROGRESS" | "COMPLETED" | "ABANDONED",
  "plan_checksum": "sha256:…" | null,   // set by `init`; validated on read
  "initialized": "<ISO-8601>" | null,   // set by `init`
  "current_phase": <number>,            // e.g. 2
  "current_task": "<dotted-id>",        // e.g. "2.1"
  "phases": {
    "<phaseId>": {
      "name": "...",
      "status": "PENDING" | "IN_PROGRESS" | "PASS" | "BLOCKED",
      "tasks": {
        "<taskId>": {
          "name": "...",
          "status": "PENDING" | "IN_PROGRESS" | "PASS" | "FAIL" | "BLOCKED",
          "verified_at": "<ISO-8601>" | null,
          "fix_attempts": <int>,
          "criteria": {
            "<critId>": {
              "check":    "short human description",
              "type":     "automated" | "manual",
              "command":  "<bash -c command>",   // automated only
              "prompt":   "<question to Drew>",  // manual only
              "status":   "PENDING" | "PASS" | "FAIL",
              "evidence": "<captured stdout or answer>"
            }
          }
        }
      }
    }
  }
}
```

Unknown top-level, phase, task, or criterion fields are preserved through the read → merge → write cycle (D11 schema forward-compat).

## CLI commands

### `init`

Initialise a hand-authored `validation.json`. One-time per plan. Computes `plan_checksum`, stamps `initialized`, writes the active-plan pointer at `$HOME/.claude/MEMORY/STATE/plan-executor.active.json`.

Idempotent on re-run *if* the recomputed checksum matches; raises `ChecksumError` (exit 3) if the criteria structure has drifted since first init.

```bash
bun ~/.claude/PAI/Tools/StateManager.ts init --path ./validation.json
```

### `read`

Read-only projection of state. Validates `plan_checksum` on every invocation. Used by CheckRunner to learn what needs to run, and by PlanGate to decide enforcement.

```bash
# Full pretty-printed state
bun ~/.claude/PAI/Tools/StateManager.ts read --path ./validation.json

# Target a specific task, phase, or criterion
bun ~/.claude/PAI/Tools/StateManager.ts read --task 2.1 --path ./validation.json
bun ~/.claude/PAI/Tools/StateManager.ts read --phase 2 --path ./validation.json
bun ~/.claude/PAI/Tools/StateManager.ts read --criterion 2.1:3 --path ./validation.json
```

### `update-criterion`

Flip a criterion from PENDING to PASS or FAIL. Atomic (temp-file + rename per D9). Promotes the parent task's `status` to `IN_PROGRESS` if it was `PENDING`; increments `fix_attempts` on FAIL. Does **not** advance the task to PASS — that's `advance-task`.

CheckRunner calls this internally; invoke by hand only for recovery.

```bash
bun ~/.claude/PAI/Tools/StateManager.ts update-criterion \
  --task 2.1 --criterion 3 --status PASS --evidence "PASS" \
  --path ./validation.json

# Read multi-line evidence from stdin
some-command | bun ~/.claude/PAI/Tools/StateManager.ts update-criterion \
  --task 2.1 --criterion 3 --status PASS --evidence - \
  --path ./validation.json
```

### `advance-task`

Flip a task to PASS (stamping `verified_at`) *iff* every criterion is PASS. Advances `current_task` to the next task (next numeric key within the phase, or first task of the next phase). Updates `current_phase` on rollover. Sets top-level `status: "COMPLETED"` when all phases PASS, and deletes the active-plan pointer.

Fails (exit 1, `PreconditionError`) if any criterion of the task is not PASS; the response names which ones.

```bash
bun ~/.claude/PAI/Tools/StateManager.ts advance-task --task 2.1 --path ./validation.json
```

### `show`

Human-oriented tree render with `✓ / ✗ / …` icons. No mutation.

```bash
bun ~/.claude/PAI/Tools/StateManager.ts show --path ./validation.json         # current phase
bun ~/.claude/PAI/Tools/StateManager.ts show --phase 2 --path ./validation.json
```

### `validate`

Schema check. Does **not** check `plan_checksum` (unlike `read`). Verifies required fields, enum values, criterion consistency (automated has `command`, manual has `prompt`), and that `current_task` resolves within `current_phase`.

Unknown enum values become `warnings` (don't fail the check) rather than `errors`.

```bash
bun ~/.claude/PAI/Tools/StateManager.ts validate --path ./validation.json
bun ~/.claude/PAI/Tools/StateManager.ts validate --json --path ./validation.json
```

### `checksum`

Emit the recomputed `plan_checksum` of the current criteria structure. No mutation. For CI-style drift checks and debugging.

```bash
bun ~/.claude/PAI/Tools/StateManager.ts checksum --path ./validation.json
```

## Global flags

| Flag | Purpose |
|---|---|
| `--path <file>` | State file path (default: `./validation.json`) |
| `--json` | Machine-readable JSON output |
| `--verbose` | Extra diagnostics |
| `--help`, `-h` | Usage |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | User error or precondition violation (e.g. `advance-task` when one or more criteria are not PASS) |
| 2 | System error (I/O, malformed JSON, schema missing required fields) |
| 3 | `plan_checksum` mismatch — criteria structure changed without going through StateManager. Treat as tampering; restore from git or re-init. |

## Programmatic API

CheckRunner and tests import StateManager's exports directly — same-process, no subprocess overhead.

```typescript
import {
  readState, writeState, initState,
  updateCriterion, advanceTask, findCurrentCriterion,
  computePlanChecksum,
  SchemaError, ChecksumError, TargetNotFoundError,
  PreconditionError, IOError,
  type ValidationState, type Criterion, type Task, type Phase,
} from '~/.claude/PAI/Tools/StateManager';

const state = readState('./validation.json');   // throws ChecksumError on drift
const next  = updateCriterion(state, '2.1', '3', 'PASS', 'PASS');
writeState('./validation.json', next);           // atomic
```

All transform functions (`updateCriterion`, `advanceTask`, `computePlanChecksum`, `findCurrentCriterion`) are **pure** — they never touch disk and never mutate their input. Only `readState`, `writeState`, and `initState` do I/O.

## Key behaviors

- **Atomic write (D9):** temp file in same directory, `fsync`, rename. No file locking. Single-writer discipline (one `current_task` at a time) means the current design cannot race; parallel task advancement is a future concern documented in decisions.md D9.
- **Plan checksum (D8):** SHA256 over `JSON.stringify` of the sorted criteria projection — phase/task/criterion ids plus `check`/`type`/`command`/`prompt`. Deliberately excludes `status`, `evidence`, `fix_attempts`, `verified_at` (those are state, not structure). Prose plan edits never invalidate the checksum; criterion edits always do.
- **Active-plan pointer:** `init` writes a pointer at `$HOME/.claude/MEMORY/STATE/plan-executor.active.json` with four fields (`validation_path`, `project`, `activated_at`, `session_id`). PlanGate reads this to decide whether any plan is currently enforced. Plan completion deletes the pointer, which silences PlanGate until the next `init`.
- **Events (D5):** `advance-task` emits `plan.task.advanced` to `<projectRoot>/.plan-executor/events.jsonl` with `from_task`, `to_task`, optional `phase_rolled`, optional `plan_completed`. The emitter swallows I/O errors silently — observability must never break host code.
- **Dotted-numeric sort:** task ids sort as `2.1 < 2.2 < 2.10` (not lex). Applies to `advance-task`'s "next task" resolution and to `findCurrentCriterion`.
- **Forward compat (D11):** unknown fields at any nesting level are preserved across writes.

## Source

Source: [github.com/DAESA24/plan-executor-tools-dev](https://github.com/DAESA24/plan-executor-tools-dev) — `src/StateManager.ts`. Bundled via `bun build --target=bun` with `src/lib/*` imports inlined into the deployed single-file artifact.
