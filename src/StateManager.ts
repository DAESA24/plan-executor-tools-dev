#!/usr/bin/env bun
/*!
 * StateManager.ts — Plan Executor Tools: validation.json lifecycle manager
 *
 * Sole writer and reader of validation.json for the Plan Executor Tools
 * kernel. One of three components — StateManager (this), CheckRunner,
 * PlanGate.hook — that together enforce plan-execution discipline.
 *
 * Usage:
 *   bun ~/.claude/PAI/Tools/StateManager.ts init --path ./validation.json
 *   bun ~/.claude/PAI/Tools/StateManager.ts read --task 2.1 --path ./validation.json
 *   bun ~/.claude/PAI/Tools/StateManager.ts advance-task --task 2.1 --path ./validation.json
 *   bun ~/.claude/PAI/Tools/StateManager.ts show --path ./validation.json
 *   bun ~/.claude/PAI/Tools/StateManager.ts --help
 *
 * Key guarantees: atomic write via temp-file + fsync + rename (D9);
 * SHA256 plan_checksum over the sorted criteria structure (D8);
 * unknown fields preserved across writes (D11).
 *
 * Full reference: docs/state-manager.md
 * Source: github.com/DAESA24/plan-executor-tools-dev
 */

import { createHash } from 'crypto';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  openSync,
  fsyncSync,
  closeSync,
  statSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';

import type {
  ValidationState,
  CriterionStatus,
  TaskStatus,
  PhaseStatus,
  Criterion,
  Task,
  Phase,
} from './lib/state-types';
import { appendEvent } from './lib/event-emitter';

export type { CriterionStatus, TaskStatus, PhaseStatus, Criterion, Task, Phase, ValidationState };

// ── Error hierarchy ──────────────────────────────────────────────────────────

export class StateManagerError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'StateManagerError';
    this.code = code;
  }
}

export class SchemaError extends StateManagerError {
  constructor(message: string, code = 'E_SCHEMA') {
    super(message, code);
    this.name = 'SchemaError';
  }
}

export class ChecksumError extends StateManagerError {
  constructor(message: string) {
    super(message, 'E_CHECKSUM_DRIFT');
    this.name = 'ChecksumError';
  }
}

export class TargetNotFoundError extends StateManagerError {
  constructor(message: string) {
    super(message, 'E_TARGET_NOT_FOUND');
    this.name = 'TargetNotFoundError';
  }
}

export class PreconditionError extends StateManagerError {
  nonPassCriteria?: string[];
  constructor(message: string, nonPassCriteria?: string[]) {
    super(message, 'E_CRITERIA_INCOMPLETE');
    this.name = 'PreconditionError';
    this.nonPassCriteria = nonPassCriteria;
  }
}

export class IOError extends StateManagerError {
  constructor(message: string) {
    super(message, 'E_WRITE');
    this.name = 'IOError';
  }
}

// ── Sorting helpers ──────────────────────────────────────────────────────────

function compareDottedNumeric(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? '';
    const sb = pb[i] ?? '';
    const na = Number(sa);
    const nb = Number(sb);
    const bothNumeric = sa !== '' && sb !== '' && Number.isFinite(na) && Number.isFinite(nb) && String(na) === sa && String(nb) === sb;
    if (bothNumeric) {
      if (na !== nb) return na - nb;
    } else {
      if (sa < sb) return -1;
      if (sa > sb) return 1;
    }
  }
  return 0;
}

function sortedKeysNumericFirst(obj: Record<string, unknown>): string[] {
  const keys = Object.keys(obj);
  const allNumeric = keys.every((k) => /^\d+$/.test(k));
  if (allNumeric) return keys.sort((a, b) => Number(a) - Number(b));
  return keys.sort();
}

// ── Checksum (D8) ────────────────────────────────────────────────────────────

function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(sortedStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + sortedStringify(obj[k])).join(',') + '}';
}

function projectCriterion(c: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { check: c.check, type: c.type };
  if (c.type === 'automated') out.command = c.command;
  if (c.type === 'manual') out.prompt = c.prompt;
  return out;
}

