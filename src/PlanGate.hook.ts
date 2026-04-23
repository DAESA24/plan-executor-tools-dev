#!/usr/bin/env bun
// PlanGate.hook.ts — PreToolUse hook wrapper (thin I/O layer per D3).
// Deploy path: ~/.claude/hooks/PlanGate.hook.ts
//
// Reads stdin via readHookInput, delegates to PlanGateHandler.decide, and
// emits a JSON envelope only on BLOCK. Silent on ALLOW. Always exits 0.

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
