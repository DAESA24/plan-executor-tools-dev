// state-types.ts — Types only (zero runtime code). Per D13: types separated from runtime.
// Defines the validation.json schema types consumed by StateManager, CheckRunner, PlanGateHandler.

export type CriterionStatus = 'PENDING' | 'PASS' | 'FAIL';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'PASS' | 'FAIL' | 'BLOCKED';
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'PASS' | 'BLOCKED';

export interface AutomatedCriterion {
  check: string;
  type: 'automated';
  command: string;
  status: CriterionStatus;
  evidence: string;
  [key: string]: unknown;
}

export interface ManualCriterion {
  check: string;
  type: 'manual';
  prompt: string;
  status: CriterionStatus;
  evidence: string;
  [key: string]: unknown;
}

export type Criterion = AutomatedCriterion | ManualCriterion;

export interface Task {
  name: string;
  status: TaskStatus;
  verified_at: string | null;
  fix_attempts: number;
  criteria: Record<string, Criterion>;
  [key: string]: unknown;
}

export interface Phase {
  name: string;
  status: PhaseStatus;
  tasks: Record<string, Task>;
  [key: string]: unknown;
}

export interface ValidationState {
  plan: string;
  project: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  plan_checksum: string | null;
  initialized: string | null;
  current_phase: number;
  current_task: string;
  notes?: string;
  phases: Record<string, Phase>;
  [key: string]: unknown;
}
