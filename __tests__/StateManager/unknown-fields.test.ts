// unknown-fields.test.ts — Tier A.1 StateManager unknown-field preservation tests
// Covers: TA-StateManager-044, TA-StateManager-045, TA-StateManager-046
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { readState, writeState, updateCriterion } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-uf-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

describe('StateManager unknown-field preservation (D11)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-044: top-level unknown field "iteration_count: 3" preserved after readState → updateCriterion → writeState (FR-1.30a, TR-10.4)', () => {
    const path = copyFixture('canonical-2x2x2-with-unknown-toplevel.json', tmpDir);

    const state = readState(path);
    expect((state as any).iteration_count).toBe(3);
    const updated = updateCriterion(state, '1.1', '1', 'PASS', '');
    writeState(path, updated);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.iteration_count).toBe(3); // preserved verbatim
  });

  test('TA-StateManager-045: unknown fields on phase, task, and criterion all survive read-merge-write cycle (FR-1.30b)', () => {
    const path = copyFixture('canonical-2x2x2-with-unknown-nested.json', tmpDir);

    const state = readState(path);
    const updated = updateCriterion(state, '1.1', '1', 'PASS', '');
    writeState(path, updated);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.phases['1'].custom_phase_field).toBe('phase_value');
    expect(written.phases['1'].tasks['1.1'].custom_task_field).toBe('task_value');
    expect(written.phases['1'].tasks['1.1'].criteria['1'].custom_criterion_field).toBe('criterion_value');
  });

  test('TA-StateManager-046: criterion with status "SKIPPED" (unknown enum) preserved as-is through round-trip (FR-1.30c)', () => {
    const path = copyFixture('canonical-2x2x2-unknown-enum.json', tmpDir);

    // readState must not throw on unknown status values; value preserved through round-trip
    const state = readState(path);
    writeState(path, state);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.phases['1'].tasks['1.1'].criteria['1'].status).toBe('SKIPPED');
  });
});
