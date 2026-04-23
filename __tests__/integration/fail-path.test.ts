// fail-path.test.ts — Tier B integration test (Phase 7 criterion 3 scenario 2).
// End-to-end: CheckRunner against a failing criterion → FAIL recorded, no advance.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

const SM = join(import.meta.dir, '../../src/StateManager.ts');
const CR = join(import.meta.dir, '../../src/CheckRunner.ts');

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `int-${prefix}-`));
}

function runBun(scriptPath: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync('bun', [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
  };
}

describe('Integration: fail-path', () => {
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

  test('missing marker → CheckRunner FAIL, state records FAIL + fix_attempts=1, task stays IN_PROGRESS', () => {
    const marker = join(projectDir, 'marker-that-does-not-exist');
    // Intentionally do NOT create the marker — criterion should FAIL.

    const validationPath = join(projectDir, 'validation.json');
    writeFileSync(
      validationPath,
      JSON.stringify(
        {
          plan: 'implementation-plan.md',
          project: 'integration-fail',
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
                  name: 'Integration fail-path',
                  status: 'PENDING',
                  verified_at: null,
                  fix_attempts: 0,
                  criteria: {
                    '1': {
                      check: 'Marker exists',
                      type: 'automated',
                      command: `test -f ${marker} && echo PASS || echo FAIL`,
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

    // Init first.
    const init = runBun(SM, ['init', '--path', validationPath, '--json'], { HOME: fakeHome });
    expect(init.exitCode).toBe(0);

    // Run CheckRunner — criterion FAILs.
    const run = runBun(CR, ['run', '--path', validationPath, '--json'], { HOME: fakeHome });
    expect(run.exitCode).toBe(1); // FAIL exit code per D7
    const runParsed = JSON.parse(run.stdout.trim());
    expect(runParsed.summary.passed).toBe(0);
    expect(runParsed.summary.failed).toBe(1);
    expect(runParsed.advanced).toBe(false);

    // State file: criterion FAIL, task IN_PROGRESS (not PASS), fix_attempts incremented.
    const finalState = JSON.parse(readFileSync(validationPath, 'utf8'));
    expect(finalState.phases['1'].tasks['1.1'].status).toBe('IN_PROGRESS');
    expect(finalState.phases['1'].tasks['1.1'].verified_at).toBeNull();
    expect(finalState.phases['1'].tasks['1.1'].fix_attempts).toBe(1);
    expect(finalState.phases['1'].tasks['1.1'].criteria['1'].status).toBe('FAIL');
    expect(finalState.phases['1'].tasks['1.1'].criteria['1'].evidence).toContain('exit_code=');
    expect(finalState.status).toBe('IN_PROGRESS'); // plan not completed

    // Pointer still exists (task not done).
    const pointerPath = join(fakeHome, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
    expect(existsSync(pointerPath)).toBe(true);

    // Event log: plan.criterion.failed event with exit_code + evidence_snippet.
    const eventsFile = join(projectDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const events = readFileSync(eventsFile, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const critFailed = events.find((e) => e.type === 'plan.criterion.failed');
    expect(critFailed).toBeDefined();
    expect(critFailed.source).toBe('CheckRunner');
    expect(critFailed.task).toBe('1.1');
    expect(critFailed.criterion).toBe('1');
    expect(typeof critFailed.exit_code).toBe('number');
    expect(typeof critFailed.evidence_snippet).toBe('string');

    // No plan.task.advanced should be present.
    const advanced = events.find((e) => e.type === 'plan.task.advanced');
    expect(advanced).toBeUndefined();
  });
});
