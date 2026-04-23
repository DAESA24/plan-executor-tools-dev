#!/usr/bin/env bun
/*!
 * PlanGate.hook.ts — Plan Executor Tools: PreToolUse hook wrapper
 *
 * PURPOSE:
 * Claude Code PreToolUse hook that enforces plan discipline. When an
 * active plan exists, blocks Bash/Edit/Write tool calls unless the
 * current task's criteria have all PASSed (or the call is allow-listed
 * as a StateManager / CheckRunner invocation).
 *
 * ROLE IN THE ENFORCEMENT KERNEL:
 * This file is 3 of 3 deployed components:
 *   - StateManager.ts   — State lifecycle, CLI + API.
 *   - CheckRunner.ts    — Criterion evaluator.
 *   - PlanGate.hook.ts  — THIS FILE. PreToolUse hook.
 *
 * Registered in ~/.claude/settings.json AFTER SecurityValidator on the
 * `Bash`, `Edit`, and `Write` matchers (D12). SecurityValidator runs
 * first; if it allows the call, PlanGate runs second. If SecurityValidator
 * blocks, PlanGate never sees the call.
 *
 * HANDLER-DELEGATE PATTERN (D3):
 * This wrapper is deliberately thin — stdin → decide() → stdout.
 * All decision logic lives in src/handlers/PlanGateHandler.ts, which
 * is bundled into this file at build time. The split keeps decide()
 * a pure function (no stdin reads, no process.exit, no side effects
 * beyond appendEvent) and makes it unit-testable without subprocess
 * ceremony.
 *
 * ACTIVE-PLAN DISCOVERY:
 * The hook reads ~/.claude/MEMORY/STATE/plan-executor.active.json.
 * - No pointer → silent ALLOW. PlanGate is a no-op when no plan is init'd.
 * - Pointer with unresolvable validation_path → silent ALLOW + emit
 *   `hook.error` event (fail-open per hook best practice).
 * - Pointer resolves → read state, enforce.
 *
 * DECISION PRECEDENCE (in order):
 *   1. tool_name not in {Bash, Edit, Write} → silent ALLOW.
 *      (Read, AskUserQuestion, Task, Skill, etc. are never gated.)
 *   2. ChecksumError from readState → BLOCK "checksum_drift".
 *   3. SchemaError from readState → BLOCK "state_malformed".
 *   4. Write/Edit targeting realpath(pointer.validation_path) →
 *      BLOCK "state_file_write_attempt" (applies regardless of task
 *      status — validation.json is sacred, StateManager is the sole
 *      writer).
 *   5. Bash allow-list: tokenise command, realpath each non-flag token,
 *      match against realpath(~/.claude/PAI/Tools/StateManager.ts) or
 *      CheckRunner.ts. Match → ALLOW.
 *   6. Task status PASS → ALLOW (task is done; any further tool call
 *      is fine until the next task's criteria generate new gates).
 *   7. Fall through → BLOCK "task_not_pass".
 *
 * ALLOW-LIST (D2):
 * Identity is established by realpath match — NOT env vars, NOT shared
 * secrets, NOT substring matching. A token whose string contains the
 * allow-listed path but resolves to a DIFFERENT path does NOT match.
 * A symlinked path pointing AT the allow-listed path DOES match.
 * The ~ (tilde) in tokens is expanded to $HOME before realpath.
 *
 * STATE-FILE WRITE PROTECTION:
 * Writing to validation.json directly would bypass StateManager's atomic
 * write + checksum discipline. PlanGate blocks it regardless of task
 * status and tells the caller to use StateManager instead.
 *
 * BLOCK OUTPUT FORMAT:
 * Per Claude Code hook schema (verified 2026-04-21 against
 * code.claude.com/docs/en/hooks §PreToolUse):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "PreToolUse",
 *       "permissionDecision": "deny",
 *       "permissionDecisionReason": "PlanGate: task 2.1 … is not yet PASS. …"
 *     }
 *   }
 * ALLOW is silent — zero bytes written to stdout. Exit code is ALWAYS 0
 * (blocking is expressed via permissionDecision, not via non-zero exit).
 *
 * EVENTS EMITTED (D5):
 * Every decide() call emits one event to
 * <projectRoot>/.plan-executor/events.jsonl:
 *   - plan.gate.allowed       (tool, task)
 *   - plan.gate.blocked       (tool, task, reason_code,
 *                              target_path? — only for state_file_write_attempt)
 *
 * FAIL-OPEN SEMANTICS:
 * Any unexpected exception inside decide() is caught by the wrapper's
 * try/catch and results in silent ALLOW (FR-3.17). A broken hook must
 * never wedge Claude Code — observability (events.jsonl) will surface
 * the problem without stopping work.
 *
 * HOW TO INVOKE OUT-OF-BAND (for smoke testing):
 *   echo '{"session_id":"s","transcript_path":"/tmp/x.jsonl",
 *          "hook_event_name":"PreToolUse","tool_name":"Write",
 *          "tool_input":{"file_path":"/tmp/x.txt","content":"x"}}' \
 *     | bun ~/.claude/hooks/PlanGate.hook.ts
 *   # No pointer → exit 0, no stdout.
 *   # Pointer + PENDING task → exit 0, JSON block envelope on stdout.
 *
 * SOURCE:
 *   github.com/DAESA24/plan-executor-tools-dev
 *   - src/PlanGate.hook.ts           (this wrapper)
 *   - src/handlers/PlanGateHandler.ts (decide() logic, inlined at build)
 *   Bundled via `bun build --target=bun` with handler + lib imports
 *   inlined into the deployed single file.
 */

import { readHookInput } from './lib/hook-io';
import { decide } from './handlers/PlanGateHandler';
import type { PreToolUseHookInput } from './lib/hook-types';

export async function runHook(): Promise<number> {
  try {
    const input = await readHookInput<PreToolUseHookInput>(500);
    const result = decide(input);
    if (result.hookSpecificOutput) {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: result.hookSpecificOutput })
      );
    }
    return 0;
  } catch {
    // Fail-open on any unexpected error (hook best practice).
    return 0;
  }
}

if (import.meta.main) {
  void runHook().then((code) => process.exit(code));
}
