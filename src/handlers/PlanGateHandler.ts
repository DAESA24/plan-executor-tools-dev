// PlanGateHandler.ts — STUB (Phase 6.1 red phase).
// Pure decision function per D3 handler-delegate pattern. Real impl is Phase 6.2.

import {
  readState,
  findCurrentCriterion,
  ChecksumError,
  SchemaError,
  StateManagerError,
  type ValidationState,
} from '../StateManager';
import { appendEvent } from '../lib/event-emitter';
import type {
  PreToolUseHookInput,
  DecisionResult,
  ReasonCode,
} from '../lib/hook-types';

export type { PreToolUseHookInput, DecisionResult, ReasonCode };

export function decide(_input: PreToolUseHookInput): DecisionResult {
  throw new Error('not implemented');
}

// Re-export for tests that want to verify imports by AST inspection.
export { readState, findCurrentCriterion, ChecksumError, SchemaError, StateManagerError, appendEvent };
