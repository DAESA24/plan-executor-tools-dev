#!/usr/bin/env bun
/*!
 * CheckRunner.ts — Plan Executor Tools: per-task criterion evaluator
 *
 * PURPOSE:
 * Evaluates every PENDING or FAIL criterion of a target task, records
 * each result via StateManager, and auto-advances the task when all
 * criteria PASS. This is the tool the orchestrator invokes after making
 * changes — running CheckRunner is what unblocks the PlanGate hook.
 *
 * ROLE IN THE ENFORCEMENT KERNEL:
 * This file is 2 of 3 deployed components:
 *   - StateManager.ts   — State lifecycle, CLI + API.
 *   - CheckRunner.ts    — THIS FILE. Criterion evaluator.
 *   - PlanGate.hook.ts  — PreToolUse hook.
 *
 * CheckRunner imports StateManager's programmatic API directly (in the
 * same Bun process — no subprocess overhead). At deploy time, both are
 * bundled to self-contained files under ~/.claude/PAI/Tools/.
 *
 * HOW CRITERIA EVALUATE:
 *   automated criterion:
 *     1. Spawn `bash -c "<command>"` (30 s default timeout, overridable
 *        via CHECKRUNNER_TIMEOUT_MS env var).
 *     2. Capture stdout, stderr, exit code.
 *     3. PASS iff: the LAST non-empty stdout line is exactly "PASS"
 *        AND exit code is 0 (both conjuncts required).
 *     4. FAIL otherwise. Evidence is "exit_code=N\nstdout=…\nstderr=…".
 *     5. Timeout → FAIL with evidence "TIMEOUT after <N>ms".
 *
 *   manual criterion (two strategies):
 *     --manual-prompt-strategy stdin (default):
 *       Print "MANUAL: <prompt>" to stdout, read one line from stdin.
 *       Empty line → FAIL with evidence "no answer provided".
 *       Non-empty → PASS with trimmed line as evidence.
 *     --manual-prompt-strategy askuser:
 *       Emit a structured payload to stderr, exit 4. Orchestrator calls
 *       AskUserQuestion, captures Drew's response, re-invokes CheckRunner
 *       with --answer "<response>" to supply the answer and continue.
 *       One round-trip per manual criterion.
 *
 *   --answer <text> shortcut:
 *     Under EITHER strategy, --answer supplies the answer for the NEXT
 *     pending manual criterion without prompting. Useful for scripted
 *     runs and for resuming after an askuser exit-4.
 *
 * RE-RUN SEMANTICS (red → green cycle):
 *   On re-invocation, criteria with status PENDING or FAIL are
 *   RE-EVALUATED. PASS criteria are SKIPPED (idempotent). This is what
 *   enables the typical "criterion FAIL → fix the code → re-run
 *   CheckRunner → same criterion now PASSes → task advances" workflow.
 *
 * USAGE:
 *   # Run current task's criteria (what you normally do)
 *   bun ~/.claude/PAI/Tools/CheckRunner.ts run --path ./validation.json
 *
 *   # Run a specific task (for retries after a fix)
 *   bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --path ./validation.json
 *
 *   # Evaluate without writing state (dry run)
 *   bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --dry-run \
 *     --path ./validation.json
 *
 *   # Machine-readable output (JSON object on stdout)
 *   bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --json \
 *     --path ./validation.json
 *
 *   # Manual-criterion askuser flow
 *   bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 \
 *     --manual-prompt-strategy askuser --path ./validation.json
 *   # → exits 4 with structured stderr; orchestrator handles AskUserQuestion,
 *   # then re-invokes with --answer:
 *   bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 \
 *     --manual-prompt-strategy askuser --answer "Yes, reviewed and approved." \
 *     --path ./validation.json
 *
 * FLAGS:
 *   --path <file>                       State file path (required)
 *   --task <id>                         Explicit task id (else state.current_task)
 *   --dry-run                           Evaluate without writing state or events
 *   --manual-prompt-strategy stdin|askuser
 *                                       Manual-criterion UX (default: stdin)
 *   --answer <text>                     Pre-supply answer for next manual criterion
 *   --json                              Single-object JSON on stdout
 *   --verbose                           Extra diagnostics
 *   --help, -h                          Usage
 *
 * EXIT CODES:
 *   0  All criteria PASS and task advanced successfully
 *   1  One or more criteria FAILED (stderr lists which) — not a system
 *      error; the task stayed IN_PROGRESS, fix_attempts was incremented
 *   2  System error (StateManager write failure, malformed state, etc.)
 *   3  plan_checksum mismatch detected on read
 *   4  Manual criterion needs AskUserQuestion (askuser strategy).
 *      Stderr contains a JSON payload with `exit_reason`, `task`,
 *      `criterion`, `prompt`, `resume_command`. Re-invoke with --answer.
 *
 * EVENTS EMITTED (D5):
 *   Per criterion → plan.criterion.passed OR plan.criterion.failed,
 *     source="CheckRunner", with task/criterion/evidence_len
 *     (or exit_code and evidence_snippet on FAIL).
 *   On advance → plan.task.advanced is emitted by StateManager itself.
 *   --dry-run emits NO events.
 *
 * KEY BEHAVIORS:
 *   - Subprocess-free integration with StateManager: module import, not
 *     subprocess spawn (TR-7.7). One bundled file at deploy; the
 *     StateManager code is inlined inside CheckRunner at build time.
 *   - Deterministic evaluation order: criteria sorted by dotted-numeric
 *     id (1, 2, …, 10 — not lex 1, 10, 2).
 *   - --json REPLACES prose stdout with a single JSON object so
 *     orchestrator scripts can parse stdout directly.
 *
 * SOURCE:
 *   github.com/DAESA24/plan-executor-tools-dev — src/CheckRunner.ts
 *   (bundled via `bun build --target=bun` with StateManager + lib
 *   imports inlined).
 */

