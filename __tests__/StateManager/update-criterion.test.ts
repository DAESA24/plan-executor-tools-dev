// update-criterion.test.ts — Tier A.1 StateManager update-criterion tests
// Covers: TA-StateManager-011 through TA-StateManager-021
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import {
  updateCriterion,
  readState,
  writeState,
  TargetNotFoundError,
  type ValidationState,
} from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-uc-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

// Inline minimal state for pure function tests
function makeInlineState(): ValidationState {
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
        status: 'PENDING',
        tasks: {
          '1.1': {
            name: 'Task 1.1',
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
              '2': {
                check: 'Criterion 2',
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

describe('StateManager update-criterion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-011: update-criterion flips criterion status to PASS in returned state (FR-1.9, FR-1.28e)', () => {
    const state = makeInlineState();
    const result = updateCriterion(state, '1.1', '1', 'PASS', 'PASS output');
    expect(result.phases['1'].tasks['1.1'].criteria['1'].status).toBe('PASS');
    expect(result.phases['1'].tasks['1.1'].criteria['1'].evidence).toBe('PASS output');
  });

  test('TA-StateManager-012: updating first criterion of PENDING task transitions task to IN_PROGRESS (FR-1.10a)', () => {
    const state = makeInlineState();
    const result = updateCriterion(state, '1.1', '1', 'PASS', '');
    expect(result.phases['1'].tasks['1.1'].status).toBe('IN_PROGRESS');
  });

  test('TA-StateManager-013: updating criterion under already IN_PROGRESS task does not re-transition task status (FR-1.10b)', () => {
    const path = copyFixture('canonical-2x2x2-in-progress.json', tmpDir);
    const state = readState(path);
    const result = updateCriterion(state, '1.1', '2', 'PASS', '');
    expect(result.phases['1'].tasks['1.1'].status).toBe('IN_PROGRESS');
  });

  test('TA-StateManager-014: --status FAIL increments fix_attempts by exactly 1 per call (FR-1.11)', () => {
    const state = makeInlineState();
    const result = updateCriterion(state, '1.1', '1', 'FAIL', 'failed');
    expect(result.phases['1'].tasks['1.1'].fix_attempts).toBe(1);
    const result2 = updateCriterion(result, '1.1', '1', 'FAIL', 'failed again');
    expect(result2.phases['1'].tasks['1.1'].fix_attempts).toBe(2);
  });

  test('TA-StateManager-015: --evidence - reads evidence from stdin, preserving internal newlines (FR-1.12a)', () => {
    const state = makeInlineState();
    const multiLineEvidence = 'line 1\nline 2\nline 3';
    const result = updateCriterion(state, '1.1', '1', 'PASS', multiLineEvidence);
    expect(result.phases['1'].tasks['1.1'].criteria['1'].evidence).toBe(multiLineEvidence);
  });

  test('TA-StateManager-016: when --evidence omitted, evidence field is empty string not null (FR-1.12b)', () => {
    const state = makeInlineState();
    const result = updateCriterion(state, '1.1', '1', 'PASS', '');
    expect(result.phases['1'].tasks['1.1'].criteria['1'].evidence).toBe('');
    expect(result.phases['1'].tasks['1.1'].criteria['1'].evidence).not.toBeNull();
  });

  test('TA-StateManager-017: --task 9.9 errors with E_TARGET_NOT_FOUND on nonexistent task (FR-1.13)', () => {
    const state = makeInlineState();
    expect(() => updateCriterion(state, '9.9', '1', 'PASS', '')).toThrow(TargetNotFoundError);
    try { updateCriterion(state, '9.9', '1', 'PASS', ''); }
    catch (err) { expect((err as TargetNotFoundError).code).toBe('E_TARGET_NOT_FOUND'); }
  });

  test('TA-StateManager-018: --criterion 99 errors with E_TARGET_NOT_FOUND when task resolves but criterion does not (FR-1.14a)', () => {
    const state = makeInlineState();
    expect(() => updateCriterion(state, '1.1', '99', 'PASS', '')).toThrow(TargetNotFoundError);
  });

  test('TA-StateManager-019: --status BOGUS errors with E_INVALID_STATUS and does not write (FR-1.14b)', () => {
    const state = makeInlineState();
    // TypeScript would normally catch invalid status at compile time, but runtime
    // validation is still required for CLI callers.
    expect(() => updateCriterion(state, '1.1', '1', 'BOGUS' as any, '')).toThrow();
    try { updateCriterion(state, '1.1', '1', 'BOGUS' as any, ''); }
    catch (err) { expect((err as any).code).toBe('E_INVALID_STATUS'); }
  });

  test('TA-StateManager-020: updateCriterion is pure — no fs calls, returns fresh state, input state unchanged (FR-1.29a, FR-1.29c)', () => {
    const state = makeInlineState();
    const stateBefore = JSON.stringify(state);

    const result = updateCriterion(state, '1.1', '1', 'PASS', '');
    // Input state unchanged
    expect(JSON.stringify(state)).toBe(stateBefore);
    // Returns new object (not the same reference)
    expect(result).not.toBe(state);
  });

  test('TA-StateManager-021: update-criterion does NOT implicitly call advanceTask — task stays IN_PROGRESS when last criterion becomes PASS (FR-1.37)', () => {
    // Make a state where task has two criteria, both will be PASS after update
    const state = makeInlineState();
    const stateAfter1 = updateCriterion(state, '1.1', '1', 'PASS', '');
    const stateAfter2 = updateCriterion(stateAfter1, '1.1', '2', 'PASS', '');
    // Task should still be IN_PROGRESS — not PASS (advance-task does that)
    expect(stateAfter2.phases['1'].tasks['1.1'].status).toBe('IN_PROGRESS');
    expect(stateAfter2.current_task).toBe('1.1'); // current_task unchanged
  });
});
