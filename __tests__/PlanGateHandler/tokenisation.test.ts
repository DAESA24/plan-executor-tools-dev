// tokenisation.test.ts — Tier A.3 PlanGateHandler Bash tokenisation + allow-list.
// Covers: TA-PlanGate-018, 019, 020, 021, 022, 023. Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
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

describe('PlanGateHandler Bash tokenisation + allow-list (TR-8)', () => {
  let fakeHome: string;
  let projectDir: string;
  let origHome: string;
  let smPath: string;
  let crPath: string;

  beforeEach(() => {
    fakeHome = makeTempDir('home');
    projectDir = makeTempDir('project');
    origHome = process.env.HOME ?? '';
    process.env.HOME = fakeHome;

    const toolsDir = join(fakeHome, '.claude', 'PAI', 'Tools');
    mkdirSync(toolsDir, { recursive: true });
    smPath = join(toolsDir, 'StateManager.ts');
    crPath = join(toolsDir, 'CheckRunner.ts');
    writeFileSync(smPath, '// StateManager placeholder');
    writeFileSync(crPath, '// CheckRunner placeholder');

    // Set up pointer + pending state.
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
        session_id: 'test-session',
      })
    );
  });
  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  function bash(command: string): PreToolUseHookInput {
    return {
      session_id: 'test',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command },
    };
  }

  test('TA-PlanGate-018: allow-list compares realpath(token) to realpath(allow-listed target); a string-equal forgery at a different realpath does NOT match (TR-8.1, TR-8.7)', () => {
    // Create a fake file at a DIFFERENT path whose string looks legitimate but
    // whose realpath is elsewhere.
    const forgeryDir = makeTempDir('forge');
    const forgery = join(forgeryDir, 'StateManager.ts');
    writeFileSync(forgery, '// forgery');
    try {
      // Token equals the string of the allow-listed target but the real file at
      // that string resolves to our seeded smPath — this should ALLOW.
      // However we construct the forgery such that the token string is the forgery's
      // path, which does NOT resolve to smPath. → BLOCK expected.
      const result = decide(bash(`bun ${forgery} read`));
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    } finally {
      rmSync(forgeryDir, { recursive: true, force: true });
    }
  });

  test('TA-PlanGate-019: realpath expands $HOME and ~; a symlink to the real StateManager.ts matches (TR-8.2)', () => {
    const linkDir = makeTempDir('link');
    const linkPath = join(linkDir, 'StateManagerLink.ts');
    symlinkSync(smPath, linkPath);
    try {
      // A symlinked path to the real StateManager.ts should ALLOW.
      const result = decide(bash(`bun ${linkPath} read`));
      expect(result.hookSpecificOutput).toBeUndefined();
    } finally {
      rmSync(linkDir, { recursive: true, force: true });
    }
  });

  test('TA-PlanGate-019b: tilde (~) in the Bash token expands to $HOME before realpath match (TR-8.2 regression)', () => {
    // Caught in Phase 8.5 smoke test: tokens like "bun ~/.claude/PAI/Tools/CheckRunner.ts"
    // must match the allow-list. Node's realpath does NOT expand ~; the handler must.
    const result = decide(bash('bun ~/.claude/PAI/Tools/CheckRunner.ts run'));
    expect(result.hookSpecificOutput).toBeUndefined();
  });

  test('TA-PlanGate-020: if realpath(target) does not exist on disk, allow-list does not match (TR-8.3)', () => {
    // Remove the seeded StateManager.ts so the allow-listed path no longer exists.
    rmSync(smPath, { force: true });
    // A command that syntactically invokes StateManager.ts but target does not exist
    // must NOT match the allow-list → fall through to task.status → BLOCK (pending).
    const result = decide(bash(`bun ${smPath} read`));
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  test('TA-PlanGate-021: tokenisation handles single/double-quoted args and \\-newline continuations (TR-8.5)', () => {
    // A Bash command with quoted args containing the allow-listed path substring
    // that does NOT resolve there (because the quoted arg is an echo payload).
    // Green behavior: allow-listed check must not false-positive on quoted substrings.
    const result = decide(
      bash(`bash -c 'echo "${smPath}"'`)
    );
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  test('TA-PlanGate-022: under-project-root check uses realpath startsWith root+"/"; sibling prefix (e.g., project-backup/) does NOT match (TR-8.6)', () => {
    // Create a sibling directory with a name that prefix-matches the project dir.
    const sibling = projectDir + '-backup';
    mkdirSync(sibling, { recursive: true });
    const siblingFile = join(sibling, 'x.txt');
    try {
      // Write to a file under the sibling dir (not under project_root).
      // With pending state: task_not_pass → BLOCK. Crucially, the sibling must not
      // be treated as "under project root" via naive prefix match.
      const input: PreToolUseHookInput = {
        session_id: 'test',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: siblingFile, content: 'x' },
      };
      const result = decide(input);
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    } finally {
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  test('TA-PlanGate-023: allow-list identity uses no env vars; a token literally containing "StateManager" at a different realpath does NOT match (TR-8.4, TR-8.8)', () => {
    const fakeDir = makeTempDir('malicious');
    const fakeTool = join(fakeDir, 'malicious-StateManager.ts');
    writeFileSync(fakeTool, '// not the real StateManager');
    try {
      // Token path string contains "StateManager" but realpath is NOT the allow-listed
      // one → BLOCK.
      const result = decide(bash(`bun ${fakeTool} read`));
      expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    } finally {
      rmSync(fakeDir, { recursive: true, force: true });
    }
  });
});
