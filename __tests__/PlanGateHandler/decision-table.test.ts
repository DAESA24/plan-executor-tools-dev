// decision-table.test.ts — Tier A.3 PlanGateHandler condensed decision matrix.
// Covers: TA-PlanGate-001 (parameterised, 24 rows). Red phase — stub throws.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { decide } from '../../src/handlers/PlanGateHandler';
import type { PreToolUseHookInput } from '../../src/lib/hook-types';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pg-${prefix}-`));
}

function copyFixture(name: string, destDir: string, destName = 'validation.json'): string {
  const dest = join(destDir, destName);
  copyFileSync(join(FIXTURES_DIR, name), dest);
  return dest;
}

function writePointer(fakeHome: string, validationPath: string): string {
  const dir = join(fakeHome, '.claude', 'MEMORY', 'STATE');
  mkdirSync(dir, { recursive: true });
  const pointerPath = join(dir, 'plan-executor.active.json');
  writeFileSync(
    pointerPath,
    JSON.stringify({
      validation_path: validationPath,
      project: 'pg-test',
      activated_at: '2026-04-22T00:00:00.000Z',
      session_id: 'test-session',
    })
  );
  return pointerPath;
}

function seedAllowListedTools(fakeHome: string): { sm: string; cr: string } {
  const toolsDir = join(fakeHome, '.claude', 'PAI', 'Tools');
  mkdirSync(toolsDir, { recursive: true });
  const sm = join(toolsDir, 'StateManager.ts');
  const cr = join(toolsDir, 'CheckRunner.ts');
  writeFileSync(sm, '// deploy-time StateManager.ts placeholder');
  writeFileSync(cr, '// deploy-time CheckRunner.ts placeholder');
  return { sm, cr };
}

interface MatrixRow {
  n: number;
  fixture: 'pg-state-pending.json' | 'pg-state-in-progress.json' | 'pg-state-pass.json';
  tool: 'Bash' | 'Edit' | 'Write';
  target: 'validation.json' | 'other-in-project' | 'out-of-project' | 'StateManager' | 'CheckRunner' | 'non-allow-listed';
  expected: 'deny' | 'allow';
  reason?: 'state_file_write_attempt' | 'task_not_pass';
}

const MATRIX: MatrixRow[] = [
  { n: 1, fixture: 'pg-state-pending.json', tool: 'Write', target: 'validation.json', expected: 'deny', reason: 'state_file_write_attempt' },
  { n: 2, fixture: 'pg-state-in-progress.json', tool: 'Write', target: 'validation.json', expected: 'deny', reason: 'state_file_write_attempt' },
  { n: 3, fixture: 'pg-state-pass.json', tool: 'Write', target: 'validation.json', expected: 'deny', reason: 'state_file_write_attempt' },
  { n: 4, fixture: 'pg-state-pending.json', tool: 'Edit', target: 'validation.json', expected: 'deny', reason: 'state_file_write_attempt' },
  { n: 5, fixture: 'pg-state-in-progress.json', tool: 'Edit', target: 'validation.json', expected: 'deny', reason: 'state_file_write_attempt' },
  { n: 6, fixture: 'pg-state-pass.json', tool: 'Edit', target: 'validation.json', expected: 'deny', reason: 'state_file_write_attempt' },
  { n: 7, fixture: 'pg-state-pending.json', tool: 'Write', target: 'other-in-project', expected: 'deny', reason: 'task_not_pass' },
  { n: 8, fixture: 'pg-state-in-progress.json', tool: 'Write', target: 'other-in-project', expected: 'deny', reason: 'task_not_pass' },
  { n: 9, fixture: 'pg-state-pass.json', tool: 'Write', target: 'other-in-project', expected: 'allow' },
  { n: 10, fixture: 'pg-state-pending.json', tool: 'Write', target: 'out-of-project', expected: 'deny', reason: 'task_not_pass' },
  { n: 11, fixture: 'pg-state-pass.json', tool: 'Write', target: 'out-of-project', expected: 'allow' },
  { n: 12, fixture: 'pg-state-pending.json', tool: 'Edit', target: 'other-in-project', expected: 'deny', reason: 'task_not_pass' },
  { n: 13, fixture: 'pg-state-pass.json', tool: 'Edit', target: 'other-in-project', expected: 'allow' },
  { n: 14, fixture: 'pg-state-pending.json', tool: 'Edit', target: 'out-of-project', expected: 'deny', reason: 'task_not_pass' },
  { n: 15, fixture: 'pg-state-pass.json', tool: 'Edit', target: 'out-of-project', expected: 'allow' },
  { n: 16, fixture: 'pg-state-pending.json', tool: 'Bash', target: 'StateManager', expected: 'allow' },
  { n: 17, fixture: 'pg-state-in-progress.json', tool: 'Bash', target: 'StateManager', expected: 'allow' },
  { n: 18, fixture: 'pg-state-pass.json', tool: 'Bash', target: 'StateManager', expected: 'allow' },
  { n: 19, fixture: 'pg-state-pending.json', tool: 'Bash', target: 'CheckRunner', expected: 'allow' },
  { n: 20, fixture: 'pg-state-in-progress.json', tool: 'Bash', target: 'CheckRunner', expected: 'allow' },
  { n: 21, fixture: 'pg-state-pass.json', tool: 'Bash', target: 'CheckRunner', expected: 'allow' },
  { n: 22, fixture: 'pg-state-pending.json', tool: 'Bash', target: 'non-allow-listed', expected: 'deny', reason: 'task_not_pass' },
  { n: 23, fixture: 'pg-state-in-progress.json', tool: 'Bash', target: 'non-allow-listed', expected: 'deny', reason: 'task_not_pass' },
  { n: 24, fixture: 'pg-state-pass.json', tool: 'Bash', target: 'non-allow-listed', expected: 'allow' },
];

describe('PlanGateHandler decision table', () => {
  let fakeHome: string;
  let projectDir: string;
  let outOfProjectDir: string;
  let origHome: string;
  let sm: string;
  let cr: string;

  beforeEach(() => {
    fakeHome = makeTempDir('home');
    projectDir = makeTempDir('project');
    outOfProjectDir = makeTempDir('outside');
    origHome = process.env.HOME ?? '';
    process.env.HOME = fakeHome;
    const seeded = seedAllowListedTools(fakeHome);
    sm = seeded.sm;
    cr = seeded.cr;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outOfProjectDir, { recursive: true, force: true });
  });

  function buildToolInput(row: MatrixRow, validationPath: string): Record<string, unknown> {
    if (row.tool === 'Bash') {
      if (row.target === 'StateManager') return { command: `bun ${sm} read --path ${validationPath}` };
      if (row.target === 'CheckRunner') return { command: `bun ${cr} run --path ${validationPath}` };
      return { command: 'echo hi' };
    }
    let filePath: string;
    if (row.target === 'validation.json') filePath = validationPath;
    else if (row.target === 'other-in-project') filePath = join(projectDir, 'other.txt');
    else filePath = join(outOfProjectDir, 'out.txt');

    if (row.tool === 'Edit') return { file_path: filePath, old_string: 'a', new_string: 'b' };
    return { file_path: filePath, content: 'x' };
  }

  test('TA-PlanGate-001: 24-row parameterised decision matrix (FR-3.5, FR-3.6, FR-3.7, FR-3.8a, FR-3.9, FR-3.10, FR-3.20, TR-10.3a, TR-10.3b)', () => {
    for (const row of MATRIX) {
      const validationPath = copyFixture(row.fixture, projectDir);
      writePointer(fakeHome, validationPath);
      const input: PreToolUseHookInput = {
        session_id: 'test',
        hook_event_name: 'PreToolUse',
        tool_name: row.tool,
        tool_input: buildToolInput(row, validationPath),
      };

      const result = decide(input);
      if (row.expected === 'deny') {
        expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
        expect(result.reasonCode).toBe(row.reason);
      } else {
        expect(result.hookSpecificOutput).toBeUndefined();
        expect(result.reasonCode).toBeUndefined();
      }
    }
  });
});
