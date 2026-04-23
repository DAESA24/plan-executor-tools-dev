// edge-cases.test.ts — Tier A.3 PlanGateHandler unexpected tool + graceful failure.
// Covers: TA-PlanGate-013, 014. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  readFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { decide } from '../../src/handlers/PlanGateHandler';
import type { PreToolUseHookInput } from '../../src/lib/hook-types';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pg-${prefix}-`));
}

describe('PlanGateHandler edge cases', () => {
  let fakeHome: string;
  let projectDir: string;
  let origHome: string;

  beforeEach(() => {
    fakeHome = makeTempDir('home');
    projectDir = makeTempDir('project');
    origHome = process.env.HOME ?? '';
    process.env.HOME = fakeHome;
  });
  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  function setupPointer(validationPath: string): void {
    const pointerDir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
    mkdirSync(pointerDir, { recursive: true });
    writeFileSync(
      join(pointerDir, 'plan-executor.active.json'),
      JSON.stringify({
        validation_path: validationPath,
        project: 'pg-test',
        activated_at: '2026-04-22T00:00:00.000Z',
        session_id: 'test-session',
      })
    );
  }

  test('TA-PlanGate-013: unknown tool_name (e.g., "Read") → ALLOW (FR-3.26)', () => {
    const validationPath = join(projectDir, 'validation.json');
    copyFileSync(join(FIXTURES_DIR, 'pg-state-pending.json'), validationPath);
    setupPointer(validationPath);

    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read', // not in {Bash, Edit, Write}
      tool_input: { file_path: join(projectDir, 'something.txt') },
    };
    const result = decide(input);
    expect(result.hookSpecificOutput).toBeUndefined();
    expect(result.reasonCode).toBeUndefined();
  });

  test('TA-PlanGate-014: wrapper swallows unexpected exceptions from decide — no block envelope, exit 0 (FR-3.17, TR-6.5)', () => {
    const wrapperSrc = readFileSync(
      join(import.meta.dir, '../../src/PlanGate.hook.ts'),
      'utf8'
    );
    // The wrapper must have a try/catch (or equivalent) around the decide() call
    // so any unexpected throw results in a silent allow (no stdout payload, exit 0).
    const hasTryCatch =
      /try\s*\{[\s\S]*decide[\s\S]*\}\s*catch/.test(wrapperSrc) ||
      /decide[\s\S]*\.catch\s*\(/.test(wrapperSrc);
    expect(hasTryCatch).toBe(true);

    // The wrapper's failure path must not emit a block envelope on its own.
    // It may log to stderr but must not write hookSpecificOutput JSON to stdout.
    // Structural check: the ACTUAL catch block body (matched via `catch {` or
    // `catch (x) {` syntax — not the word "catch" in prose) must not contain
    // a literal "permissionDecision" or "hookSpecificOutput" emission.
    const catchBlock = wrapperSrc.match(/\bcatch\s*(?:\([^)]*\)\s*)?\{[\s\S]*$/);
    if (catchBlock) {
      expect(catchBlock[0]).not.toMatch(/permissionDecision/);
      expect(catchBlock[0]).not.toMatch(/hookSpecificOutput/);
    }
  });
});
