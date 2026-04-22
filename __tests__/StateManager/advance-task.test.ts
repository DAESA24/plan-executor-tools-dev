// advance-task.test.ts — Tier A.1 StateManager advance-task tests
// Covers: TA-StateManager-022 through TA-StateManager-029
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import {
  advanceTask,
  readState,
  PreconditionError,
  TargetNotFoundError,
  type ValidationState,
} from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-at-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

// Inline minimal state with all criteria PASS
function makeAllPassState(): ValidationState {
  return {
    plan: 'test.md',
    project: 'test',
    status: 'IN_PROGRESS',
    plan_checksum: null,
    initialized: null,
    current_phase: 1,
    current_task: '1.1',
    phases: {
      '1': {
        name: 'Phase One',
        status: 'IN_PROGRESS',
        tasks: {
          '1.1': {
            name: 'Task 1.1',
            status: 'IN_PROGRESS',
            verified_at: null,
            fix_attempts: 0,
            criteria: {
              '1': {
                check: 'Criterion 1',
                type: 'automated',
                command: 'echo PASS',
                status: 'PASS',
                evidence: 'PASS',
              },
              '2': {
                check: 'Criterion 2',
                type: 'automated',
                command: 'echo PASS',
                status: 'PASS',
                evidence: 'PASS',
              },
            },
          },
          '1.2': {
            name: 'Task 1.2',
            status: 'PENDING',
            verified_at: null,
            fix_attempts: 0,
            criteria: {
              '1': {
                check: 'Criterion 1',
                type: 'automated',
                command: 'echo PASS',
                status: 'PENDING',
                evidence: '',
              },
            },
          },
        },
      },
    },
  };
}

describe('StateManager advance-task', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-022: advanceTask flips task to PASS only when all criteria are PASS (FR-1.15a, FR-1.15b, FR-1.28f)', () => {
    const allPassState = makeAllPassState();
    const result = advanceTask(allPassState, '1.1');
    expect(result.phases['1'].tasks['1.1'].status).toBe('PASS');
  });

  test('TA-StateManager-023: when task flips to PASS, verified_at is set to valid ISO-8601 UTC string (FR-1.16a, FR-1.16b)', () => {
    const state = makeAllPassState();
    const result = advanceTask(state, '1.1');
    expect(result.phases['1'].tasks['1.1'].verified_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  test('TA-StateManager-024: advancing 2.2 sets current_task to 2.10 (dotted-numeric, not lexicographic) (FR-1.17a, FR-1.17b)', () => {
    // Inline state: phase 2 with tasks 2.1 (PASS), 2.2 (all-PASS criteria), 2.10 (PENDING)
    // Verifies dotted-numeric sort: 2.1 < 2.2 < 2.10 (not lexicographic 2.1 < 2.10 < 2.2)
    const state: ValidationState = {
      plan: 'test.md',
      project: 'test',
      status: 'IN_PROGRESS',
      plan_checksum: null,
      initialized: null,
      current_phase: 2,
      current_task: '2.2',
      phases: {
        '2': {
          name: 'Phase Two',
          status: 'IN_PROGRESS',
          tasks: {
            '2.1': {
              name: 'Task 2.1',
              status: 'PASS',
              verified_at: '2026-04-21T00:00:00.000Z',
              fix_attempts: 0,
              criteria: {
                '1': { check: 'c', type: 'automated', command: 'echo', status: 'PASS', evidence: 'PASS' },
              },
            },
            '2.2': {
              name: 'Task 2.2',
              status: 'IN_PROGRESS',
              verified_at: null,
              fix_attempts: 0,
              criteria: {
                '1': { check: 'c', type: 'automated', command: 'echo', status: 'PASS', evidence: 'PASS' },
              },
            },
            '2.10': {
              name: 'Task 2.10',
              status: 'PENDING',
              verified_at: null,
              fix_attempts: 0,
              criteria: {
                '1': { check: 'c', type: 'automated', command: 'echo', status: 'PENDING', evidence: '' },
              },
            },
          },
        },
      },
    };
    const result = advanceTask(state, '2.2');
    // Dotted-numeric sort: 2.1 < 2.2 < 2.10, so next task after 2.2 is 2.10 (not lexicographic)
    expect(result.current_task).toBe('2.10');
  });

  test('TA-StateManager-025: advancing last task of phase 1 sets current_task to first task of phase 2, increments current_phase (FR-1.18a, FR-1.18b, FR-1.19)', () => {
    const path = copyFixture('canonical-2x2x2-last-task-of-phase1.json', tmpDir);
    const state = readState(path);
    const result = advanceTask(state, '1.2');
    expect(result.current_phase).toBe(2);
    expect(result.current_task).toBe('2.1');
    expect(result.phases['1'].status).toBe('PASS');
  });

  test('TA-StateManager-026: advancing last task of last phase sets top-level status to COMPLETED, plan_complete: true in JSON response (FR-1.20a, FR-1.20b)', () => {
    const path = copyFixture('canonical-2x2x2-last-task-of-last-phase.json', tmpDir);
    const state = readState(path);
    const result = advanceTask(state, '2.2');
    expect(result.status).toBe('COMPLETED');
  });

  test('TA-StateManager-027: advance-task on non-PASS criteria exits 1 with E_CRITERIA_INCOMPLETE listing non-PASS ids (FR-1.21a, FR-1.21b, FR-1.21c)', () => {
    const path = copyFixture('canonical-2x2x2-one-fail.json', tmpDir);
    const state = readState(path);
    try {
      advanceTask(state, '1.1');
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(PreconditionError);
      expect((err as PreconditionError).code).toBe('E_CRITERIA_INCOMPLETE');
    }
  });

  test('TA-StateManager-028: advance-task --task 9.9 errors with E_TARGET_NOT_FOUND (FR-1.21d)', () => {
    const state = makeAllPassState();
    expect(() => advanceTask(state, '9.9')).toThrow(TargetNotFoundError);
  });

  test('TA-StateManager-029: advanceTask is pure — no fs calls, returns new state, input state unchanged (FR-1.29b, FR-1.29d)', () => {
    const state = makeAllPassState();
    const stateBefore = JSON.stringify(state);

    const result = advanceTask(state, '1.1');
    // Input state unchanged
    expect(JSON.stringify(state)).toBe(stateBefore);
    // Returns new object reference
    expect(result).not.toBe(state);
  });
});