import { spawnSync } from 'child_process';
import { dirname, resolve } from 'path';

import {
  readState,
  writeState,
  updateCriterion,
  advanceTask,
  findCurrentCriterion,
  StateManagerError,
  ChecksumError,
  PreconditionError,
  TargetNotFoundError,
  type ValidationState,
  type Criterion,
} from './StateManager';
import { appendEvent } from './lib/event-emitter';

export type ManualPromptStrategy = 'stdin' | 'askuser';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  timeoutMs?: number;
}

export interface RunOptions {
  path: string;
  task?: string;
  dryRun?: boolean;
  manualPromptStrategy?: ManualPromptStrategy;
  answer?: string;
  json?: boolean;
  verbose?: boolean;
  exec?: (cmd: string, opts: { timeoutMs: number }) => ExecResult;
  stdinReadLine?: () => string;
  writeStateOverride?: (path: string, state: ValidationState) => void;
}

export interface CriterionResult {
  id: string;
  status: 'PASS' | 'FAIL';
  evidence: string;
}

export interface AskUserPayload {
  exit_reason: 'manual_criterion_needs_askuser';
  task: string;
  criterion: string;
  prompt: string;
  resume_command: string;
}

export interface RunResult {
  task: string;
  results: CriterionResult[];
  summary: { passed: number; failed: number; manual: number };
  advanced: boolean;
  exitCode: number;
  askUserPayload?: AskUserPayload;
  stdoutLines: string[];
  stderrLines: string[];
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const TIMEOUT_ENV_VAR = 'CHECKRUNNER_TIMEOUT_MS';

export function getDefaultTimeoutMs(): number {
  const raw = process.env[TIMEOUT_ENV_VAR];
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

// ── Shell execution (FR-2.4, FR-2.5, FR-2.9) ─────────────────────────────────

export function runShellCommand(cmd: string, opts: { timeoutMs: number }): ExecResult {
  const result = spawnSync('bash', ['-c', cmd], {
    timeout: opts.timeoutMs,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  const errCode = (result.error as NodeJS.ErrnoException | undefined)?.code;
  const timedOut = errCode === 'ETIMEDOUT' || (result.signal != null && result.status === null);

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
    timedOut,
    timeoutMs: timedOut ? opts.timeoutMs : undefined,
  };
}

// ── Classifier (FR-2.7, FR-2.8, FR-2.10, FR-2.11) ────────────────────────────

export function classifyAutomatedResult(
  exec: ExecResult
): { status: 'PASS' | 'FAIL'; evidence: string } {
  if (exec.timedOut) {
    return { status: 'FAIL', evidence: `TIMEOUT after ${exec.timeoutMs ?? 0}ms` };
  }
  const lines = exec.stdout.split('\n');
  let lastNonEmpty = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== '') {
      lastNonEmpty = lines[i].trim();
      break;
    }
  }
  const markerPass = lastNonEmpty === 'PASS';
  if (markerPass && exec.exitCode === 0) {
    return { status: 'PASS', evidence: exec.stdout.trim() };
  }
  return {
    status: 'FAIL',
    evidence: `exit_code=${exec.exitCode}\nstdout=${exec.stdout}\nstderr=${exec.stderr}`,
  };
}

// ── Utility: numeric-first criterion-id sort ─────────────────────────────────

function sortCriterionKeys(keys: string[]): string[] {
  const allNumeric = keys.every((k) => /^\d+$/.test(k));
  if (allNumeric) return [...keys].sort((a, b) => Number(a) - Number(b));
  return [...keys].sort();
}

function resolveTaskPhase(state: ValidationState, taskId: string): string | undefined {
  for (const [pid, phase] of Object.entries(state.phases)) {
    if (taskId in phase.tasks) return pid;
  }
  return undefined;
}

// ── Main orchestrator ────────────────────────────────────────────────────────

export function run(options: RunOptions): RunResult {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const results: CriterionResult[] = [];
  const dryRun = options.dryRun === true;
  const strategy: ManualPromptStrategy = options.manualPromptStrategy ?? 'stdin';
  const timeoutMs = getDefaultTimeoutMs();
  const projectRoot = dirname(resolve(options.path));

  // Read state (exit 3 on checksum drift, exit 2 on other schema/IO errors).
  let state: ValidationState;
  try {
    state = readState(options.path);
  } catch (err) {
    if (err instanceof ChecksumError) {
      stderrLines.push(`ERROR: ${err.code}: ${err.message}`);
      return emptyResult(3, stdoutLines, stderrLines);
    }
    if (err instanceof StateManagerError) {
      stderrLines.push(`ERROR: ${err.code}: ${err.message}`);
      return emptyResult(2, stdoutLines, stderrLines);
    }
    stderrLines.push(`ERROR: ${(err as Error).message}`);
    return emptyResult(2, stdoutLines, stderrLines);
  }

  // Resolve target task.
  const taskId = options.task ?? state.current_task;
  const phaseId = resolveTaskPhase(state, taskId);
  if (phaseId === undefined) {
    stderrLines.push(`ERROR: E_TARGET_NOT_FOUND: task not found: ${taskId}`);
    return emptyResult(1, stdoutLines, stderrLines);
  }
  const task = state.phases[phaseId].tasks[taskId];
  const critKeys = sortCriterionKeys(Object.keys(task.criteria));

  if (dryRun) stdoutLines.push('[DRY RUN — state file not modified]');

  const writeFn = options.writeStateOverride ?? writeState;
  const execFn = options.exec ?? ((cmd: string, o: { timeoutMs: number }) => runShellCommand(cmd, o));

  let summaryPassed = 0;
  let summaryFailed = 0;
  let summaryManual = 0;
  let answerConsumed = false;
  let systemError = false;

  for (const cid of critKeys) {
    const crit = task.criteria[cid];
    // Re-evaluate PENDING and FAIL criteria (red→green cycle); skip PASS as idempotent.
    if (crit.status === 'PASS') continue;

    if (crit.type === 'manual') {
      summaryManual++;
      if (dryRun) {
        stdoutLines.push(`would prompt: ${crit.prompt}`);
        continue;
      }

      // Resolve answer: --answer takes precedence.
      let answer: string | undefined;
      if (options.answer !== undefined && !answerConsumed) {
        answer = options.answer;
        answerConsumed = true;
      } else if (strategy === 'askuser') {
        // Emit payload to stderr and exit 4.
        const payload: AskUserPayload = {
          exit_reason: 'manual_criterion_needs_askuser',
          task: taskId,
          criterion: cid,
          prompt: crit.prompt as string,
          resume_command: `CheckRunner run --task ${taskId} --manual-prompt-strategy askuser --answer <RESPONSE>`,
        };
        stderrLines.push(JSON.stringify(payload));
        return {
          task: taskId,
          results,
          summary: { passed: summaryPassed, failed: summaryFailed, manual: summaryManual },
          advanced: false,
          exitCode: 4,
          askUserPayload: payload,
          stdoutLines,
          stderrLines,
        };
      } else {
        // stdin strategy
        if (!options.stdinReadLine) {
          stderrLines.push(`ERROR: stdinReadLine required for stdin strategy`);
          systemError = true;
          break;
        }
        stdoutLines.push(`MANUAL: ${crit.prompt}`);
        const raw = options.stdinReadLine();
        answer = raw;
      }

      const trimmed = (answer ?? '').trim();
      let critResult: CriterionResult;
      if (trimmed === '') {
        critResult = { id: cid, status: 'FAIL', evidence: 'no answer provided' };
      } else {
        critResult = { id: cid, status: 'PASS', evidence: trimmed };
      }
      results.push(critResult);
      if (critResult.status === 'PASS') summaryPassed++;
      else summaryFailed++;

      // Update state and emit event.
      try {
        state = updateCriterion(state, taskId, cid, critResult.status, critResult.evidence);
        writeFn(options.path, state);
      } catch (err) {
        if (err instanceof StateManagerError) {
          stderrLines.push(`ERROR: ${err.code}: ${err.message}`);
        } else {
          stderrLines.push(`ERROR: ${(err as Error).message}`);
        }
        systemError = true;
        break;
      }

      emitCriterionEvent(projectRoot, taskId, cid, critResult, /*isAutomated*/ false);
    } else {
      // Automated
      let execResult: ExecResult;
      try {
        execResult = execFn(crit.command as string, { timeoutMs });
      } catch (err) {
        stderrLines.push(`ERROR: exec failed: ${(err as Error).message}`);
        systemError = true;
        break;
      }

      const classified = classifyAutomatedResult(execResult);
      const critResult: CriterionResult = {
        id: cid,
        status: classified.status,
        evidence: classified.evidence,
      };
      results.push(critResult);
      if (critResult.status === 'PASS') summaryPassed++;
      else summaryFailed++;

      if (dryRun) continue;

      try {
        state = updateCriterion(state, taskId, cid, critResult.status, critResult.evidence);
        writeFn(options.path, state);
      } catch (err) {
        if (err instanceof StateManagerError) {
          stderrLines.push(`ERROR: ${err.code}: ${err.message}`);
        } else {
          stderrLines.push(`ERROR: ${(err as Error).message}`);
        }
        systemError = true;
        break;
      }

      emitCriterionEvent(projectRoot, taskId, cid, critResult, /*isAutomated*/ true, execResult);
    }
  }

  if (systemError) {
    return {
      task: taskId,
      results,
      summary: { passed: summaryPassed, failed: summaryFailed, manual: summaryManual },
      advanced: false,
      exitCode: 2,
      stdoutLines,
      stderrLines,
    };
  }

  // Advance task if every criterion evaluated to PASS (and there was at least one).
  let advanced = false;
  let advanceFailed = false;
  if (!dryRun && results.length > 0 && summaryFailed === 0) {
    try {
      state = advanceTask(state, taskId, options.path);
      advanced = true;
    } catch (err) {
      advanceFailed = true;
      if (err instanceof StateManagerError) {
        stderrLines.push(`ERROR: ${err.code}: ${err.message}`);
      } else {
        stderrLines.push(`ERROR: ${(err as Error).message}`);
      }
    }
  }

  let exitCode = 0;
  if (summaryFailed > 0) {
    exitCode = 1;
    const failing = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
    stderrLines.push(`FAILED criteria: ${failing.join(', ')}`);
  } else if (advanceFailed) {
    exitCode = 2;
  }

  if (options.json) {
    const payload = {
      task: taskId,
      results: results.map((r) => ({ id: r.id, status: r.status, evidence: r.evidence })),
      summary: { passed: summaryPassed, failed: summaryFailed, manual: summaryManual },
      advanced,
    };
    // Replace any prose stdout with the single JSON object.
    stdoutLines.length = 0;
    stdoutLines.push(JSON.stringify(payload));
  }

  return {
    task: taskId,
    results,
    summary: { passed: summaryPassed, failed: summaryFailed, manual: summaryManual },
    advanced,
    exitCode,
    stdoutLines,
    stderrLines,
  };
}

function emitCriterionEvent(
  projectRoot: string,
  taskId: string,
  critId: string,
  result: CriterionResult,
  isAutomated: boolean,
  exec?: ExecResult
): void {
  if (result.status === 'PASS') {
    appendEvent(projectRoot, {
      type: 'plan.criterion.passed',
      source: 'CheckRunner',
      task: taskId,
      criterion: critId,
      evidence_len: result.evidence.length,
    });
  } else {
    const base: {
      type: 'plan.criterion.failed';
      source: 'CheckRunner';
      task: string;
      criterion: string;
      evidence_snippet: string;
      exit_code?: number;
    } = {
      type: 'plan.criterion.failed',
      source: 'CheckRunner',
      task: taskId,
      criterion: critId,
      evidence_snippet: result.evidence.slice(0, 240),
    };
    if (isAutomated && exec !== undefined && !exec.timedOut) {
      base.exit_code = exec.exitCode;
    }
    appendEvent(projectRoot, base);
  }
}

function emptyResult(exitCode: number, stdoutLines: string[], stderrLines: string[]): RunResult {
  return {
    task: '',
    results: [],
    summary: { passed: 0, failed: 0, manual: 0 },
    advanced: false,
    exitCode,
    stdoutLines,
    stderrLines,
  };
}

// ── Re-exports (FR-2.28, TR-7.7) ─────────────────────────────────────────────

export {
  readState,
  writeState,
  updateCriterion,
  advanceTask,
  findCurrentCriterion,
  StateManagerError,
  ChecksumError,
  PreconditionError,
  TargetNotFoundError,
  appendEvent,
};

// ── CLI entry point ──────────────────────────────────────────────────────────

function printHelp(): void {
  process.stdout.write(`CheckRunner — evaluate task criteria against validation.json

Usage: bun CheckRunner.ts run [flags]

Flags:
  --path <file>                      State file path (default: ./validation.json)
  --task <id>                        Explicit task id (else current_task)
  --dry-run                          Evaluate without writing state
  --manual-prompt-strategy stdin|askuser
                                     Manual criterion UX (default: stdin)
  --answer <response>                Supply answer for next manual criterion
  --json                             Machine-readable JSON output
  --verbose                          Extra diagnostics
  --help, -h                         This help text

Exit codes: 0 all PASS + advanced | 1 user error/FAIL | 2 system error
            3 checksum drift | 4 manual needs AskUserQuestion
`);
}

function parseCliArgs(argv: string[]): { sub: string; flags: Record<string, string | boolean> } {
  let sub = '';
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith('--')) {
    sub = argv[0];
    i = 1;
  }
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--verbose') flags.verbose = true;
    else if (a === '--dry-run') flags['dry-run'] = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith('--')) {
        flags[key] = nxt;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return { sub, flags };
}

