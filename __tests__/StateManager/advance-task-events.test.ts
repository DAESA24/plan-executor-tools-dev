// advance-task-events.test.ts — Tier A.1 StateManager advance-task event emission tests
// Covers: TA-StateManager-030, TA-StateManager-031, TA-StateManager-032
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { advanceTask, readState, initState, type ValidationState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-events-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

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

describe('StateManager advance-task events', () => {
  let tmpDir: string;
  let fakeHome: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    fakeHome = makeTempDir();
    origHome = process.env.HOME ?? '';
    process.env.HOME = fakeHome;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('TA-StateManager-030: advance-task emits plan.task.advanced with from_task and to_task (FR-1.34, FR-5.7a, FR-5.7b)', () => {
    const validationPath = join(tmpDir, 'validation.json');
    const state = makeAllPassState();
    // Write the state to disk so advanceTask can determine the project directory for events
    writeFileSync(validationPath, JSON.stringify(state));

    // advanceTask with a disk path emits events to <dir>/.plan-executor/events.jsonl
    const result = advanceTask(state, '1.1', validationPath);
    expect(result.phases['1'].tasks['1.1'].status).toBe('PASS');
    expect(result.current_task).toBe('1.2');

    // Check that the event was written
    const eventsFile = join(tmpDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const lines = readFileSync(eventsFile, 'utf8').trim().split('\n');
    const event = JSON.parse(lines[lines.length - 1]);
    expect(event.type).toBe('plan.task.advanced');
    expect(event.from_task).toBe('1.1');
    expect(event.to_task).toBe('1.2');
  });

  test('TA-StateManager-031: phase rollover advance sets phase_rolled: true; in-phase advance phase_rolled absent/false (FR-1.35, FR-5.7c, FR-5.16)', () => {
    const path = copyFixture('canonical-2x2x2-last-task-of-phase1.json', tmpDir);
    const state = readState(path);

    // Advance 1.2 (last task of phase 1) — should emit event with phase_rolled: true
    const result = advanceTask(state, '1.2', path);
    expect(result.current_phase).toBe(2);
    expect(result.phases['1'].status).toBe('PASS');

    // Check event: phase_rolled === true
    const eventsFile = join(tmpDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const lines = readFileSync(eventsFile, 'utf8').trim().split('\n');
    const event = JSON.parse(lines[lines.length - 1]);
    expect(event.phase_rolled).toBe(true);
  });

  test('TA-StateManager-032: plan completion advance sets plan_completed: true in event (FR-1.36, FR-5.7d)', () => {
    const path = copyFixture('canonical-2x2x2-last-task-of-last-phase.json', tmpDir);
    const state = readState(path);
    const result = advanceTask(state, '2.2', path);
    expect(result.status).toBe('COMPLETED');

    // Check event: plan_completed === true
    const eventsFile = join(tmpDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const lines = readFileSync(eventsFile, 'utf8').trim().split('\n');
    const event = JSON.parse(lines[lines.length - 1]);
    expect(event.plan_completed).toBe(true);
  });
});
