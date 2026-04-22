// manual-stdin.test.ts — Tier A.2 CheckRunner manual stdin strategy (D10).
// Covers: TA-CheckRunner-011, 012, 013, 014, 018, 019, 020. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult, type RunOptions } from '../../src/CheckRunner';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-manual-stdin-'));
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

describe('CheckRunner manual-stdin strategy', () => {
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

  test('TA-CheckRunner-011: default manual-prompt-strategy is stdin (FR-2.12)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    let stdinCalls = 0;
    const opts: RunOptions = {
      path,
      exec: passAllExec,
      stdinReadLine: () => { stdinCalls++; return 'yes'; },
    };
    // Without explicit manualPromptStrategy — should default to stdin (call stdinReadLine).
    run(opts);
    expect(stdinCalls).toBeGreaterThanOrEqual(1);
  });

  test('TA-CheckRunner-012: stdin strategy prints "MANUAL: <prompt>" to stdout before reading (FR-2.13, TR-10.2c)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    const result = run({
      path,
      exec: passAllExec,
      stdinReadLine: () => 'yes',
    });
    const prefixedLine = result.stdoutLines.find((l) => l.startsWith('MANUAL: '));
    expect(prefixedLine).toBeDefined();
    expect(prefixedLine).toContain('Did you review the implementation?');
  });

  test('TA-CheckRunner-013: empty stdin line under stdin records FAIL with evidence "no answer provided" (FR-2.14, TR-10.2c)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    const result = run({
      path,
      exec: passAllExec,
      stdinReadLine: () => '',
    });
    const manualResult = result.results.find((r) => r.id === '2');
    expect(manualResult).toBeDefined();
    expect(manualResult!.status).toBe('FAIL');
    expect(manualResult!.evidence).toBe('no answer provided');
  });

  test('TA-CheckRunner-014: non-empty stdin line under stdin records PASS with trimmed line as evidence (FR-2.15, TR-10.2c)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    const result = run({
      path,
      exec: passAllExec,
      stdinReadLine: () => '  yes, reviewed  ',
    });
    const manualResult = result.results.find((r) => r.id === '2');
    expect(manualResult).toBeDefined();
    expect(manualResult!.status).toBe('PASS');
    expect(manualResult!.evidence).toBe('yes, reviewed');
  });

  test('TA-CheckRunner-018: stdin strategy accepts --answer as scripted shortcut (no stdin read) (FR-2.30)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    let stdinCalls = 0;
    const result = run({
      path,
      exec: passAllExec,
      answer: 'scripted-answer',
      stdinReadLine: () => { stdinCalls++; return 'should-not-be-used'; },
    });
    expect(stdinCalls).toBe(0);
    const manualResult = result.results.find((r) => r.id === '2');
    expect(manualResult!.evidence).toBe('scripted-answer');
  });

  test('TA-CheckRunner-019: manual PASS emits plan.criterion.passed with task/criterion/evidence_len (FR-2.31, FR-5.8a, FR-5.8b, FR-5.8c)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    writePointer(fakeHome, path);
    run({
      path,
      exec: passAllExec,
      stdinReadLine: () => 'yes, reviewed',
    });
    const eventsFile = join(tmpDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const events = readFileSync(eventsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const passed = events.find((e) => e.type === 'plan.criterion.passed' && e.criterion === '2');
    expect(passed).toBeDefined();
    expect(passed.task).toBe('1.1');
    expect(passed.evidence_len).toBe('yes, reviewed'.length);
  });

  test('TA-CheckRunner-020: manual FAIL (empty answer) emits plan.criterion.failed with task/criterion/evidence_snippet, exit_code absent (FR-2.32, FR-5.9a, FR-5.9b, FR-5.9d, FR-5.15)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    writePointer(fakeHome, path);
    run({
      path,
      exec: passAllExec,
      stdinReadLine: () => '',
    });
    const eventsFile = join(tmpDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const events = readFileSync(eventsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const failed = events.find((e) => e.type === 'plan.criterion.failed' && e.criterion === '2');
    expect(failed).toBeDefined();
    expect(failed.task).toBe('1.1');
    expect(failed.evidence_snippet).toBe('no answer provided');
    expect('exit_code' in failed).toBe(false);
  });
});