function cliMain(argv: string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }
  const { sub, flags } = parseCliArgs(argv);
  if (sub !== 'run') {
    process.stderr.write(`unknown subcommand: ${sub}\n`);
    printHelp();
    return 1;
  }

  const options: RunOptions = {
    path: typeof flags.path === 'string' ? flags.path : './validation.json',
  };
  if (typeof flags.task === 'string') options.task = flags.task;
  if (flags['dry-run'] === true) options.dryRun = true;
  if (flags['manual-prompt-strategy'] === 'stdin' || flags['manual-prompt-strategy'] === 'askuser') {
    options.manualPromptStrategy = flags['manual-prompt-strategy'];
  }
  if (typeof flags.answer === 'string') options.answer = flags.answer;
  if (flags.json === true) options.json = true;
  if (flags.verbose === true) options.verbose = true;

  // stdin strategy CLI-side: read a line from stdin on demand.
  options.stdinReadLine = () => {
    try {
      const buf = require('fs').readFileSync(0, 'utf8') as string;
      const firstLine = buf.split('\n')[0] ?? '';
      return firstLine;
    } catch {
      return '';
    }
  };

  const result = run(options);
  for (const line of result.stdoutLines) process.stdout.write(line + '\n');
  for (const line of result.stderrLines) process.stderr.write(line + '\n');
  return result.exitCode;
}

if (import.meta.main) {
  const code = cliMain(process.argv.slice(2));
  process.exit(code);
}
