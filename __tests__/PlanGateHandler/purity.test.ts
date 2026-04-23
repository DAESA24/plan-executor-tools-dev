// purity.test.ts — Tier A.3 PlanGateHandler purity + library layering.
// Covers: TA-PlanGate-012. Red phase — stub throws on decide() but structural checks pass.

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

describe('PlanGateHandler purity (FR-3.15, 3.16, 3.25, TR-6.6, TR-7.8, TR-7.10)', () => {
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

  test('TA-PlanGate-012: decide is pure (no process.exit, no stdin reads, imports appendEvent + hook-types from lib)', () => {
    const handlerSrc = readFileSync(
      join(import.meta.dir, '../../src/handlers/PlanGateHandler.ts'),
      'utf8'
    );

    // No process.exit, no stdin reads.
    expect(handlerSrc).not.toMatch(/process\.exit\s*\(/);
    expect(handlerSrc).not.toMatch(/process\.stdin/);
    expect(handlerSrc).not.toMatch(/readHookInput/);

    // Imports from lib.
    expect(handlerSrc).toMatch(/from\s+['"]\.\.\/lib\/event-emitter['"]/);
    expect(handlerSrc).toMatch(/from\s+['"]\.\.\/lib\/hook-types['"]/);
    expect(handlerSrc).toContain('appendEvent');

    // Behavioural purity: decide's decision does not depend on session-scoped ids.
    // Setup: pending state + pointer. Call decide twice with different session_ids,
    // same tool_input. Both decisions must match.
    const validationPath = join(projectDir, 'validation.json');
    copyFileSync(join(FIXTURES_DIR, 'pg-state-pending.json'), validationPath);
    const pointerDir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
    mkdirSync(pointerDir, { recursive: true });
    writeFileSync(
      join(pointerDir, 'plan-executor.active.json'),
      JSON.stringify({
        validation_path: validationPath,
        project: 'pg-test',
        activated_at: '2026-04-22T00:00:00.000Z',
        session_id: 'irrelevant-1',
      })
    );

    const baseInput = {
      hook_event_name: 'PreToolUse' as const,
      tool_name: 'Write' as const,
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const inputA: PreToolUseHookInput = { ...baseInput, session_id: 'session-A' };
    const inputB: PreToolUseHookInput = { ...baseInput, session_id: 'session-B' };

    const resultA = decide(inputA);
    const resultB = decide(inputB);
    expect(resultA.hookSpecificOutput?.permissionDecision).toBe(
      resultB.hookSpecificOutput?.permissionDecision
    );
    expect(resultA.reasonCode).toBe(resultB.reasonCode);
  });
});
