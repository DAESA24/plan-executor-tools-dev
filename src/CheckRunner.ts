#!/usr/bin/env bun
// CheckRunner.ts — STUB (Phase 5.1 red phase).
// Real implementation is Phase 5.2. Every exported function throws
// "not implemented"; tests written against the green contract will fail.

import {
  readState,
  writeState,
  updateCriterion,
  advanceTask,
  findCurrentCriterion,
  StateManagerError,
  ChecksumError,
  PreconditionError,
  TargetNotFoundError,
  type ValidationState,
  type Criterion,
} from './StateManager';
import { appendEvent } from './lib/event-emitter';

export type ManualPromptStrategy = 'stdin' | 'askuser';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface RunOptions {
  path: string;
  task?: string;
  dryRun?: boolean;
  manualPromptStrategy?: ManualPromptStrategy;
  answer?: string;
  json?: boolean;
  verbose?: boolean;
  // Dependency injection for unit tests.
  exec?: (cmd: string, opts: { timeoutMs: number }) => ExecResult;
  stdinReadLine?: () => string;
  writeStateOverride?: (path: string, state: ValidationState) => void;
}

export interface CriterionResult {
  id: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

export interface AskUserPayload {
  exit_reason: 'manual_criterion_needs_askuser';
  task: string;
  criterion: string;
  prompt: string;
  resume_command: string;
}

export interface RunResult {
  task: string;
  results: CriterionResult[];
  summary: { passed: number; failed: number; manual: number };
  advanced: boolean;
  exitCode: number;
  askUserPayload?: AskUserPayload;
  stdoutLines: string[];
  stderrLines: string[];
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const TIMEOUT_ENV_VAR = 'CHECKRUNNER_TIMEOUT_MS';

export function getDefaultTimeoutMs(): number {
  const raw = process.env[TIMEOUT_ENV_VAR];
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

export function runShellCommand(_cmd: string, _opts: { timeoutMs: number }): ExecResult {
  throw new Error('not implemented');
}

export function classifyAutomatedResult(
  _exec: ExecResult
): { status: 'PASS' | 'FAIL'; evidence: string } {
  throw new Error('not implemented');
}

export function run(_options: RunOptions): RunResult {
  throw new Error('not implemented');
}

// Re-export for tests that want to verify StateManager is imported as a module.
export {
  readState,
  writeState,
  updateCriterion,
  advanceTask,
  findCurrentCriterion,
  StateManagerError,
  ChecksumError,
  PreconditionError,
  TargetNotFoundError,
  appendEvent,
};

if (import.meta.main) {
  throw new Error('CheckRunner CLI not implemented (Phase 5.2)');
}
