// event-types.ts — Types only (zero runtime code). Per D13.
// Discriminated union of plan.* events emitted by PlanGate, StateManager, CheckRunner.

export interface PlanEventBase {
  timestamp: string;
  session_id: string;
  source: 'PlanGate' | 'StateManager' | 'CheckRunner';
  type: string;
}

export interface PlanGateBlockedEvent extends PlanEventBase {
  type: 'plan.gate.blocked';
  tool: 'Bash' | 'Edit' | 'Write';
  task: string;
  reason_code: string;
  target_path?: string;
}

export interface PlanGateAllowedEvent extends PlanEventBase {
  type: 'plan.gate.allowed';
  tool: 'Bash' | 'Edit' | 'Write';
  task: string;
}

export interface PlanTaskAdvancedEvent extends PlanEventBase {
  type: 'plan.task.advanced';
  from_task: string;
  to_task: string;
  phase_rolled?: boolean;
  plan_completed?: boolean;
}

export interface PlanCriterionPassedEvent extends PlanEventBase {
  type: 'plan.criterion.passed';
  task: string;
  criterion: string;
  evidence_len: number;
}

export interface PlanCriterionFailedEvent extends PlanEventBase {
  type: 'plan.criterion.failed';
  task: string;
  criterion: string;
  exit_code?: number;
  evidence_snippet: string;
}

export type PlanExecutorEvent =
  | PlanGateBlockedEvent
  | PlanGateAllowedEvent
  | PlanTaskAdvancedEvent
  | PlanCriterionPassedEvent
  | PlanCriterionFailedEvent;

export type PlanExecutorEventInput = Omit<PlanExecutorEvent, 'timestamp' | 'session_id'>;
