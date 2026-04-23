/**
 * PlanGateHandler.ts — Pure decide() function for the PlanGate hook
 *
 * Per D3 handler-delegate pattern: no stdin reads, no process.exit, no
 * side effects beyond appendEvent. The wrapper src/PlanGate.hook.ts
 * handles I/O and inlines this file at build time.
 *
 * Full reference: docs/plan-gate.md
 */

import { existsSync, readFileSync, realpathSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';

import {
  readState,
  ChecksumError,
  SchemaError,
  StateManagerError,
  type ValidationState,
} from '../StateManager';
import { appendEvent } from '../lib/event-emitter';
import type {
  PreToolUseHookInput,
  DecisionResult,
  ReasonCode,
  ToolName,
} from '../lib/hook-types';

export type { PreToolUseHookInput, DecisionResult, ReasonCode };

const KNOWN_TOOLS: ReadonlySet<string> = new Set(['Bash', 'Edit', 'Write']);

interface Pointer {
  validation_path: string;
  project: string;
  activated_at: string;
  session_id: string;
}

function pointerPath(): string {
  const home = process.env.HOME ?? homedir();
  return join(home, '.claude', 'MEMORY', 'STATE', 'plan-executor.active.json');
}

function readPointer(): Pointer | null {
  const p = pointerPath();
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Pointer;
    if (typeof parsed.validation_path !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function expandHome(p: string): string {
  if (p === '~') return process.env.HOME ?? homedir();
  if (p.startsWith('~/')) return join(process.env.HOME ?? homedir(), p.slice(2));
  return p;
}

function tryRealpath(p: string): string | null {
  try {
    return realpathSync(expandHome(p));
  } catch {
    return null;
  }
}

function resolveAllowListedPaths(): { sm: string | null; cr: string | null } {
  const home = process.env.HOME ?? homedir();
  const smRaw = join(home, '.claude', 'PAI', 'Tools', 'StateManager.ts');
  const crRaw = join(home, '.claude', 'PAI', 'Tools', 'CheckRunner.ts');
  return { sm: tryRealpath(smRaw), cr: tryRealpath(crRaw) };
}

// Bash tokenisation — honours single-quoted and double-quoted strings and
// collapses \-newline continuations. Inside single quotes, no escaping; inside
// double quotes, \" escapes a quote. Everything else is whitespace-delimited.
export function tokeniseBashCommand(cmd: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = cmd.length;
  const collapsed = cmd.replace(/\\\n/g, ' ');
  const src = collapsed;
  const len = src.length;

  while (i < len) {
    while (i < len && /\s/.test(src[i])) i++;
    if (i >= len) break;
    let tok = '';
    let inSingle = false;
    let inDouble = false;
    while (i < len) {
      const c = src[i];
      if (inSingle) {
        if (c === "'") { inSingle = false; i++; continue; }
        tok += c; i++; continue;
      }
      if (inDouble) {
        if (c === '"') { inDouble = false; i++; continue; }
        if (c === '\\' && i + 1 < len && src[i + 1] === '"') { tok += '"'; i += 2; continue; }
        tok += c; i++; continue;
      }
      if (c === "'") { inSingle = true; i++; continue; }
      if (c === '"') { inDouble = true; i++; continue; }
      if (/\s/.test(c)) break;
      tok += c; i++;
    }
    tokens.push(tok);
  }
  // Silence unused binding warning if any; keep n for potential extension.
  void n;
  return tokens;
}

function bashCommandMatchesAllowList(
  command: string,
  allow: { sm: string | null; cr: string | null }
): boolean {
  const tokens = tokeniseBashCommand(command);
  for (const tok of tokens) {
    if (!tok || tok.startsWith('-')) continue;
    const real = tryRealpath(tok);
    if (!real) continue;
    if (allow.sm && real === allow.sm) return true;
    if (allow.cr && real === allow.cr) return true;
  }
  return false;
}

function isUnderProjectRoot(targetPath: string, projectRoot: string): boolean {
  const rootReal = tryRealpath(projectRoot);
  if (!rootReal) return false;
  // For brand-new files, the target itself won't resolve — fall back to parent.
  const targetReal = tryRealpath(targetPath) ?? tryRealpath(dirname(targetPath));
  if (!targetReal) return false;
  const rootWithSep = rootReal.endsWith('/') ? rootReal : rootReal + '/';
  if (targetReal === rootReal) return true;
  return targetReal.startsWith(rootWithSep);
}

function pointsAtValidationFile(
  targetPath: string,
  validationPath: string
): boolean {
  const targetReal = tryRealpath(targetPath);
  const validationReal = tryRealpath(validationPath);
  if (targetReal && validationReal && targetReal === validationReal) return true;
  // For a not-yet-existing target (unlikely for validation.json but defensive):
  return resolve(targetPath) === resolve(validationPath);
}

function gateMessage(taskId: string, taskName: string): string {
  return [
    `PlanGate: task ${taskId} "${taskName}" is not yet PASS.`,
    '',
    'Run verification before mutating files:',
    '',
    `  bun ~/.claude/PAI/Tools/CheckRunner.ts run --task ${taskId}`,
    '',
    'If the criteria pass, advancement is automatic. If they fail, fix the',
    'specific issue and re-run CheckRunner.',
  ].join('\n');
}

function buildBlock(
  reasonCode: ReasonCode,
  reasonText: string,
  targetPath?: string
): DecisionResult {
  const result: DecisionResult = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reasonText,
    },
    reasonCode,
  };
  if (targetPath !== undefined) result.targetPath = targetPath;
  return result;
}

function emitBlocked(
  projectRoot: string,
  tool: ToolName,
  task: string,
  reasonCode: ReasonCode,
  targetPath?: string
): void {
  const event: {
    type: 'plan.gate.blocked';
    source: 'PlanGate';
    tool: ToolName;
    task: string;
    reason_code: ReasonCode;
    target_path?: string;
  } = {
    type: 'plan.gate.blocked',
    source: 'PlanGate',
    tool,
    task,
    reason_code: reasonCode,
  };
  if (reasonCode === 'state_file_write_attempt' && targetPath !== undefined) {
    event.target_path = targetPath;
  }
  appendEvent(projectRoot, event);
}

function emitAllowed(projectRoot: string, tool: ToolName, task: string): void {
  appendEvent(projectRoot, {
    type: 'plan.gate.allowed',
    source: 'PlanGate',
    tool,
    task,
  });
}

function emitHookError(projectRoot: string, message: string): void {
  appendEvent(projectRoot, {
    // Loose type to avoid coupling to PlanExecutorEvent union for ad-hoc errors.
    type: 'hook.error',
    source: 'PlanGate',
    message,
  } as unknown as Parameters<typeof appendEvent>[1]);
}

export function decide(input: PreToolUseHookInput): DecisionResult {
  // 1. No pointer → silent allow.
  const pointer = readPointer();
  if (!pointer) return {};

  const projectRoot = dirname(pointer.validation_path);

  // 2. Stale pointer → allow + hook.error.
  if (!existsSync(pointer.validation_path)) {
    emitHookError(projectRoot, `stale pointer: ${pointer.validation_path} does not exist`);
    return {};
  }

  // 3. Read state — BLOCK on ChecksumError or SchemaError.
  let state: ValidationState;
  try {
    state = readState(pointer.validation_path);
  } catch (err) {
    if (err instanceof ChecksumError) {
      emitBlocked(projectRoot, (input.tool_name as ToolName) ?? 'Bash', '', 'checksum_drift');
      return buildBlock(
        'checksum_drift',
        'PlanGate: validation.json plan_checksum does not match recomputed structure. ' +
          'The plan may have been modified without going through StateManager. ' +
          'Restore from git or re-init.'
      );
    }
    if (err instanceof SchemaError || err instanceof StateManagerError) {
      emitBlocked(projectRoot, (input.tool_name as ToolName) ?? 'Bash', '', 'state_malformed');
      return buildBlock(
        'state_malformed',
        'PlanGate: validation.json is malformed or missing required fields. ' +
          'Repair the state file or restore from git.'
      );
    }
    // Unknown error — fail open (hook best practice).
    emitHookError(projectRoot, `unexpected readState error: ${(err as Error).message}`);
    return {};
  }

  // 4. Unknown tool → silent allow.
  const toolName = input.tool_name;
  if (typeof toolName !== 'string' || !KNOWN_TOOLS.has(toolName)) return {};
  const tool = toolName as ToolName;

  // 5. Resolve current task.
  const taskId = state.current_task;
  const phaseId = String(state.current_phase);
  const phase = state.phases[phaseId];
  const task = phase?.tasks?.[taskId];
  if (!task) {
    // Pointer resolves to a state that can't find current_task — fail open.
    emitHookError(projectRoot, `current_task ${taskId} not found in phase ${phaseId}`);
    return {};
  }

  // 6. State-file write protection (applies BEFORE allow-list, BEFORE task.status check).
  if (tool === 'Write' || tool === 'Edit') {
    const filePath = (input.tool_input as { file_path?: unknown })?.file_path;
    if (typeof filePath === 'string' && pointsAtValidationFile(filePath, pointer.validation_path)) {
      emitBlocked(projectRoot, tool, taskId, 'state_file_write_attempt', filePath);
      return buildBlock(
        'state_file_write_attempt',
        `PlanGate: validation.json is written only by StateManager. Use:\n\n` +
          `  bun ~/.claude/PAI/Tools/StateManager.ts update-criterion|advance-task ...`,
        filePath
      );
    }
  }

  // 7. Bash allow-list.
  if (tool === 'Bash') {
    const command = (input.tool_input as { command?: unknown })?.command;
    if (typeof command === 'string') {
      const allow = resolveAllowListedPaths();
      if (bashCommandMatchesAllowList(command, allow)) {
        emitAllowed(projectRoot, tool, taskId);
        return {};
      }
    }
    if (task.status === 'PASS') {
      emitAllowed(projectRoot, tool, taskId);
      return {};
    }
    emitBlocked(projectRoot, tool, taskId, 'task_not_pass');
    return buildBlock('task_not_pass', gateMessage(taskId, task.name));
  }

  // 8. Edit / Write outside validation.json.
  if (tool === 'Edit' || tool === 'Write') {
    if (task.status === 'PASS') {
      emitAllowed(projectRoot, tool, taskId);
      return {};
    }
    // Brand-new file in project is fine only when task is PASS; we've already
    // established task !== PASS above. is_under_project_root check isn't a
    // bypass — it's informational for the reason message. We always BLOCK here.
    emitBlocked(projectRoot, tool, taskId, 'task_not_pass');
    return buildBlock('task_not_pass', gateMessage(taskId, task.name));
  }

  // Exhaustive — should never reach.
  return {};
}

// Re-exports for test AST inspection.
export { readState, ChecksumError, SchemaError, StateManagerError, appendEvent };
