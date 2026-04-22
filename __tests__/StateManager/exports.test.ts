// exports.test.ts — Tier A.1 StateManager exports tests
// Covers: TA-StateManager-041, TA-StateManager-042, TA-StateManager-043
// Tests must FAIL (red phase) — although type exports exist, function stubs throw.

import { describe, test, expect } from 'bun:test';

import {
  readState,
  writeState,
  initState,
  computePlanChecksum,
  updateCriterion,
  advanceTask,
  findCurrentCriterion,
  StateManagerError,
  SchemaError,
  ChecksumError,
  TargetNotFoundError,
  PreconditionError,
  IOError,
  type CriterionStatus,
  type TaskStatus,
  type PhaseStatus,
  type Criterion,
  type Task,
  type Phase,
  type ValidationState,
} from '../../src/StateManager';

describe('StateManager exports', () => {
  test('TA-StateManager-041: StateManager exports 7 function symbols with correct names (FR-1.28a, FR-1.28b, FR-1.28c, FR-1.28d, FR-1.28e, FR-1.28f, FR-1.28g)', () => {
    // Verify all 7 functions are exported and callable (even though they throw)
    expect(typeof readState).toBe('function');
    expect(typeof writeState).toBe('function');
    expect(typeof initState).toBe('function');
    expect(typeof computePlanChecksum).toBe('function');
    expect(typeof updateCriterion).toBe('function');
    expect(typeof advanceTask).toBe('function');
    expect(typeof findCurrentCriterion).toBe('function');

    // Verify each throws "not implemented" (stub behavior — red phase)
    expect(() => readState('/nonexistent')).toThrow('not implemented');
    expect(() => writeState('/nonexistent', {} as ValidationState)).toThrow('not implemented');
    expect(() => initState('/nonexistent')).toThrow('not implemented');
    expect(() => computePlanChecksum({} as ValidationState)).toThrow('not implemented');
    expect(() => updateCriterion({} as ValidationState, '', '', 'PASS', '')).toThrow(
      'not implemented'
    );
    expect(() => advanceTask({} as ValidationState, '')).toThrow('not implemented');
    expect(() => findCurrentCriterion({} as ValidationState)).toThrow('not implemented');
  });

  test('TA-StateManager-042: StateManager exports StateManagerError and 5 subclasses all extending StateManagerError via instanceof (FR-1.28h, FR-1.28i)', () => {
    // Verify error classes are exported
    expect(typeof StateManagerError).toBe('function');
    expect(typeof SchemaError).toBe('function');
    expect(typeof ChecksumError).toBe('function');
    expect(typeof TargetNotFoundError).toBe('function');
    expect(typeof PreconditionError).toBe('function');
    expect(typeof IOError).toBe('function');

    // Verify inheritance via instanceof
    const schemaErr = new SchemaError('test');
    expect(schemaErr).toBeInstanceOf(SchemaError);
    expect(schemaErr).toBeInstanceOf(StateManagerError);
    expect(schemaErr).toBeInstanceOf(Error);

    const checksumErr = new ChecksumError('test');
    expect(checksumErr).toBeInstanceOf(ChecksumError);
    expect(checksumErr).toBeInstanceOf(StateManagerError);

    const targetErr = new TargetNotFoundError('test');
    expect(targetErr).toBeInstanceOf(TargetNotFoundError);
    expect(targetErr).toBeInstanceOf(StateManagerError);

    const precondErr = new PreconditionError('test');
    expect(precondErr).toBeInstanceOf(PreconditionError);
    expect(precondErr).toBeInstanceOf(StateManagerError);

    const ioErr = new IOError('test');
    expect(ioErr).toBeInstanceOf(IOError);
    expect(ioErr).toBeInstanceOf(StateManagerError);

    // Verify .code property is set on StateManagerError and subclasses
    expect(schemaErr.code).toBe('E_SCHEMA');
    expect(checksumErr.code).toBe('E_CHECKSUM_DRIFT');
    expect(targetErr.code).toBe('E_TARGET_NOT_FOUND');
    expect(precondErr.code).toBe('E_CRITERIA_INCOMPLETE');
    expect(ioErr.code).toBe('E_WRITE');
  });

  test('TA-StateManager-043: StateManager exports TypeScript types CriterionStatus, TaskStatus, PhaseStatus, Criterion, Task, Phase, ValidationState (FR-1.28j)', () => {
    // Type-level assertions: if these type imports compile, the types are exported.
    // At runtime, TypeScript types erase to nothing, so we verify by using them in
    // a type assertion that would fail at compile time if they were missing.

    // Compile-time type checks (these pass when types are correctly exported):
    const checkCriterionStatus: CriterionStatus = 'PENDING';
    const checkTaskStatus: TaskStatus = 'IN_PROGRESS';
    const checkPhaseStatus: PhaseStatus = 'PASS';

    expect(checkCriterionStatus).toBe('PENDING');
    expect(checkTaskStatus).toBe('IN_PROGRESS');
    expect(checkPhaseStatus).toBe('PASS');

    // Type-check a Criterion object shape (compile-time only):
    const checkCriterion: Criterion = {
      check: 'test',
      type: 'automated',
      command: 'echo PASS',
      status: 'PENDING',
      evidence: '',
    };
    expect(checkCriterion.check).toBe('test');

    // Type-check a ValidationState shape:
    const checkState: ValidationState = {
      plan: 'test.md',
      project: 'test',
      status: 'IN_PROGRESS',
      plan_checksum: null,
      initialized: null,
      current_phase: 1,
      current_task: '1.1',
      phases: {},
    };
    expect(checkState.plan).toBe('test.md');
  });
});
