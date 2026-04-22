#!/usr/bin/env bun
// StateManager.ts — STUB (Phase 4.1 red phase).
// Every exported function throws "not implemented" — tests must fail.
// Real implementation is Phase 4.2 (green phase).

import type {
  ValidationState,
  CriterionStatus,
  TaskStatus,
  PhaseStatus,
  Criterion,
  Task,
  Phase,
} from './lib/state-types';

export type { CriterionStatus, TaskStatus, PhaseStatus, Criterion, Task, Phase, ValidationState };

// ── Error hierarchy ──────────────────────────────────────────────────────────

export class StateManagerError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'StateManagerError';
    this.code = code;
  }
}

export class SchemaError extends StateManagerError {
  constructor(message: string, code = 'E_SCHEMA') {
    super(message, code);
    this.name = 'SchemaError';
  }
}

export class ChecksumError extends StateManagerError {
  constructor(message: string) {
    super(message, 'E_CHECKSUM_DRIFT');
    this.name = 'ChecksumError';
  }
}

export class TargetNotFoundError extends StateManagerError {
  constructor(message: string) {
    super(message, 'E_TARGET_NOT_FOUND');
    this.name = 'TargetNotFoundError';
  }
}

export class PreconditionError extends StateManagerError {
  nonPassCriteria?: string[];
  constructor(message: string, nonPassCriteria?: string[]) {
    super(message, 'E_CRITERIA_INCOMPLETE');
    this.name = 'PreconditionError';
    this.nonPassCriteria = nonPassCriteria;
  }
}

export class IOError extends StateManagerError {
  constructor(message: string) {
    super(message, 'E_WRITE');
    this.name = 'IOError';
  }
}

// ── Programmatic API stubs ───────────────────────────────────────────────────

export function readState(_path: string): ValidationState {
  throw new Error('not implemented');
}

export function writeState(_path: string, _state: ValidationState): void {
  throw new Error('not implemented');
}

export function initState(_path: string): ValidationState {
  throw new Error('not implemented');
}

export function computePlanChecksum(_state: ValidationState): string {
  throw new Error('not implemented');
}

export function updateCriterion(
  _state: ValidationState,
  _taskId: string,
  _criterionId: string,
  _status: 'PASS' | 'FAIL',
  _evidence: string
): ValidationState {
  throw new Error('not implemented');
}

export function advanceTask(_state: ValidationState, _taskId: string): ValidationState {
  throw new Error('not implemented');
}

export function findCurrentCriterion(_state: ValidationState): {
  phaseId: string;
  taskId: string;
  criterion: Criterion | null;
  criterionId: string | null;
} {
  throw new Error('not implemented');
}

// ── CLI entry point (stub) ───────────────────────────────────────────────────

if (import.meta.main) {
  throw new Error('StateManager CLI not implemented');
}
