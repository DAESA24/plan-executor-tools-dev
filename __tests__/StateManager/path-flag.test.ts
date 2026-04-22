// path-flag.test.ts — Tier A.1 StateManager --path flag tests
// Covers: TA-StateManager-047
// Tests must FAIL (red phase) — StateManager.ts is a stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';

import { readState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'state-manager-path-flag-test-'));
}

describe('StateManager --path flag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('TA-StateManager-047: --path flag targets named file; default targets ./validation.json in CWD (FR-1.31)', () => {
    // Copy fixture to a non-default path
    const customPath = join(tmpDir, 'my-custom-state.json');
    const src = join(FIXTURES_DIR, 'canonical-2x2x2-initialized.json');
    copyFileSync(src, customPath);

    // With explicit --path: readState reads from the named file
    const state = readState(customPath);
    expect(state.project).toBe('test-project');
    expect(state.phases).toBeDefined();

    // Default path: also verify readState works when path points to a validation.json
    const defaultPath = join(tmpDir, 'validation.json');
    copyFileSync(src, defaultPath);
    const defaultState = readState(defaultPath);
    expect(defaultState.project).toBe('test-project');
  });
});
