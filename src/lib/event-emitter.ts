// event-emitter.ts — Project-local JSONL event emission (D5).
// Writes to <projectRoot>/.plan-executor/events.jsonl via fs.appendFileSync.
// Never throws — observability must not break host code.

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { PlanExecutorEventInput } from './event-types';

export function appendEvent(projectRoot: string, event: PlanExecutorEventInput): void {
  try {
    const dir = join(projectRoot, '.plan-executor');
    mkdirSync(dir, { recursive: true });
    const gitignore = join(dir, '.gitignore');
    if (!existsSync(gitignore)) {
      writeFileSync(gitignore, '*\n', 'utf8');
    }
    const enriched = {
      timestamp: new Date().toISOString(),
      session_id: process.env.CLAUDE_SESSION_ID ?? 'unknown',
      ...event,
    };
    appendFileSync(join(dir, 'events.jsonl'), JSON.stringify(enriched) + '\n', 'utf8');
  } catch {
    // Observability must never break host code.
  }
}

export function resolveProjectRoot(validationPath: string): string {
  return dirname(validationPath);
}
