#!/usr/bin/env bun
/*!
 * PlanGate.hook.ts — Plan Executor Tools: PreToolUse hook wrapper
 *
 * Claude Code PreToolUse hook that enforces plan discipline. When a
 * plan is active (pointer present), blocks Bash/Edit/Write tool calls
 * unless the current task's criteria have all PASSed or the call is an
 * allow-listed StateManager/CheckRunner invocation. No pointer → silent
 * ALLOW. One of three components — StateManager, CheckRunner,
 * PlanGate.hook (this).
 *
 * Thin I/O wrapper per D3 handler-delegate pattern: stdin → decide() →
 * stdout. All decision logic lives in handlers/PlanGateHandler.ts and
 * is inlined at build time into the deployed single file.
 *
 * Registration: in ~/.claude/settings.json, append AFTER SecurityValidator
 * on the Bash, Edit, and Write PreToolUse matchers (D12).
 *
 * Smoke test:
 *   echo '{"session_id":"s","transcript_path":"/tmp/x.jsonl",
 *          "hook_event_name":"PreToolUse","tool_name":"Bash",
 *          "tool_input":{"command":"echo hi"}}' \
 *     | bun ~/.claude/hooks/PlanGate.hook.ts
 *   # exit 0 always; silent = ALLOW, JSON envelope on stdout = BLOCK.
 *
 * Full reference: docs/plan-gate.md
 * Source: github.com/DAESA24/plan-executor-tools-dev
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
