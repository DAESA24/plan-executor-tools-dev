// envelope.test.ts — Tier A.3 PlanGateHandler block/allow envelope.
// Covers: TA-PlanGate-007, 008, 009. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
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

function setup(fakeHome: string, projectDir: string, fixtureName: string): string {
  const validationPath = join(projectDir, 'validation.json');
  copyFileSync(join(FIXTURES_DIR, fixtureName), validationPath);
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
  return validationPath;
}

describe('PlanGateHandler block/allow envelope', () => {
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

  test('TA-PlanGate-007: BLOCK envelope has hookSpecificOutput.hookEventName="PreToolUse" + permissionDecision="deny" + non-empty permissionDecisionReason (FR-3.12, TR-6.3)', () => {
    setup(fakeHome, projectDir, 'pg-state-pending.json');
    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput!.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput!.permissionDecision).toBe('deny');
    expect(typeof result.hookSpecificOutput!.permissionDecisionReason).toBe('string');
    expect(result.hookSpecificOutput!.permissionDecisionReason.length).toBeGreaterThan(0);
  });

  test('TA-PlanGate-008: ALLOW path has NO hookSpecificOutput (silent — hook wrapper writes zero stdout bytes) (FR-3.13, TR-6.4)', () => {
    setup(fakeHome, projectDir, 'pg-state-pass.json');
    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    expect(result.hookSpecificOutput).toBeUndefined();
  });

  test('TA-PlanGate-009: BLOCK reason includes task id, task name, and exact "bun ~/.claude/PAI/Tools/CheckRunner.ts run --task <id>" (FR-3.14, FR-3.24)', () => {
    setup(fakeHome, projectDir, 'pg-state-pending.json');
    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    const reason = result.hookSpecificOutput!.permissionDecisionReason;
    expect(reason).toContain('1.1'); // current_task id from fixture
    expect(reason).toContain('Draft requirements document'); // task.name from fixture
    expect(reason).toContain('bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 1.1');
  });
});
