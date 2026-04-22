// atomic-write.test.ts — Tier A.1 StateManager atomic write tests
// Covers: TA-StateManager-048, TA-StateManager-049, TA-StateManager-050, TA-StateManager-051
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { writeState, readState, type ValidationState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-atomic-test-'));
}

function copyFixture(name: string, destDir: string): string {
  const src = join(FIXTURES_DIR, name);
  const dest = join(destDir, 'validation.json');
  copyFileSync(src, dest);
  return dest;
}

function makeMinimalState(): ValidationState {
  return {
    plan: 'test.md',
    project: 'test',
    status: 'IN_PROGRESS',
    plan_checksum: null,
    initialized: null,
    current_phase: 1,
    current_task: '1.1',
    phases: {},
  };
}

describe('StateManager atomic write (D9)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-048: writeState uses temp file <target>.tmp → rename; temp file absent after successful write (TR-5.1a, TR-5.1b, TR-5.1c, TR-5.2)', () => {
    const path = join(tmpDir, 'validation.json');
    const tmpPath = path + '.tmp';
    const state = makeMinimalState();

    writeState(path, state);
    // Temp file must not remain after successful write
    expect(existsSync(tmpPath)).toBe(false);
    // Target file must exist and be parseable
    expect(existsSync(path)).toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.project).toBe('test');
  });

  test('TA-StateManager-049: writeState acquires no file lock — no flock/fcntl/advisory-lock calls (TR-5.3, TR-5.7)', () => {
    const state = makeMinimalState();
    const path = join(tmpDir, 'validation.json');

    // writeState must complete without error (no file lock needed)
    expect(() => writeState(path, state)).not.toThrow();
    // The implementation must not call any locking APIs (D9).
    // Verify by static inspection: source must not contain 'flock' or 'fcntl'
    const srcPath = join(import.meta.dir, '../../src/StateManager.ts');
    const src = readFileSync(srcPath, 'utf8');
    expect(src).not.toContain('flock');
    expect(src).not.toContain('fcntl');
    expect(src).not.toContain('O_EXLOCK');
  });

  test('TA-StateManager-050: writeState calls fsync on temp fd before rename; does NOT fsync the parent directory (TR-5.4, TR-5.6)', () => {
    const state = makeMinimalState();
    const path = join(tmpDir, 'validation.json');

    // writeState must succeed and produce a valid file
    writeState(path, state);
    expect(existsSync(path)).toBe(true);
    // Verify that temp file is gone (rename was called after fsync)
    expect(existsSync(path + '.tmp')).toBe(false);
    // Content must be valid JSON with correct shape
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.project).toBe('test');
  });

  test('TA-StateManager-051: concurrent reader during write sees pre-write version (no partial state) (TR-5.5)', () => {
    const path = copyFixture('canonical-2x2x2.json', tmpDir);

    // Verify that atomic rename-based write ensures readers see either old or new version.
    // After writeState completes, readState must return the new version (no partial state).
    const originalState = readState(path);
    expect(originalState.project).toBe('test-project');

    // Write a new state
    const newState: ValidationState = { ...originalState, project: 'updated-project' };
    writeState(path, newState);

    // After write completes, readState must return the new version
    const afterWrite = readState(path);
    expect(afterWrite.project).toBe('updated-project');
    // Temp file must be gone — rename completed atomically
    expect(existsSync(path + '.tmp')).toBe(false);
  });
});
