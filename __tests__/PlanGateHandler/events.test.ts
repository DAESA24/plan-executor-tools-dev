// events.test.ts — Tier A.3 PlanGateHandler event emission.
// Covers: TA-PlanGate-016, 017. Red phase — stub throws.

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

function readEvents(projectDir: string): Array<Record<string, unknown>> {
  const eventsFile = join(projectDir, '.plan-executor', 'events.jsonl');
  if (!existsSync(eventsFile)) return [];
  return readFileSync(eventsFile, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

describe('PlanGateHandler event emission', () => {
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

  test('TA-PlanGate-016: ALLOW → plan.gate.allowed event with tool + task (FR-3.18, FR-5.6a, FR-5.6b)', () => {
    setup(fakeHome, projectDir, 'pg-state-pass.json');
    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    decide(input);
    const events = readEvents(projectDir);
    const allowed = events.find((e) => e.type === 'plan.gate.allowed');
    expect(allowed).toBeDefined();
    expect(allowed!.tool).toBe('Write');
    expect(allowed!.task).toBe('1.1');
  });

  test('TA-PlanGate-017: BLOCK → plan.gate.blocked event with tool/task/reason_code; target_path only for state_file_write_attempt (FR-3.19, FR-5.5, FR-5.17)', () => {
    // Case A: task_not_pass → no target_path
    const validationPath = setup(fakeHome, projectDir, 'pg-state-pending.json');
    const inputA: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    decide(inputA);
    const eventsA = readEvents(projectDir);
    const blockedA = eventsA.find((e) => e.type === 'plan.gate.blocked');
    expect(blockedA).toBeDefined();
    expect(blockedA!.tool).toBe('Write');
    expect(blockedA!.task).toBe('1.1');
    expect(blockedA!.reason_code).toBe('task_not_pass');
    expect('target_path' in blockedA!).toBe(false);

    // Case B: state_file_write_attempt → target_path present
    const inputB: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: validationPath, content: 'x' },
    };
    decide(inputB);
    const eventsB = readEvents(projectDir);
    const blockedB = eventsB.find(
      (e) => e.type === 'plan.gate.blocked' && e.reason_code === 'state_file_write_attempt'
    );
    expect(blockedB).toBeDefined();
    expect(blockedB!.target_path).toBeDefined();
  });
});
