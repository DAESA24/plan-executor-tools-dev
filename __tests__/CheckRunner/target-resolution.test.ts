// target-resolution.test.ts — Tier A.2 CheckRunner target resolution.
// Covers: TA-CheckRunner-001, 002, 003. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run, type ExecResult, type RunOptions } from '../../src/CheckRunner';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'checkrunner-target-'));
}
function copyFixture(name: string, destDir: string): string {
  const dest = join(destDir, 'validation.json');
  copyFileSync(join(FIXTURES_DIR, name), dest);
  return dest;
}

describe('CheckRunner target resolution', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTempDir(); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('TA-CheckRunner-001: run without --task iterates the task returned by findCurrentCriterion (FR-2.1)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const execCalls: string[] = [];
    const exec = (cmd: string, _opts: { timeoutMs: number }): ExecResult => {
      execCalls.push(cmd);
      return { stdout: 'PASS', stderr: '', exitCode: 0, timedOut: false };
    };
    const opts: RunOptions = { path, exec };
    const result = run(opts);
    // current_task is "1.1" with 2 automated criteria — both executed.
    expect(result.task).toBe('1.1');
    expect(execCalls.length).toBe(2);
  });

  test('TA-CheckRunner-002: run --task 2.2 targets task 2.2 regardless of current_task (FR-2.2)', () => {
    const path = copyFixture('canonical-2x2x2-initialized.json', tmpDir);
    const execCalls: string[] = [];
    const exec = (cmd: string, _opts: { timeoutMs: number }): ExecResult => {
      execCalls.push(cmd);
      return { stdout: 'PASS', stderr: '', exitCode: 0, timedOut: false };
    };
    const result = run({ path, task: '2.2', exec });
    expect(result.task).toBe('2.2');
    expect(execCalls.length).toBe(2);
  });

  test('TA-CheckRunner-003: criteria iterated in numeric-id order (1, 2, ..., 10 not 1, 10, 2) (FR-2.3)', () => {
    const path = copyFixture('canonical-task-with-ten-criteria.json', tmpDir);
    const execCalls: string[] = [];
    const exec = (cmd: string, _opts: { timeoutMs: number }): ExecResult => {
      execCalls.push(cmd);
      return { stdout: 'PASS', stderr: '', exitCode: 0, timedOut: false };
    };
    run({ path, exec });
    // Expected order: one, two, three, ..., ten (numeric not lex).
    const order = execCalls.map((c) => c.split(' ')[1]);
    expect(order).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']);
  });
});
