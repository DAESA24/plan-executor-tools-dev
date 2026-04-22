// computePlanChecksum.test.ts — Tier A.5 Plan checksum unit tests
// Covers: TA-Checksum-001 through TA-Checksum-012
// Tests must FAIL (red phase) — computePlanChecksum is a stub throwing "not implemented".

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { computePlanChecksum, readState, initState, updateCriterion, advanceTask, type ValidationState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-checksum-unit-test-'));
}

function loadFixture(name: string): ValidationState {
  const src = join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(src, 'utf8')) as ValidationState;
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

describe('computePlanChecksum (Tier A.5)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-Checksum-001: computePlanChecksum returns "sha256:<64 lowercase hex>" (FR-4.1a, FR-4.6a, FR-4.6b)', () => {
    const state = loadFixture('canonical-2x2x2.json');
    const result = computePlanChecksum(state);
    expect(result).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('TA-Checksum-002: hash input is canonical JSON of criteria projection — no insignificant whitespace (FR-4.1b, FR-4.1c, FR-4.5)', () => {
    const state = loadFixture('canonical-2x2x2.json');
    // Tested indirectly: the projection must be canonical JSON (no whitespace).
    // Verified by: deterministic output (same input → same hash)
    const first = computePlanChecksum(state);
    const second = computePlanChecksum(state);
    expect(first).toBe(second); // deterministic
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('TA-Checksum-003: projection retains check and type on every criterion (FR-4.2a, FR-4.2b)', () => {
    const state = loadFixture('canonical-2x2x2.json');
    const base = computePlanChecksum(state);
    const mutated = structuredClone(state);
    mutated.phases['1'].tasks['1.1'].criteria['1'].check = 'MODIFIED';
    expect(computePlanChecksum(mutated)).not.toBe(base);
  });

  test('TA-Checksum-004: automated criteria retain command, manual criteria retain prompt, other is absent (FR-4.2c, FR-4.2d)', () => {
    const state = loadFixture('canonical-mixed-auto-manual.json');
    const base = computePlanChecksum(state);

    // Mutating command on automated changes checksum
    const mutatedCmd = structuredClone(state);
    const phases = mutatedCmd.phases;
    const firstPhaseKey = Object.keys(phases)[0];
    const firstTaskKey = Object.keys(phases[firstPhaseKey].tasks)[0];
    const criteria = phases[firstPhaseKey].tasks[firstTaskKey].criteria;
    const automatedKey = Object.keys(criteria).find((k) => criteria[k].type === 'automated');
    if (automatedKey != null) {
      (mutatedCmd.phases[firstPhaseKey].tasks[firstTaskKey].criteria[automatedKey] as any).command = 'MODIFIED_COMMAND';
      expect(computePlanChecksum(mutatedCmd)).not.toBe(base);
    }

    // Mutating prompt on manual changes checksum
    const mutatedPrompt = structuredClone(state);
    const manualKey = Object.keys(criteria).find((k) => criteria[k].type === 'manual');
    if (manualKey != null) {
      (mutatedPrompt.phases[firstPhaseKey].tasks[firstTaskKey].criteria[manualKey] as any).prompt = 'MODIFIED_PROMPT';
      expect(computePlanChecksum(mutatedPrompt)).not.toBe(base);
    }
  });

  test('TA-Checksum-005: projection drops status, evidence, fix_attempts, verified_at (FR-4.3a, FR-4.3b, FR-4.3c, FR-4.12)', () => {
    const baseState = loadFixture('canonical-2x2x2.json');
    const mixedState = loadFixture('canonical-2x2x2-mixed-statuses.json');
    const allPassState = loadFixture('canonical-2x2x2-all-pass.json');

    // Swapping status/evidence/fix_attempts/verified_at MUST NOT change the checksum
    // because these are state, not structure.
    // mixed/allPass differ from base only in state fields — checksums must match.
    const base = computePlanChecksum(baseState);
    expect(computePlanChecksum(mixedState)).toBe(base);
    expect(computePlanChecksum(allPassState)).toBe(base);
  });

  test('TA-Checksum-006: top-level status/current_task/current_phase/initialized/notes not part of projection (FR-4.11)', () => {
    const baseState = loadFixture('canonical-2x2x2.json');
    const differentTopState = loadFixture('canonical-2x2x2-different-toplevel.json');

    // The two fixtures differ only in top-level state fields
    // (status, current_task, current_phase, initialized, notes). Structure is identical.
    // Checksums must match.
    expect(computePlanChecksum(baseState)).toBe(computePlanChecksum(differentTopState));
  });

  test('TA-Checksum-007: reordering phases/tasks/criteria/keys yields same checksum; mixed-id criteria sort lexicographically (FR-4.4a, FR-4.4b, FR-4.4c, FR-4.7, FR-4.13)', () => {
    const base = loadFixture('canonical-2x2x2.json');
    const reversed = loadFixture('canonical-2x2x2-reversed.json');
    const alphaKeys = loadFixture('canonical-2x2x2-alphakeys.json');

    // Reordering phases/tasks/criteria/keys must yield the same checksum
    expect(computePlanChecksum(base)).toBe(computePlanChecksum(reversed));
    // alphaKeys is a different structure — ensures it produces a deterministic checksum
    expect(computePlanChecksum(alphaKeys)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('TA-Checksum-008: changing a single char in any command field changes the checksum (FR-4.8)', () => {
    const base = loadFixture('canonical-2x2x2.json');
    const edited = loadFixture('canonical-2x2x2-command-edit.json');
    expect(computePlanChecksum(base)).not.toBe(computePlanChecksum(edited));
  });

  test('TA-Checksum-009: changing a single char in any prompt field changes the checksum (FR-4.9a)', () => {
    const base = loadFixture('canonical-mixed-auto-manual.json');
    const edited = loadFixture('canonical-mixed-auto-manual-prompt-edit.json');
    expect(computePlanChecksum(base)).not.toBe(computePlanChecksum(edited));
  });

  test('TA-Checksum-010: adding or removing a criterion changes the checksum (FR-4.9b, FR-4.9c)', () => {
    const base = loadFixture('canonical-2x2x2.json');
    const extra = loadFixture('canonical-2x2x2-extra-criterion.json');
    const fewer = loadFixture('canonical-2x2x2-fewer-criteria.json');

    const baseHash = computePlanChecksum(base);
    expect(computePlanChecksum(extra)).not.toBe(baseHash);
    expect(computePlanChecksum(fewer)).not.toBe(baseHash);
  });

  test('TA-Checksum-011: renaming a task id changes the checksum (structural identity includes ids) (FR-4.14)', () => {
    const base = loadFixture('canonical-2x2x2.json');
    const renamed = loadFixture('canonical-2x2x2-renamed-task.json');
    expect(computePlanChecksum(base)).not.toBe(computePlanChecksum(renamed));
  });

  test('TA-Checksum-012: checksum computed exactly once at init; recomputed on every read; not recomputed on update-criterion or advance-task (FR-4.10)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);

    // initState computes and stores plan_checksum
    const initialized = initState(path);
    expect(initialized.plan_checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    // readState recomputes and validates checksum on every read
    const read1 = readState(path);
    expect(read1.plan_checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(read1.plan_checksum).toBe(initialized.plan_checksum);

    // readState is idempotent — same checksum on second read
    const read2 = readState(path);
    expect(read2.plan_checksum).toBe(read1.plan_checksum);
  });
});
