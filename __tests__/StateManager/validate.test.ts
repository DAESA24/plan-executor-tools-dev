// validate.test.ts — Tier A.1 StateManager validate tests
// Covers: TA-StateManager-036, TA-StateManager-037, TA-StateManager-038
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { readState } from '../../src/StateManager';
// validateState is not yet exported by the stub — this dynamic reference will be undefined
// until Phase 4.2. Tests that call it will fail with TypeError (correct red-phase behavior).
import * as StateManagerModule from '../../src/StateManager';
const validateState = (StateManagerModule as any).validateState as ((path: string) => { ok: boolean; errors: Array<{ type: string; [k: string]: unknown }>; warnings: Array<{ type: string; field?: string; value?: string }> }) | undefined;

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-validate-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

describe('StateManager validate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-036: validate flags missing required fields without throwing ChecksumError, even on checksum-mismatched file (FR-1.24a, FR-1.24b, FR-1.33)', () => {
    // Create a fixture missing a required field
    const missingFieldState = {
      plan: 'test.md',
      project: 'test',
      status: 'IN_PROGRESS',
      plan_checksum: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      initialized: null,
      current_phase: 1,
      current_task: '1.1',
      phases: {
        '1': {
          name: 'Phase One',
          // Missing 'status' field — required per schema
          tasks: {
            '1.1': {
              // Missing 'status' field — required per schema
              name: 'Task 1.1',
              verified_at: null,
              fix_attempts: 0,
              criteria: {},
            },
          },
        },
      },
    };

    const path = join(tmpDir, 'validation.json');
    writeFileSync(path, JSON.stringify(missingFieldState));

    // validateState is separate from readState — does NOT check checksum (FR-1.33)
    if (validateState == null) throw new Error('validateState not exported — stub not yet implemented');
    const result = validateState(path);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // The call must NOT throw ChecksumError even though checksum mismatches
  });

  test('TA-StateManager-037: validate detects bad enum values, missing command on automated, missing prompt on manual, orphaned current_task (FR-1.24c, FR-1.24d, FR-1.24e)', () => {
    // Create a fixture with invalid enum
    const badEnumState = {
      plan: 'test.md',
      project: 'test',
      status: 'INVALID_STATUS',
      plan_checksum: null,
      initialized: null,
      current_phase: 1,
      current_task: '9.9', // orphaned — does not exist in phases[1]
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
                  check: 'Automated no command',
                  type: 'automated',
                  // Missing 'command' — should be an error
                  status: 'PENDING',
                  evidence: '',
                },
                '2': {
                  check: 'Manual no prompt',
                  type: 'manual',
                  // Missing 'prompt' — should be an error
                  status: 'PENDING',
                  evidence: '',
                },
              },
            },
          },
        },
      },
    };

    const path = join(tmpDir, 'validation.json');
    writeFileSync(path, JSON.stringify(badEnumState));

    if (validateState == null) throw new Error('validateState not exported — stub not yet implemented');
    const result = validateState(path);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'invalid_enum' }),          // INVALID_STATUS
      expect.objectContaining({ type: 'missing_command' }),       // automated no command
      expect.objectContaining({ type: 'missing_prompt' }),        // manual no prompt
      expect.objectContaining({ type: 'orphaned_current_task' }), // 9.9 not in phases[1]
    ]));
  });

  test('TA-StateManager-038: validate reports unknown enum values as warnings not errors; validate does not read plan_checksum (FR-1.24f, FR-1.30d)', () => {
    const path = copyFixture('canonical-2x2x2-unknown-enum.json', tmpDir);

    if (validateState == null) throw new Error('validateState not exported — stub not yet implemented');
    const result = validateState(path);
    // SKIPPED is an unknown enum — should be a warning, not an error
    expect(result.ok).toBe(true); // warnings don't fail validation
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'unknown_enum', field: 'status', value: 'SKIPPED' }),
    ]));
    expect(result.errors).toHaveLength(0);
  });
});
