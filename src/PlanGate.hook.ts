#!/usr/bin/env bun
// PlanGate.hook.ts — STUB thin wrapper (Phase 6.1 red phase).
// Production deploy path: ~/.claude/hooks/PlanGate.hook.ts
// At deploy time, readHookInput is imported from ~/.claude/hooks/lib/hook-io
// (PAI-shipped). For dev/test, we use the project-local shim at ./lib/hook-io.
//
// Per D3 handler-delegate pattern: this wrapper reads stdin, calls
// PlanGateHandler.decide(input), prints JSON output, exits 0.
// Real implementation is Phase 6.2.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { readHookInput } from './lib/hook-io';
import { decide } from './handlers/PlanGateHandler';

export async function runHook(): Promise<number> {
  throw new Error('not implemented');
}

if (import.meta.main) {
  throw new Error('PlanGate.hook.ts CLI not implemented (Phase 6.2)');
}
