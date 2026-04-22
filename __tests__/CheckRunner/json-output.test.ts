// json-output.test.ts — Tier A.2 CheckRunner --json output.
// Covers: TA-CheckRunner-030. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult } from '../../src/CheckRunner';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-json-'));
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

describe('CheckRunner --json output', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('TA-CheckRunner-030: --json → single JSON object stdout with task/results/summary/advanced (FR-2.27a, FR-2.27b, FR-2.35)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const result = run({ path, json: true, exec: passAllExec });

    // With --json, stdoutLines should consist of a single JSON object (one line).
    const nonEmptyLines = result.stdoutLines.filter((l) => l.trim().length > 0);
    expect(nonEmptyLines.length).toBe(1);

    const parsed = JSON.parse(nonEmptyLines[0]);
    expect(parsed).toHaveProperty('task');
    expect(parsed).toHaveProperty('results');
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed).toHaveProperty('summary');
    expect(parsed.summary).toHaveProperty('passed');
    expect(parsed.summary).toHaveProperty('failed');
    expect(parsed.summary).toHaveProperty('manual');
    expect(parsed).toHaveProperty('advanced');
    expect(typeof parsed.advanced).toBe('boolean');
  });
});
