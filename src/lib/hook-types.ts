// hook-types.ts — PreToolUse hook input + PlanGate decision types (D13, zero runtime).

export type ToolName = 'Bash' | 'Edit' | 'Write';

export interface BashToolInput {
  command: string;
  description?: string;
  run_in_background?: boolean;
}

export interface EditToolInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface WriteToolInput {
  file_path: string;
  content: string;
}

export interface PreToolUseHookInput {
  session_id: string;
  transcript_path?: string;
  hook_event_name: 'PreToolUse';
  tool_name: ToolName | string;
  tool_input: Record<string, unknown>;
  cwd?: string;
}

export type ReasonCode =
  | 'task_not_pass'
  | 'state_file_write_attempt'
  | 'checksum_drift'
  | 'state_malformed';

export interface HookSpecificOutput {
  hookEventName: 'PreToolUse';
  permissionDecision: 'deny';
  permissionDecisionReason: string;
}

export interface DecisionResult {
  hookSpecificOutput?: HookSpecificOutput;
  reasonCode?: ReasonCode;
  targetPath?: string;
}
