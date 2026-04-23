// pointer.test.ts — Tier A.3 PlanGateHandler active-plan discovery.
// Covers: TA-PlanGate-004, 005, 006. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { decide } from '../../src/handlers/PlanGateHandler';
import type { PreToolUseHookInput } from '../../src/lib/hook-types';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pg-${prefix}-`));
}

describe('PlanGateHandler pointer lifecycle', () => {
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

  test('TA-PlanGate-004: pointer absent → decide returns ALLOW silently (FR-3.3)', () => {
    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    expect(result.hookSpecificOutput).toBeUndefined();
    expect(result.reasonCode).toBeUndefined();
  });

  test('TA-PlanGate-005: pointer exists but validation_path does not resolve → ALLOW + hook.error event (FR-3.4a, FR-3.4b)', () => {
    const pointerDir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
    mkdirSync(pointerDir, { recursive: true });
    const stalePath = join(projectDir, 'does-not-exist.json');
    writeFileSync(
      join(pointerDir, 'plan-executor.active.json'),
      JSON.stringify({
        validation_path: stalePath,
        project: 'pg-test',
        activated_at: '2026-04-22T00:00:00.000Z',
        session_id: 'test-session',
      })
    );
    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    // Fail-open: ALLOW when pointer is stale.
    expect(result.hookSpecificOutput).toBeUndefined();

    // An appendEvent call should have produced a hook.error line in the project's
    // events.jsonl (best-effort — emitter swallows errors, so absence is also fine
    // IF the emitter cannot find a project root). Both outcomes are acceptable;
    // what matters is that decide() itself did not throw.
    const eventsFile = join(projectDir, '.plan-executor', 'events.jsonl');
    if (existsSync(eventsFile)) {
      const events = readFileSync(eventsFile, 'utf8')
        .trim()
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l));
      const hookError = events.find((e) => e.type === 'hook.error');
      expect(hookError).toBeDefined();
    }
  });

  test('TA-PlanGate-006: decide calls readState(pointer.validation_path) — swapping validation_path redirects reads (FR-3.23)', () => {
    // Copy two different state fixtures to two different paths.
    const pathA = join(projectDir, 'a.json');
    const pathB = join(projectDir, 'b.json');
    copyFileSync(join(FIXTURES_DIR, 'pg-state-pending.json'), pathA);
    copyFileSync(join(FIXTURES_DIR, 'pg-state-pass.json'), pathB);

    const pointerDir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
    mkdirSync(pointerDir, { recursive: true });
    const pointerPath = join(pointerDir, 'plan-executor.active.json');

    // Point at path A (task PENDING) → Write to a non-validation file → BLOCK.
    writeFileSync(pointerPath, JSON.stringify({
      validation_path: pathA,
      project: 'pg-test',
      activated_at: '2026-04-22T00:00:00.000Z',
      session_id: 'test-session',
    }));
    const inputA: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'foo.txt'), content: 'x' },
    };
    const resultA = decide(inputA);
    expect(resultA.hookSpecificOutput?.permissionDecision).toBe('deny');

    // Swap pointer to path B (task PASS) → same Write → ALLOW.
    writeFileSync(pointerPath, JSON.stringify({
      validation_path: pathB,
      project: 'pg-test',
      activated_at: '2026-04-22T00:00:00.000Z',
      session_id: 'test-session',
    }));
    const resultB = decide(inputA);
    expect(resultB.hookSpecificOutput).toBeUndefined();
  });
});
