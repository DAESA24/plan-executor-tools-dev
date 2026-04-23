// happy-path.test.ts — Tier B integration test (Phase 7 criterion 3 scenario 1).
// End-to-end: init → CheckRunner → criterion PASS → task advances → events.jsonl.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
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

function writeFixture(projectDir: string, markerPath: string): string {
  const fixturePath = join(projectDir, 'validation.json');
  writeFileSync(
    fixturePath,
    JSON.stringify(
      {
        plan: 'implementation-plan.md',
        project: 'integration-happy',
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
                name: 'Integration happy-path',
                status: 'PENDING',
                verified_at: null,
                fix_attempts: 0,
                criteria: {
                  '1': {
                    check: 'Marker exists',
                    type: 'automated',
                    command: `test -f ${markerPath} && echo PASS || echo FAIL`,
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
  return fixturePath;
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

describe('Integration: happy-path advancement', () => {
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

  test('init → marker file exists → CheckRunner PASS → task advances → events logged', () => {
    // Marker file that the criterion checks for.
    const marker = join(projectDir, 'marker');
    writeFileSync(marker, 'present');

    const validationPath = writeFixture(projectDir, marker);

    // Init writes plan_checksum and pointer.
    const init = runBun(SM, ['init', '--path', validationPath, '--json'], { HOME: fakeHome });
    expect(init.exitCode).toBe(0);
    const initParsed = JSON.parse(init.stdout.trim());
    expect(initParsed.ok).toBe(true);
    expect(initParsed.plan_checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Pointer should be present at fakeHome's pointer path.
    const pointerPath = join(fakeHome, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
    expect(existsSync(pointerPath)).toBe(true);

    // CheckRunner runs the single criterion — should PASS and advance.
    const run = runBun(CR, ['run', '--path', validationPath, '--json'], { HOME: fakeHome });
    expect(run.exitCode).toBe(0);
    const runParsed = JSON.parse(run.stdout.trim());
    expect(runParsed.task).toBe('1.1');
    expect(runParsed.summary.passed).toBe(1);
    expect(runParsed.summary.failed).toBe(0);
    expect(runParsed.advanced).toBe(true);

    // State file now shows task PASS + plan COMPLETED (1-task plan).
    const finalState = JSON.parse(readFileSync(validationPath, 'utf8'));
    expect(finalState.phases['1'].tasks['1.1'].status).toBe('PASS');
    expect(finalState.phases['1'].tasks['1.1'].verified_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
    expect(finalState.status).toBe('COMPLETED');

    // Plan completion deletes the pointer.
    expect(existsSync(pointerPath)).toBe(false);

    // Event log: criterion.passed + task.advanced with plan_completed.
    const eventsFile = join(projectDir, '.plan-executor', 'events.jsonl');
    expect(existsSync(eventsFile)).toBe(true);
    const events = readFileSync(eventsFile, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const critPassed = events.find((e) => e.type === 'plan.criterion.passed');
    expect(critPassed).toBeDefined();
    expect(critPassed.source).toBe('CheckRunner');
    expect(critPassed.task).toBe('1.1');
    expect(critPassed.criterion).toBe('1');

    const advanced = events.find((e) => e.type === 'plan.task.advanced');
    expect(advanced).toBeDefined();
    expect(advanced.source).toBe('StateManager');
    expect(advanced.from_task).toBe('1.1');
    expect(advanced.plan_completed).toBe(true);
  });
});
