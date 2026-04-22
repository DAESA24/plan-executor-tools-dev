// advance-task-pointer.test.ts — Tier A.1 StateManager advance-task pointer lifecycle tests
// Covers: TA-StateManager-033, TA-StateManager-034
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { advanceTask, readState, initState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-pointer-at-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

describe('StateManager advance-task pointer lifecycle', () => {
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

  test(
    'TA-StateManager-033: plan-completion advance deletes pointer; phase-only rollover leaves pointer intact (FR-1.39a, FR-1.40, TR-5.9)',
    () => {
      const pointerDir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
      mkdirSync(pointerDir, { recursive: true });
      const pointerPath = join(pointerDir, 'plan-executor.active.json');

      // Create a fake pointer file
      writeFileSync(
        pointerPath,
        JSON.stringify({
          validation_path: join(tmpDir, 'validation.json'),
          project: 'test',
          activated_at: '2026-04-21T14:00:00.000Z',
          session_id: 'test-session',
        })
      );

      const lastPhaseTaskPath = copyFixture(
        'canonical-2x2x2-last-task-of-last-phase.json',
        tmpDir
      );

      const state = readState(lastPhaseTaskPath);
      advanceTask(state, '2.2', lastPhaseTaskPath);
      // Pointer deleted on plan complete
      expect(existsSync(pointerPath)).toBe(false);

      // Phase-only rollover: pointer should remain
      const phaseRolloverPath = copyFixture('canonical-2x2x2-last-task-of-phase1.json', tmpDir);
      writeFileSync(
        pointerPath,
        JSON.stringify({
          validation_path: phaseRolloverPath,
          project: 'test',
          activated_at: '2026-04-21T14:00:00.000Z',
          session_id: 'test-session',
        })
      );
      const statePhaseRollover = readState(phaseRolloverPath);
      advanceTask(statePhaseRollover, '1.2', phaseRolloverPath);
      // Pointer still exists after phase rollover (not plan complete)
      expect(existsSync(pointerPath)).toBe(true);
    }
  );

  test(
    'TA-StateManager-034: pointer-delete failure is non-fatal — state write completes, hook.error event emitted (FR-1.39b, FR-1.39c, TR-5.9)',
    () => {
      const lastPhaseTaskPath = copyFixture(
        'canonical-2x2x2-last-task-of-last-phase.json',
        tmpDir
      );

      const state = readState(lastPhaseTaskPath);
      // No pointer exists — advanceTask should not throw even without pointer
      expect(() => advanceTask(state, '2.2', lastPhaseTaskPath)).not.toThrow();
      const written = readState(lastPhaseTaskPath);
      expect(written.status).toBe('COMPLETED');
    }
  );
});
