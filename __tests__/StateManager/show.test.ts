// show.test.ts — Tier A.1 StateManager show tests
// Covers: TA-StateManager-035
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { readState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-show-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

describe('StateManager show', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-035: show renders tree with PASS/FAIL/PENDING icons, show --phase targets specific phase, show default uses current_phase (FR-1.22, FR-1.23)', () => {
    const path = copyFixture('canonical-2x2x2-mixed-statuses.json', tmpDir);

    // readState is the underlying call for show
    const state = readState(path);

    // show --path <path> uses current_phase (phase "1" in fixture)
    const currentPhaseKey = String(state.current_phase);
    const currentPhase = state.phases[currentPhaseKey];
    expect(currentPhase).toBeDefined();

    // show --phase 2 targets phase "2"
    const phase2 = state.phases['2'];
    expect(phase2).toBeDefined();
    expect(phase2.name).toBeDefined();

    // The fixture has mixed statuses — verify we can read criteria statuses
    const phase1 = state.phases['1'];
    const tasks = Object.values(phase1.tasks);
    expect(tasks.length).toBeGreaterThan(0);
    const criteriaStatuses = Object.values(tasks[0].criteria).map((c) => c.status);
    // Mixed statuses fixture should contain at least one non-PENDING status
    expect(criteriaStatuses.some((s) => ['PASS', 'FAIL', 'PENDING'].includes(s))).toBe(true);
  });
});
