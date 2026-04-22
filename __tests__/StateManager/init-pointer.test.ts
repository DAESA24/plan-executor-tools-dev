// init-pointer.test.ts — Tier A.1 StateManager init pointer tests (RED phase).

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { initState } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');
const makeTempDir = (): string => mkdtempSync(join(tmpdir(), 'sm-init-ptr-'));
const copyFixture = (name: string, destDir: string): string => {
  const dest = join(destDir, 'validation.json');
  copyFileSync(join(FIXTURES_DIR, name), dest);
  return dest;
};

describe('StateManager init pointer lifecycle', () => {
  let tmpDir: string;
  let fakeHome: string;
  let origHome: string;
  let origSession: string | undefined;

  beforeEach(() => {
    tmpDir = makeTempDir();
    fakeHome = makeTempDir();
    origHome = process.env.HOME ?? '';
    origSession = process.env.CLAUDE_SESSION_ID;
    process.env.HOME = fakeHome;
  });
  afterEach(() => {
    process.env.HOME = origHome;
    if (origSession === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = origSession;
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('TA-StateManager-004: init writes pointer at $HOME/.claude/MEMORY/STATE/plan-executor.active.json with 4 keys, creates parent dir, atomic rename (FR-1.38a, FR-1.38b, FR-1.38c, FR-1.38d, TR-5.8)', () => {
    const validationPath = copyFixture('canonical-2x2x2.json', tmpDir);
    initState(validationPath);
    const pointerPath = join(fakeHome, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
    expect(existsSync(pointerPath)).toBe(true);
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
    expect(pointer).toHaveProperty('validation_path');
    expect(pointer).toHaveProperty('project');
    expect(pointer).toHaveProperty('activated_at');
    expect(pointer).toHaveProperty('session_id');
    expect(pointer.activated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(existsSync(pointerPath + '.tmp')).toBe(false);
  });

  test('TA-StateManager-005: session_id equals CLAUDE_SESSION_ID when set, "unknown" when unset (FR-1.38b)', () => {
    delete process.env.CLAUDE_SESSION_ID;
    const validationPath = copyFixture('canonical-2x2x2.json', tmpDir);
    initState(validationPath);
    const pointerPath = join(fakeHome, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
    const pointerUnset = JSON.parse(readFileSync(pointerPath, 'utf8'));
    expect(pointerUnset.session_id).toBe('unknown');

    rmSync(pointerPath, { force: true });
    process.env.CLAUDE_SESSION_ID = 'test-session-abc123';
    const path2 = copyFixture('canonical-2x2x2.json', tmpDir);
    initState(path2);
    const pointerSet = JSON.parse(readFileSync(pointerPath, 'utf8'));
    expect(pointerSet.session_id).toBe('test-session-abc123');
  });
});
