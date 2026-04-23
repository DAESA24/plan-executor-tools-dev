---
status: current
updated: 2026-04-23
---

# PlanGate

Claude Code `PreToolUse` hook that enforces plan discipline. When an active plan exists, blocks `Bash`, `Edit`, and `Write` tool calls unless the current task's criteria have all PASSed (or the call is an allow-listed StateManager / CheckRunner invocation).

**Deploy path:** `~/.claude/hooks/PlanGate.hook.ts`

**Role in the enforcement kernel:** 3 of 3.
- [StateManager](state-manager.md) — state lifecycle, CLI + API.
- [CheckRunner](check-runner.md) — criterion evaluator.
- **PlanGate** — PreToolUse hook (this document).

## Registration

Registered in `~/.claude/settings.json` *after* `SecurityValidator` on the `Bash`, `Edit`, and `Write` matchers (D12). Claude Code runs matchers sequentially; if SecurityValidator allows, PlanGate runs second. If SecurityValidator blocks, PlanGate never sees the call.

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${PAI_DIR}/hooks/SecurityValidator.hook.ts" },
          { "type": "command", "command": "${PAI_DIR}/hooks/PlanGate.hook.ts" }
        ]
      }
      // … same pattern for Edit and Write
    ]
  }
}
```

## Handler-delegate pattern (D3)

The wrapper at `~/.claude/hooks/PlanGate.hook.ts` is deliberately thin — stdin → `decide()` → stdout. All decision logic lives in `src/handlers/PlanGateHandler.ts`, which is bundled into the deployed file at build time. The split keeps `decide()` a pure function (no stdin reads, no `process.exit`, no side effects beyond `appendEvent`) and makes it unit-testable without subprocess ceremony.

## Active-plan discovery

The hook reads `~/.claude/MEMORY/STATE/plan-executor.active.json` (written by `StateManager init`, deleted by `StateManager advance-task` on plan completion):

- **No pointer** → silent ALLOW. PlanGate is a no-op when no plan is initialised.
- **Pointer with unresolvable `validation_path`** → silent ALLOW + emit `hook.error` event (fail-open per hook best practice).
- **Pointer resolves** → read state, enforce.

## Decision precedence

Evaluated in order; first match wins:

1. `tool_name` not in `{Bash, Edit, Write}` → silent ALLOW. (Read, AskUserQuestion, Task, Skill, etc. are never gated.)
2. `readState` throws `ChecksumError` → BLOCK `checksum_drift`.
3. `readState` throws `SchemaError` → BLOCK `state_malformed`.
4. Write/Edit targeting `realpath(pointer.validation_path)` → BLOCK `state_file_write_attempt`. Applies regardless of task status — `validation.json` is sacred, StateManager is the sole writer.
5. Bash allow-list: tokenise command, `realpath` each non-flag token, match against `realpath(~/.claude/PAI/Tools/StateManager.ts)` or `CheckRunner.ts`. Match → ALLOW.
6. Task `status === "PASS"` → ALLOW. (The task is done; any further tool call is fine until the next task's criteria generate new gates.)
7. Fall through → BLOCK `task_not_pass`.

## Allow-list (D2)

Identity is established by **realpath match** — not env vars, not shared secrets, not substring matching:

- A token whose string contains the allow-listed path but *resolves* to a different path → does **not** match.
- A symlinked path pointing at the allow-listed path → **does** match.
- The `~` (tilde) in tokens is expanded to `$HOME` before `realpath`.
- Tokens beginning with `-` are skipped (they're flags, never tool paths).
- Quoted content (single or double quotes) is treated as an opaque token — arguments like `'bun ~/path/to/Tool'` inside `bash -c '…'` do not leak through.

## State-file write protection

Writing directly to `validation.json` would bypass StateManager's atomic write + checksum discipline. PlanGate blocks it regardless of task status and tells the caller to use StateManager:

> `PlanGate: validation.json is written only by StateManager. Use:`
>
> `  bun ~/.claude/PAI/Tools/StateManager.ts update-criterion|advance-task …`

## Block envelope

Per Claude Code hook schema (verified against `code.claude.com/docs/en/hooks` §PreToolUse):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "PlanGate: task 2.1 \"Draft requirements document\" is not yet PASS.\n\nRun verification before mutating files:\n\n  bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1\n\nIf the criteria pass, advancement is automatic. If they fail, fix the\nspecific issue and re-run CheckRunner."
  }
}
```

ALLOW is silent — zero bytes written to stdout. Exit code is **always** 0; blocking is expressed via `permissionDecision`, not via non-zero exit.

The reason text includes the failing task's id, its human-readable `name`, and the exact CheckRunner command to run for remediation.

## Events emitted (D5)

Every `decide()` call emits exactly one event to `<projectRoot>/.plan-executor/events.jsonl`:

| Event | Fields |
|---|---|
| `plan.gate.allowed` | `tool`, `task` |
| `plan.gate.blocked` | `tool`, `task`, `reason_code`, `target_path` *(only when `reason_code === "state_file_write_attempt"`)* |

Plus a base `{timestamp, session_id, source: "PlanGate", type}` on every event.

## Reason codes

| Code | Emitted when | `target_path`? |
|---|---|---|
| `task_not_pass` | Task not PASS; not allow-listed | no |
| `state_file_write_attempt` | Write/Edit target equals `validation.json` | yes |
| `checksum_drift` | `ChecksumError` on `readState` | no |
| `state_malformed` | `SchemaError` on `readState` (malformed JSON, missing required fields) | no |

## Fail-open semantics

Any unexpected exception inside `decide()` is caught by the wrapper's `try { … } catch { return 0; }` and results in silent ALLOW (FR-3.17). A broken hook must never wedge Claude Code — observability (`events.jsonl`) will surface the problem without stopping work.

## Out-of-band invocation (smoke testing)

Test the deployed hook by piping stdin:

```bash
echo '{
  "session_id":"smoke",
  "transcript_path":"/tmp/x.jsonl",
  "hook_event_name":"PreToolUse",
  "tool_name":"Write",
  "tool_input": { "file_path":"/tmp/smoke/target.txt", "content":"x" }
}' | bun ~/.claude/hooks/PlanGate.hook.ts
```

Expected outcomes:
- **No pointer** → exit 0, no stdout.
- **Pointer + PENDING current_task** → exit 0, JSON block envelope on stdout.
- **Pointer + PASS current_task** → exit 0, no stdout (silent ALLOW).

## Interaction with SecurityValidator

Per D12, the two hooks share the `Bash`/`Edit`/`Write` matchers and run sequentially:

- **SecurityValidator** retains its role as the first line of defence for dangerous-command detection and sensitive-file protection.
- **PlanGate**'s only concern is plan discipline. It has no opinions about `rm -rf /` — SecurityValidator handles that.
- No conflict on the `validation.json` path. PlanGate's write-protection rule targets the plan's state file, not any of SecurityValidator's sensitive paths. Even if both fired, a `"deny"` from either is enough to block.

## Source

Source: [github.com/DAESA24/plan-executor-tools-dev](https://github.com/DAESA24/plan-executor-tools-dev) — `src/PlanGate.hook.ts` (wrapper) + `src/handlers/PlanGateHandler.ts` (decide logic). Bundled via `bun build --target=bun` with handler and `src/lib/*` imports inlined into the deployed single file.
