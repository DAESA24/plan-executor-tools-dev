// initialization-precondition.test.ts — CheckRunner refuses uninitialized state.
//
// Bug surfaced 2026-04-24 in skill-validator-tool-dev session: CheckRunner ran
// successfully against a validation.json with plan_checksum: null and
// initialized: null (operator skipped `StateManager init`). Tasks advanced,
// state was written, but the active-pointer was never created — so PlanGate
// silently no-op'd for the entire session. The "enforcement is LIVE" claim
// was false. CheckRunner must refuse to run until init has stamped the state.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult } from '../../src/CheckRunner';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-init-'));
}
function copyFixture(name: string, destDir: string): string {
  const dest = join(destDir, 'validation.json');
  copyFileSync(join(FIXTURES_DIR, name), dest);
  return dest;
}

const passAllExec = (_cmd: string, _opts: { timeoutMs: number }): ExecResult => ({
  stdout: 'PASS',
  stderr: '',
  exitCode: 0,
  timedOut: false,
});

describe('CheckRunner refuses to run on uninitialized state', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('exits 2 with E_NOT_INITIALIZED when plan_checksum is null', () => {
    const path = copyFixture('canonical-2x2x2.json', tmpDir);
    const before = readFileSync(path, 'utf8');

    const result = run({ path, exec: passAllExec });

    expect(result.exitCode).toBe(2);
    expect(result.stderrLines.some((l) => l.includes('E_NOT_INITIALIZED'))).toBe(true);
    expect(result.stderrLines.some((l) => l.includes('StateManager.ts init'))).toBe(true);

    expect(result.advanced).toBe(false);
    expect(result.results).toHaveLength(0);

    const after = readFileSync(path, 'utf8');
    expect(after).toBe(before);
  });

  test('proceeds normally once state is initialized', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const result = run({ path, exec: passAllExec });
    expect(result.exitCode).toBe(0);
    expect(result.advanced).toBe(true);
  });
});
