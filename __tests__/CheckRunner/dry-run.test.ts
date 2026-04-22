// dry-run.test.ts — Tier A.2 CheckRunner --dry-run.
// Covers: TA-CheckRunner-021, 022, 023, 024. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, statSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult } from '../../src/CheckRunner';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-dryrun-'));
}
function copyFixture(name: string, destDir: string): string {
  const dest = join(destDir, 'validation.json');
  copyFileSync(join(FIXTURES_DIR, name), dest);
  return dest;
}
function writePointer(fakeHome: string, validationPath: string): void {
  const dir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'plan-executor.active.json'),
    JSON.stringify({
      validation_path: validationPath,
      project: 'test-project',
      activated_at: '2026-04-22T00:00:00.000Z',
      session_id: 'test-session',
    })
  );
}

const passAllExec = (_cmd: string, _opts: { timeoutMs: number }): ExecResult => ({
  stdout: 'PASS',
  stderr: '',
  exitCode: 0,
  timedOut: false,
});

describe('CheckRunner --dry-run', () => {
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

  test('TA-CheckRunner-021: --dry-run evaluates automated criteria but does not write state; mtime unchanged (FR-2.19, FR-2.20, TR-10.2d)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const mtimeBefore = statSync(path).mtimeMs;
    let execCount = 0;
    run({
      path,
      dryRun: true,
      exec: (cmd, opts) => { execCount++; return passAllExec(cmd, opts); },
    });
    const mtimeAfter = statSync(path).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore); // no write
    expect(execCount).toBeGreaterThan(0); // commands still executed
  });

  test('TA-CheckRunner-022: --dry-run reports manual criteria as "would prompt: <prompt>" with no stdin read, no exit 4 (FR-2.21a, FR-2.21b)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    let stdinCalls = 0;
    const result = run({
      path,
      dryRun: true,
      exec: passAllExec,
      stdinReadLine: () => { stdinCalls++; return 'x'; },
    });
    expect(stdinCalls).toBe(0);
    expect(result.exitCode).not.toBe(4);
    const reportLine = result.stdoutLines.find((l) => l.includes('would prompt:'));
    expect(reportLine).toBeDefined();
    expect(reportLine).toContain('Did you review the implementation?');
  });

  test('TA-CheckRunner-023: --dry-run stdout begins with literal "[DRY RUN — state file not modified]" (FR-2.21c)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const result = run({
      path,
      dryRun: true,
      exec: passAllExec,
    });
    expect(result.stdoutLines[0]).toBe('[DRY RUN — state file not modified]');
  });

  test('TA-CheckRunner-024: --dry-run emits no plan.* events; events.jsonl absent or unchanged (FR-2.33)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    writePointer(fakeHome, path);
    run({
      path,
      dryRun: true,
      exec: passAllExec,
    });
    const eventsFile = join(tmpDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(false);
  });
});
