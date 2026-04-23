// plangate-block.test.ts — Tier B integration test (Phase 7 criterion 3 scenario 3).
// PlanGate hook (subprocess, real stdin) blocks a Write when current task is PENDING.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const SM = join(import.meta.dir, '../../src/StateManager.ts');
const PG = join(import.meta.dir, '../../src/PlanGate.hook.ts');

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `int-pg-${prefix}-`));
}

describe('Integration: PlanGate blocks Write when task PENDING', () => {
  let projectDir: string;
  let fakeHome: string;

  beforeEach(() => {
    projectDir = makeTempDir('project');
    fakeHome = makeTempDir('home');
  });
  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('pending task + Write to in-project file → hook returns block envelope via stdout; exit 0', () => {
    // Build a pending-task validation.json and init.
    const validationPath = join(projectDir, 'validation.json');
    writeFileSync(
      validationPath,
      JSON.stringify(
        {
          plan: 'implementation-plan.md',
          project: 'integration-plangate',
          status: 'IN_PROGRESS',
          plan_checksum: null,
          initialized: null,
          current_phase: 1,
          current_task: '1.1',
          phases: {
            '1': {
              name: 'Phase One',
              status: 'PENDING',
              tasks: {
                '1.1': {
                  name: 'Pending task for gate test',
                  status: 'PENDING',
                  verified_at: null,
                  fix_attempts: 0,
                  criteria: {
                    '1': {
                      check: 'c',
                      type: 'automated',
                      command: 'echo PASS',
                      status: 'PENDING',
                      evidence: '',
                    },
                  },
                },
              },
            },
          },
        },
        null,
        2
      )
    );

    const init = spawnSync(
      'bun',
      [SM, 'init', '--path', validationPath, '--json'],
      { encoding: 'utf8', env: { ...process.env, HOME: fakeHome }, timeout: 10_000 }
    );
    expect(init.status).toBe(0);

    const pointerPath = join(fakeHome, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
    expect(existsSync(pointerPath)).toBe(true);

    // Craft a PreToolUse hook stdin payload for a Write to a file in the project.
    const hookInput = {
      session_id: 'integration-test',
      transcript_path: '/tmp/x.jsonl',
      hook_event_name: 'PreToolUse',
      tool_name: 'Write',
      tool_input: {
        file_path: join(projectDir, 'some-new-file.txt'),
        content: 'should be blocked',
      },
    };

    const hookResult = spawnSync('bun', [PG], {
      encoding: 'utf8',
      env: { ...process.env, HOME: fakeHome },
      timeout: 10_000,
      input: JSON.stringify(hookInput),
    });
    expect(hookResult.status).toBe(0); // hooks always exit 0 per §7.5

    // stdout must be a JSON envelope with hookSpecificOutput.permissionDecision = "deny".
    const stdout = hookResult.stdout?.trim() ?? '';
    expect(stdout.length).toBeGreaterThan(0);
    const envelope = JSON.parse(stdout);
    expect(envelope.hookSpecificOutput).toBeDefined();
    expect(envelope.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(envelope.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(envelope.hookSpecificOutput.permissionDecisionReason).toContain('1.1');
    expect(envelope.hookSpecificOutput.permissionDecisionReason).toContain(
      'bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 1.1'
    );

    // Event log: plan.gate.blocked emitted.
    const eventsFile = join(projectDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const events = readFileSync(eventsFile, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const blocked = events.find((e) => e.type === 'plan.gate.blocked');
    expect(blocked).toBeDefined();
    expect(blocked.source).toBe('PlanGate');
    expect(blocked.tool).toBe('Write');
    expect(blocked.task).toBe('1.1');
    expect(blocked.reason_code).toBe('task_not_pass');
  });
});
