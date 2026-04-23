# CheckRunner

Per-task criterion evaluator. Given a task id (or the current task), evaluates each criterion, records results via StateManager, and auto-advances the task when every criterion PASSes. Running CheckRunner is what unblocks the PlanGate hook.

**Deploy path:** `~/.claude/PAI/Tools/CheckRunner.ts`

**Role in the enforcement kernel:** 2 of 3.
- [StateManager](state-manager.md) — state lifecycle, CLI + API.
- **CheckRunner** — criterion evaluator (this document).
- [PlanGate](plan-gate.md) — PreToolUse hook.

CheckRunner imports StateManager's programmatic API directly (same Bun process, no subprocess overhead). At deploy time, both are bundled to self-contained files under `~/.claude/PAI/Tools/`.

## Criterion evaluation

### Automated criterion

For each PENDING or FAIL criterion, in numeric-id order:

1. Spawn `bash -c "<command>"` with a 30 s default timeout (overridable via `CHECKRUNNER_TIMEOUT_MS` env var).
2. Capture stdout, stderr, exit code.
3. **PASS** iff *both* conjuncts hold:
   - the last non-empty stdout line is exactly `PASS`, AND
   - exit code is 0.
4. **FAIL** otherwise. Evidence is `"exit_code=N\nstdout=…\nstderr=…"`.
5. Timeout → FAIL with evidence `"TIMEOUT after <N>ms"`.
6. Record the result via `StateManager.updateCriterion`.

### Manual criterion (D10)

Two strategies selected via `--manual-prompt-strategy`:

**`stdin` (default)** — works in interactive terminals and scripted contexts where stdin is piped.
1. Print `MANUAL: <prompt>` to stdout.
2. Read one line from stdin.
3. Empty line → FAIL with evidence `"no answer provided"`. Non-empty → PASS with the trimmed line as evidence.
4. Record via StateManager.

**`askuser`** — for main-agent orchestration where the model wants to pause and use the AskUserQuestion UX.
1. The *first* pending manual criterion aborts the run.
2. CheckRunner prints a structured payload to **stderr** and exits with code 4:
   ```json
   {
     "exit_reason": "manual_criterion_needs_askuser",
     "task": "2.2",
     "criterion": "3",
     "prompt": "Did you review the diff?",
     "resume_command": "CheckRunner run --task 2.2 --manual-prompt-strategy askuser --answer <RESPONSE>"
   }
   ```
3. The orchestrator calls `AskUserQuestion`, captures the human response, re-invokes CheckRunner with `--answer "<response>"`.
4. Further manual criteria trigger additional exit-4 round-trips — one round-trip per manual criterion.

### `--answer` shortcut

Under either strategy, `--answer <text>` supplies the answer for the *next* pending manual criterion without prompting. Useful for scripted runs and for resuming after an askuser exit-4.

### Re-run semantics (red → green cycle)

On re-invocation, criteria with status `PENDING` or `FAIL` are **re-evaluated**. `PASS` criteria are **skipped** (idempotent). This is what enables the typical "criterion FAIL → fix the code → re-run CheckRunner → same criterion now PASSes → task advances" workflow.

## CLI usage

```bash
# Run current task's criteria (the normal case).
bun ~/.claude/PAI/Tools/CheckRunner.ts run --path ./validation.json

# Run a specific task — useful for retries after a fix.
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --path ./validation.json

# Evaluate without writing state (dry run).
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --dry-run --path ./validation.json

# Machine-readable output — a single JSON object on stdout.
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --json --path ./validation.json

# Manual-criterion askuser flow.
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 \
  --manual-prompt-strategy askuser --path ./validation.json
# → exits 4 with structured stderr; orchestrator handles AskUserQuestion,
# then re-invokes with --answer:
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 \
  --manual-prompt-strategy askuser --answer "Yes, reviewed and approved." \
  --path ./validation.json
```

## Flags

| Flag | Purpose |
|---|---|
| `--path <file>` | State file path (required) |
| `--task <id>` | Explicit task id (else `state.current_task`) |
| `--dry-run` | Evaluate without writing state or emitting events |
| `--manual-prompt-strategy stdin\|askuser` | Manual criterion UX (default: `stdin`) |
| `--answer <text>` | Pre-supply answer for next pending manual criterion |
| `--json` | Single-object JSON on stdout |
| `--verbose` | Extra diagnostics |
| `--help`, `-h` | Usage |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | All criteria PASS and task advanced successfully |
| 1 | One or more criteria FAILED (stderr lists which). Not a system error — task stayed `IN_PROGRESS`, `fix_attempts` was incremented. |
| 2 | System error (StateManager write failure, malformed state, etc.) |
| 3 | `plan_checksum` mismatch detected on read |
| 4 | Manual criterion needs `AskUserQuestion` (askuser strategy). Stderr contains a JSON payload; re-invoke with `--answer`. |

## Dry-run

`--dry-run` evaluates automated criteria (runs the bash command) but **does not** call `updateCriterion` or `advanceTask`. Manual criteria are reported as `would prompt: <prompt>` with no stdin read and no exit 4. Default (non-`--json`) stdout begins with the literal line `[DRY RUN — state file not modified]`. No `plan.*` events are emitted.

## Events emitted (D5)

Written to `<projectRoot>/.plan-executor/events.jsonl`:

| Event | When | Fields (in addition to the base timestamp/session_id/source/type) |
|---|---|---|
| `plan.criterion.passed` | Criterion records PASS | `task`, `criterion`, `evidence_len` |
| `plan.criterion.failed` | Criterion records FAIL | `task`, `criterion`, `evidence_snippet` (first 240 chars), `exit_code` (automated failures only) |
| `plan.task.advanced` | Task flips to PASS (StateManager emits) | `from_task`, `to_task`, optional `phase_rolled`, optional `plan_completed` |

`source` is `"CheckRunner"` for criterion events and `"StateManager"` for the advance event. `--dry-run` emits nothing.

## Key behaviors

- **Subprocess-free integration with StateManager** (TR-7.7): module import, not subprocess spawn. One bundled file at deploy — StateManager's code is inlined inside CheckRunner at build time.
- **Deterministic evaluation order:** criteria sorted by dotted-numeric id (`1, 2, …, 10` — not lex `1, 10, 2`).
- **`--json` replaces prose stdout** with a single JSON object so orchestrator scripts can parse stdout directly. Shape: `{ task, results: [...], summary: {passed, failed, manual}, advanced }`.

## Source

Source: [github.com/DAESA24/plan-executor-tools-dev](https://github.com/DAESA24/plan-executor-tools-dev) — `src/CheckRunner.ts`. Bundled via `bun build --target=bun` with `src/StateManager.ts` + `src/lib/*` imports inlined.
