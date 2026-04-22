// control-flow.test.ts — Tier A.2 CheckRunner control flow + exit codes.
// Covers: TA-CheckRunner-025, 026, 027, 028, 029. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult } from '../../src/CheckRunner';
import { IOError, readState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-cf-'));
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

const failingExec = (cmd: string, _opts: { timeoutMs: number }): ExecResult => {
  if (cmd.includes('exit 1')) {
    return { stdout: '', stderr: '', exitCode: 1, timedOut: false };
  }
  return { stdout: 'PASS', stderr: '', exitCode: 0, timedOut: false };
};

describe('CheckRunner control flow and exit codes', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('TA-CheckRunner-025: every criterion PASS triggers advanceTask before exit (FR-2.22)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const result = run({ path, exec: passAllExec });
    expect(result.advanced).toBe(true);
    // After advance, current_task should have moved off 1.1.
    const afterState = readState(path);
    expect(afterState.phases['1'].tasks['1.1'].status).toBe('PASS');
  });

  test('TA-CheckRunner-026: exit 0 requires every-PASS + successful advance (FR-2.23a, FR-2.23b)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    // Happy path: exit 0.
    const ok = run({ path, exec: passAllExec });
    expect(ok.exitCode).toBe(0);
    expect(ok.advanced).toBe(true);

    // If updateCriterion writes fail, exit must not be 0. Simulate via writeStateOverride
    // that throws on second-or-later calls (advance-task writes).
    const path2 = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    let writeCalls = 0;
    const broken = run({
      path: path2,
      exec: passAllExec,
      writeStateOverride: (p, s) => {
        writeCalls++;
        if (writeCalls >= 2) throw new IOError('simulated disk error');
        // For the first write (updateCriterion on first criterion), delegate to real writeState.
        require('fs').writeFileSync(p, JSON.stringify(s, null, 2));
      },
    });
    expect(broken.exitCode).not.toBe(0);
  });

  test('TA-CheckRunner-027: one criterion FAIL → exit 1, stderr lists failing ids (FR-2.24)', () => {
    const path = copyFixture('canonical-task-one-criterion-fails.json', tmpDir);
    const result = run({ path, exec: failingExec });
    expect(result.exitCode).toBe(1);
    expect(result.advanced).toBe(false);
    const stderrText = result.stderrLines.join('\n');
    expect(stderrText).toContain('2'); // failing criterion id is "2"
  });

  test('TA-CheckRunner-028: system error (write failure) → exit 2, iteration aborts, remaining criteria NOT coerced to FAIL (FR-2.25, FR-2.29)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const result = run({
      path,
      exec: passAllExec,
      writeStateOverride: (_p, _s) => {
        throw new IOError('simulated fs error');
      },
    });
    expect(result.exitCode).toBe(2);
    // Criteria beyond the failure point should not be reported as FAIL — they were never run.
    const failedNotRun = result.results.filter((r) => r.status === 'FAIL' && r.evidence.includes('coerced'));
    expect(failedNotRun.length).toBe(0);
  });

  test('TA-CheckRunner-029: plan_checksum mismatch → exit 3 before any updateCriterion (FR-2.26, FR-2.34)', () => {
    const path = copyFixture('canonical-2x2x2-drifted.json', tmpDir);
    let writes = 0;
    const result = run({
      path,
      exec: passAllExec,
      writeStateOverride: () => { writes++; },
    });
    expect(result.exitCode).toBe(3);
    expect(writes).toBe(0);
  });
});
