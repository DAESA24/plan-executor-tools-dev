// manual-askuser.test.ts — Tier A.2 CheckRunner askuser strategy (D10).
// Covers: TA-CheckRunner-015, 016, 017. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult } from '../../src/CheckRunner';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-askuser-'));
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

describe('CheckRunner manual-askuser strategy', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('TA-CheckRunner-015: first pending manual criterion aborts with exit 4 (FR-2.16, FR-2.17a, TR-10.2e)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    const result = run({
      path,
      exec: passAllExec,
      manualPromptStrategy: 'askuser',
    });
    expect(result.exitCode).toBe(4);
    expect(result.askUserPayload).toBeDefined();
  });

  test('TA-CheckRunner-016: exit-4 payload has exit_reason, task, criterion, prompt, resume_command keys (FR-2.17b-f, TR-10.2e)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    const result = run({
      path,
      exec: passAllExec,
      manualPromptStrategy: 'askuser',
    });
    const payload = result.askUserPayload!;
    expect(payload.exit_reason).toBe('manual_criterion_needs_askuser');
    expect(payload.task).toBe('1.1');
    expect(payload.criterion).toBe('2');
    expect(payload.prompt).toBe('Did you review the implementation?');
    expect(typeof payload.resume_command).toBe('string');
    expect(payload.resume_command).toContain('--task 1.1');
    expect(payload.resume_command).toContain('--manual-prompt-strategy askuser');
    expect(payload.resume_command).toContain('--answer');

    // Payload is emitted on stderr, not stdout.
    const stderrText = result.stderrLines.join('\n');
    expect(stderrText).toContain('manual_criterion_needs_askuser');
  });

  test('TA-CheckRunner-017: run --answer "yes" under askuser supplies answer to the blocking criterion (FR-2.18)', () => {
    const path = copyFixture('manual-criterion-fixture.json', tmpDir);
    const result = run({
      path,
      task: '1.1',
      exec: passAllExec,
      manualPromptStrategy: 'askuser',
      answer: 'yes',
    });
    // With answer provided, run completes past the manual criterion.
    const manualResult = result.results.find((r) => r.id === '2');
    expect(manualResult).toBeDefined();
    expect(manualResult!.status).toBe('PASS');
    expect(manualResult!.evidence).toBe('yes');
    expect(result.exitCode).not.toBe(4);
  });
});