function projectState(state: ValidationState): Record<string, unknown> {
  const phasesOut: Record<string, unknown> = {};
  const phaseKeys = Object.keys(state.phases).sort();
  for (const pid of phaseKeys) {
    const phase = state.phases[pid];
    const tasksOut: Record<string, unknown> = {};
    const taskKeys = Object.keys(phase.tasks).sort(compareDottedNumeric);
    for (const tid of taskKeys) {
      const task = phase.tasks[tid];
      const critsOut: Record<string, unknown> = {};
      const critKeys = sortedKeysNumericFirst(task.criteria);
      for (const cid of critKeys) {
        critsOut[cid] = projectCriterion(task.criteria[cid] as unknown as Record<string, unknown>);
      }
      tasksOut[tid] = { criteria: critsOut };
    }
    phasesOut[pid] = { tasks: tasksOut };
  }
  return { phases: phasesOut };
}

export function computePlanChecksum(state: ValidationState): string {
  const projection = projectState(state);
  const canonical = sortedStringify(projection);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'sha256:' + hash;
}

function isValidChecksumFormat(s: unknown): s is string {
  return typeof s === 'string' && /^sha256:[0-9a-f]{64}$/.test(s);
}

// ── Raw parse + schema validation ────────────────────────────────────────────

function parseStateFile(path: string): ValidationState {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new IOError(`read failed: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SchemaError(`malformed JSON: ${(err as Error).message}`, 'E_MALFORMED_JSON');
  }
  assertMinimalSchema(parsed);
  return parsed as ValidationState;
}

function assertMinimalSchema(parsed: unknown): asserts parsed is ValidationState {
  if (parsed === null || typeof parsed !== 'object') {
    throw new SchemaError('state is not an object');
  }
  const obj = parsed as Record<string, unknown>;
  for (const field of ['phases', 'current_phase', 'current_task']) {
    if (!(field in obj)) throw new SchemaError(`missing required field: ${field}`);
  }
  if (obj.phases === null || typeof obj.phases !== 'object') {
    throw new SchemaError('phases must be an object');
  }
}

// ── Atomic write (D9) ────────────────────────────────────────────────────────

export function writeState(path: string, state: ValidationState): void {
  const tmp = path + '.tmp';
  const dir = dirname(path);
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(state, null, 2);
    // Write via fd so we can fsync before rename.
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, json, 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
    throw new IOError(`write failed: ${(err as Error).message}`);
  }
}

// ── Read with checksum validation ────────────────────────────────────────────

export function readState(path: string): ValidationState {
  const state = parseStateFile(path);
  if (state.plan_checksum !== null && state.plan_checksum !== undefined) {
    const recomputed = computePlanChecksum(state);
    if (!isValidChecksumFormat(state.plan_checksum) || state.plan_checksum !== recomputed) {
      throw new ChecksumError(
        `plan_checksum mismatch: stored=${state.plan_checksum} recomputed=${recomputed}`
      );
    }
  }
  return state;
}

// ── Pointer management ───────────────────────────────────────────────────────

function pointerPath(): string {
  const home = process.env.HOME ?? homedir();
  return join(home, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
}

function writePointer(validationPath: string, state: ValidationState): void {
  try {
    const target = pointerPath();
    const dir = dirname(target);
    mkdirSync(dir, { recursive: true });
    const pointer = {
      validation_path: resolve(validationPath),
      project: state.project,
      activated_at: new Date().toISOString(),
      session_id: process.env.CLAUDE_SESSION_ID ?? 'unknown',
    };
    const tmp = target + '.tmp';
    const fd = openSync(tmp, 'w');
    try {
      writeFileSync(fd, JSON.stringify(pointer, null, 2), 'utf8');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, target);
  } catch {
    // Pointer write failures are non-fatal — state write is primary.
  }
}

function deletePointer(): void {
  try {
    const target = pointerPath();
    if (existsSync(target)) unlinkSync(target);
  } catch {
    // Best effort.
  }
}

// ── Init (compute + stamp + write pointer) ───────────────────────────────────

export function initState(path: string): ValidationState {
  const state = parseStateFile(path);
  const recomputed = computePlanChecksum(state);

  if (state.plan_checksum === null || state.plan_checksum === undefined) {
    // First init: stamp and write.
    state.plan_checksum = recomputed;
    state.initialized = new Date().toISOString();
    writeState(path, state);
    writePointer(path, state);
    return state;
  }

  // Re-init path: must match.
  if (state.plan_checksum === recomputed) {
    // Idempotent no-op — no write, no pointer update.
    return state;
  }

  throw new ChecksumError(
    `plan_checksum drift: stored=${state.plan_checksum} recomputed=${recomputed}`
  );
}

// ── Pure transforms ──────────────────────────────────────────────────────────

function cloneState(state: ValidationState): ValidationState {
  return JSON.parse(JSON.stringify(state)) as ValidationState;
}

export function updateCriterion(
  state: ValidationState,
  taskId: string,
  criterionId: string,
  status: 'PASS' | 'FAIL',
  evidence: string
): ValidationState {
  if (status !== 'PASS' && status !== 'FAIL') {
    throw new StateManagerError(`invalid status: ${String(status)}`, 'E_INVALID_STATUS');
  }
  const { phaseId } = resolveTask(state, taskId);
  const next = cloneState(state);
  const task = next.phases[phaseId].tasks[taskId];
  if (!(criterionId in task.criteria)) {
    throw new TargetNotFoundError(`criterion not found: ${taskId}:${criterionId}`);
  }
  const criterion = task.criteria[criterionId];
  criterion.status = status;
  criterion.evidence = evidence;
  if (task.status === 'PENDING') task.status = 'IN_PROGRESS';
  if (status === 'FAIL') task.fix_attempts = (task.fix_attempts ?? 0) + 1;
  return next;
}

function resolveTask(state: ValidationState, taskId: string): { phaseId: string; task: Task } {
  for (const [pid, phase] of Object.entries(state.phases)) {
    if (taskId in phase.tasks) return { phaseId: pid, task: phase.tasks[taskId] };
  }
  throw new TargetNotFoundError(`task not found: ${taskId}`);
}

export function advanceTask(
  state: ValidationState,
  taskId: string,
  validationPath?: string
): ValidationState {
  const { phaseId } = resolveTask(state, taskId);
  const task = state.phases[phaseId].tasks[taskId];

  const nonPass = Object.entries(task.criteria)
    .filter(([, c]) => c.status !== 'PASS')
    .map(([cid]) => cid);
  if (nonPass.length > 0) {
    throw new PreconditionError(
      `task ${taskId} has non-PASS criteria: ${nonPass.join(', ')}`,
      nonPass
    );
  }

  const next = cloneState(state);
  const nextTask = next.phases[phaseId].tasks[taskId];
  nextTask.status = 'PASS';
  nextTask.verified_at = new Date().toISOString();

  const { nextTaskId, nextPhaseId, phaseRolled, planCompleted } = findNextPointer(next, phaseId, taskId);

  let fromTask = taskId;
  let toTask = nextTaskId ?? taskId;

  if (planCompleted) {
    next.status = 'COMPLETED';
    // Mark the last phase as PASS too.
    next.phases[phaseId].status = 'PASS';
  } else if (phaseRolled) {
    next.phases[phaseId].status = 'PASS';
    if (nextPhaseId !== undefined) {
      next.current_phase = Number(nextPhaseId);
      next.current_task = nextTaskId ?? next.current_task;
      if (next.phases[nextPhaseId].status === 'PENDING') {
        next.phases[nextPhaseId].status = 'IN_PROGRESS';
      }
    }
  } else if (nextTaskId !== undefined) {
    next.current_task = nextTaskId;
  }

  if (validationPath !== undefined) {
    writeState(validationPath, next);

    const projectRoot = dirname(resolve(validationPath));
    const eventInput: {
      type: 'plan.task.advanced';
      source: 'StateManager';
      from_task: string;
      to_task: string;
      phase_rolled?: boolean;
      plan_completed?: boolean;
    } = {
      type: 'plan.task.advanced',
      source: 'StateManager',
      from_task: fromTask,
      to_task: toTask,
    };
    if (phaseRolled) eventInput.phase_rolled = true;
    if (planCompleted) eventInput.plan_completed = true;
    appendEvent(projectRoot, eventInput);

    if (planCompleted) deletePointer();
  }

  return next;
}

function findNextPointer(
  state: ValidationState,
  currentPhaseId: string,
  currentTaskId: string
): {
  nextTaskId: string | undefined;
  nextPhaseId: string | undefined;
  phaseRolled: boolean;
  planCompleted: boolean;
} {
  const taskKeys = Object.keys(state.phases[currentPhaseId].tasks).sort(compareDottedNumeric);
  const idx = taskKeys.indexOf(currentTaskId);
  if (idx >= 0 && idx + 1 < taskKeys.length) {
    return {
      nextTaskId: taskKeys[idx + 1],
      nextPhaseId: undefined,
      phaseRolled: false,
      planCompleted: false,
    };
  }

  const phaseKeys = Object.keys(state.phases).sort((a, b) => Number(a) - Number(b));
  const pidx = phaseKeys.indexOf(currentPhaseId);
  if (pidx >= 0 && pidx + 1 < phaseKeys.length) {
    const nextPhaseId = phaseKeys[pidx + 1];
    const nextPhaseTaskKeys = Object.keys(state.phases[nextPhaseId].tasks).sort(compareDottedNumeric);
    return {
      nextTaskId: nextPhaseTaskKeys[0],
      nextPhaseId,
      phaseRolled: true,
      planCompleted: false,
    };
  }

  return {
    nextTaskId: undefined,
    nextPhaseId: undefined,
    phaseRolled: false,
    planCompleted: true,
  };
}

export function findCurrentCriterion(state: ValidationState): {
  phaseId: string;
  taskId: string;
  criterion: Criterion | null;
  criterionId: string | null;
} {
  const phaseId = String(state.current_phase);
  const taskId = state.current_task;
  const phase = state.phases[phaseId];
  if (!phase || !(taskId in phase.tasks)) {
    throw new TargetNotFoundError(`current_task not resolvable: phase=${phaseId} task=${taskId}`);
  }
  const task = phase.tasks[taskId];
  const critKeys = sortedKeysNumericFirst(task.criteria);
  for (const cid of critKeys) {
    if (task.criteria[cid].status === 'PENDING') {
      return { phaseId, taskId, criterion: task.criteria[cid], criterionId: cid };
    }
  }
  return { phaseId, taskId, criterion: null, criterionId: null };
}

// ── validateState (schema-only; no checksum) ─────────────────────────────────

type ValidateIssue = { type: string; [k: string]: unknown };

export function validateState(
  path: string
): { ok: boolean; errors: ValidateIssue[]; warnings: ValidateIssue[] } {
  const errors: ValidateIssue[] = [];
  const warnings: ValidateIssue[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      errors: [{ type: 'malformed_json', message: (err as Error).message }],
      warnings: [],
    };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, errors: [{ type: 'not_an_object' }], warnings: [] };
  }
  const obj = parsed as Record<string, any>;

  const VALID_TOPLEVEL_STATUS = new Set(['IN_PROGRESS', 'COMPLETED', 'ABANDONED']);
  const VALID_PHASE_STATUS = new Set(['PENDING', 'IN_PROGRESS', 'PASS', 'BLOCKED']);
  const VALID_TASK_STATUS = new Set(['PENDING', 'IN_PROGRESS', 'PASS', 'FAIL', 'BLOCKED']);
  const VALID_CRIT_STATUS = new Set(['PENDING', 'PASS', 'FAIL']);

  for (const field of ['plan', 'project', 'status', 'current_phase', 'current_task', 'phases']) {
    if (!(field in obj)) errors.push({ type: 'missing_field', field });
  }

  if ('status' in obj && typeof obj.status === 'string' && !VALID_TOPLEVEL_STATUS.has(obj.status)) {
    errors.push({ type: 'invalid_enum', field: 'status', value: obj.status });
  }

  if (obj.phases !== null && typeof obj.phases === 'object') {
    for (const [pid, phase] of Object.entries(obj.phases as Record<string, any>)) {
      if (!phase || typeof phase !== 'object') {
        errors.push({ type: 'invalid_phase', phase: pid });
        continue;
      }
      if (!('status' in phase)) {
        errors.push({ type: 'missing_field', field: 'status', phase: pid });
      } else if (typeof phase.status === 'string' && !VALID_PHASE_STATUS.has(phase.status)) {
        warnings.push({ type: 'unknown_enum', field: 'status', value: phase.status, phase: pid });
      }
      const tasks = phase.tasks ?? {};
      for (const [tid, task] of Object.entries(tasks as Record<string, any>)) {
        if (!task || typeof task !== 'object') {
          errors.push({ type: 'invalid_task', task: tid });
          continue;
        }
        if (!('status' in task)) {
          errors.push({ type: 'missing_field', field: 'status', task: tid });
        } else if (typeof task.status === 'string' && !VALID_TASK_STATUS.has(task.status)) {
          warnings.push({ type: 'unknown_enum', field: 'status', value: task.status, task: tid });
        }
        const criteria = task.criteria ?? {};
        for (const [cid, crit] of Object.entries(criteria as Record<string, any>)) {
          if (!crit || typeof crit !== 'object') {
            errors.push({ type: 'invalid_criterion', criterion: cid });
            continue;
          }
          if (crit.type === 'automated' && !('command' in crit)) {
            errors.push({ type: 'missing_command', task: tid, criterion: cid });
          }
          if (crit.type === 'manual' && !('prompt' in crit)) {
            errors.push({ type: 'missing_prompt', task: tid, criterion: cid });
          }
          if ('status' in crit && typeof crit.status === 'string' && !VALID_CRIT_STATUS.has(crit.status)) {
            warnings.push({ type: 'unknown_enum', field: 'status', value: crit.status, criterion: cid });
          }
        }
      }
    }
  }

  if ('current_phase' in obj && 'current_task' in obj && obj.phases && typeof obj.phases === 'object') {
    const pid = String(obj.current_phase);
    const phase = (obj.phases as Record<string, any>)[pid];
    if (!phase || !phase.tasks || !(obj.current_task in phase.tasks)) {
      errors.push({ type: 'orphaned_current_task', current_task: obj.current_task, current_phase: obj.current_phase });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ── CLI entry point ──────────────────────────────────────────────────────────

function printHelp(): void {
  const help = `StateManager — validation.json lifecycle manager

Usage: bun StateManager.ts <subcommand> [flags]

Subcommands:
  init              Compute plan_checksum and stamp initialized
  read              Read-only projection (validates checksum)
  update-criterion  Flip a criterion PASS|FAIL
  advance-task      Advance current_task when all criteria PASS
  show              Human-readable phase rendering
  validate          Schema-only validation (does not check checksum)
  checksum          Emit recomputed plan_checksum

Global flags:
  --path <file>     State file path (default: ./validation.json)
  --json            Machine-readable JSON output
  --verbose         Extra diagnostics
  --help, -h        This help text
`;
  process.stdout.write(help);
}

function parseFlags(argv: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--verbose') {
      flags.verbose = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith('--')) {
        flags[key] = nxt;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

function cliMain(argv: string[]): number {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return 0;
  }

  const [sub, ...rest] = argv;
  const { flags } = parseFlags(rest);
  const pathArg = typeof flags.path === 'string' ? flags.path : './validation.json';

  try {
    switch (sub) {
      case 'init': {
        const state = initState(pathArg);
        if (flags.json) {
          process.stdout.write(JSON.stringify({ ok: true, plan_checksum: state.plan_checksum, initialized: state.initialized }) + '\n');
        } else {
          process.stdout.write(`initialized ${pathArg} (checksum ${state.plan_checksum})\n`);
        }
        return 0;
      }
      case 'read': {
        const state = readState(pathArg);
        if (typeof flags.task === 'string') {
          const { task } = resolveTask(state, flags.task);
          process.stdout.write(JSON.stringify(task, null, 2) + '\n');
        } else if (typeof flags.phase === 'string') {
          const phase = state.phases[flags.phase];
          if (!phase) throw new TargetNotFoundError(`phase not found: ${flags.phase}`);
          process.stdout.write(JSON.stringify(phase, null, 2) + '\n');
        } else if (typeof flags.criterion === 'string') {
          const [tid, cid] = flags.criterion.split(':');
          const { phaseId, task } = resolveTask(state, tid);
          if (!(cid in task.criteria)) throw new TargetNotFoundError(`criterion not found: ${flags.criterion}`);
          process.stdout.write(JSON.stringify({ phase: phaseId, task: tid, criterion: cid, object: task.criteria[cid] }, null, 2) + '\n');
        } else {
          process.stdout.write(JSON.stringify(state, null, 2) + '\n');
        }
        return 0;
      }
      case 'update-criterion': {
        const state = readState(pathArg);
        const taskId = String(flags.task ?? '');
        const critId = String(flags.criterion ?? '');
        const status = String(flags.status ?? '') as 'PASS' | 'FAIL';
        let evidence = typeof flags.evidence === 'string' ? flags.evidence : '';
        if (evidence === '-') {
          evidence = readFileSync(0, 'utf8');
        }
        const next = updateCriterion(state, taskId, critId, status, evidence);
        writeState(pathArg, next);
        if (flags.json) {
          process.stdout.write(JSON.stringify({ ok: true, task: taskId, criterion: critId, status, evidence_len: evidence.length }) + '\n');
        } else {
          process.stdout.write(`ok: ${taskId} criterion ${critId} → ${status}\n`);
        }
        return 0;
      }
      case 'advance-task': {
        const state = readState(pathArg);
        const taskId = String(flags.task ?? '');
        const next = advanceTask(state, taskId, pathArg);
        if (flags.json) {
          process.stdout.write(JSON.stringify({
            ok: true,
            advanced_to: next.current_task,
            phase_complete: state.current_phase !== next.current_phase,
            plan_complete: next.status === 'COMPLETED',
          }) + '\n');
        } else {
          process.stdout.write(`ok: ${taskId} PASS → ${next.current_task} now current\n`);
        }
        return 0;
      }
      case 'show': {
        const state = readState(pathArg);
        const phaseId = typeof flags.phase === 'string' ? flags.phase : String(state.current_phase);
        const phase = state.phases[phaseId];
        if (!phase) throw new TargetNotFoundError(`phase not found: ${phaseId}`);
        if (flags.json) {
          process.stdout.write(JSON.stringify(phase, null, 2) + '\n');
        } else {
          process.stdout.write(renderPhase(phaseId, phase));
        }
        return 0;
      }
      case 'validate': {
        const result = validateState(pathArg);
        if (flags.json) {
          process.stdout.write(JSON.stringify(result) + '\n');
        } else {
          if (result.ok) process.stdout.write('OK\n');
          for (const e of result.errors) process.stdout.write(`ERROR: ${JSON.stringify(e)}\n`);
          for (const w of result.warnings) process.stdout.write(`WARN: ${JSON.stringify(w)}\n`);
        }
        return result.ok ? 0 : 1;
      }
      case 'checksum': {
        const state = parseStateFile(pathArg);
        const sum = computePlanChecksum(state);
        if (flags.json) {
          process.stdout.write(JSON.stringify({ plan_checksum: sum }) + '\n');
        } else {
          process.stdout.write(sum + '\n');
        }
        return 0;
      }
      default:
        process.stderr.write(`unknown subcommand: ${sub}\n`);
        printHelp();
        return 1;
    }
  } catch (err) {
    if (err instanceof ChecksumError) {
      process.stderr.write(`ERROR: ${err.code}: ${err.message}\n`);
      return 3;
    }
    if (err instanceof StateManagerError) {
      process.stderr.write(`ERROR: ${err.code}: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(`ERROR: ${(err as Error).message}\n`);
    return 2;
  }
}

function renderPhase(phaseId: string, phase: Phase): string {
  const icon = (s: string): string => {
    if (s === 'PASS') return '✓';
    if (s === 'FAIL') return '✗';
    return '…';
  };
  const lines: string[] = [`Phase ${phaseId} — ${phase.name} [${phase.status}]`];
  const taskKeys = Object.keys(phase.tasks).sort(compareDottedNumeric);
  for (const tid of taskKeys) {
    const task = phase.tasks[tid];
    lines.push(`  ${icon(task.status)} Task ${tid} — ${task.name} [${task.status}]`);
    const critKeys = sortedKeysNumericFirst(task.criteria);
    for (const cid of critKeys) {
      const c = task.criteria[cid];
      lines.push(`    ${icon(c.status)} ${cid}: ${c.check} [${c.status}]`);
    }
  }
  return lines.join('\n') + '\n';
}

if (import.meta.main) {
  const code = cliMain(process.argv.slice(2));
  process.exit(code);
}
