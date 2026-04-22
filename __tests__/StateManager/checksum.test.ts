// checksum.test.ts — Tier A.1 StateManager checksum tests
// Covers: TA-StateManager-039
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { computePlanChecksum, readState } from '../../src/StateManager';
import type { ValidationState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-checksum-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

describe('StateManager checksum', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-039: checksum prints recomputed plan_checksum and does not write to disk — mtime unchanged (FR-1.25)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);

    const state = readState(path);
    const mtimeBefore = statSync(path).mtimeMs;
    const checksum = computePlanChecksum(state);
    const mtimeAfter = statSync(path).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore); // disk unchanged
    expect(checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Also test via the pure function directly with inline state:
    const inlineState: ValidationState = {
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
                  check: 'Test',
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

    // computePlanChecksum is a pure function
    const inlineChecksum = computePlanChecksum(inlineState);
    expect(inlineChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Deterministic: same input yields same output
    expect(computePlanChecksum(inlineState)).toBe(inlineChecksum);
  });
});
