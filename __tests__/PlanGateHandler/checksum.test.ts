// checksum.test.ts — Tier A.3 PlanGateHandler checksum + malformed state.
// Covers: TA-PlanGate-010, 011. Red phase — stub throws.

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

describe('PlanGateHandler checksum + malformed state', () => {
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

  test('TA-PlanGate-010: ChecksumError from readState → BLOCK with reasonCode "checksum_drift" (FR-3.11)', () => {
    const validationPath = join(projectDir, 'validation.json');
    copyFileSync(join(FIXTURES_DIR, 'pg-state-drifted.json'), validationPath);
    setupPointer(validationPath);

    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.reasonCode).toBe('checksum_drift');
  });

  test('TA-PlanGate-011: schema error (malformed JSON) → BLOCK with reasonCode "state_malformed" (FR-3.22)', () => {
    const validationPath = join(projectDir, 'validation.json');
    writeFileSync(validationPath, 'this is not valid JSON {{{');
    setupPointer(validationPath);

    const input: PreToolUseHookInput = {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: { file_path: join(projectDir, 'x.txt'), content: 'x' },
    };
    const result = decide(input);
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.reasonCode).toBe('state_malformed');
  });
});
