// gitignore.test.ts — appendEvent self-ignores its event log.
//
// The .plan-executor/ directory is project-local runtime telemetry and
// must never sneak into commits. Rather than asking every consumer to
// remember to add it to their .gitignore, the event emitter writes a
// .gitignore inside the directory at first event-emit so the contents
// (including events.jsonl) are auto-ignored. Idempotent: a pre-existing
// .gitignore is left alone (operator may have customized it).

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { appendEvent } from '../../src/lib/event-emitter';

describe('appendEvent writes .plan-executor/.gitignore on first emit', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'event-emitter-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  test('first emit writes .gitignore with content *\\n', () => {
    appendEvent(tmpDir, {
      type: 'plan.criterion.passed',
      source: 'CheckRunner',
      task: '1.1',
      criterion: '1',
      evidence_len: 4,
    });
    const gitignorePath = join(tmpDir, '.plan-executor', '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    expect(readFileSync(gitignorePath, 'utf8')).toBe('*\n');
  });

  test('does not overwrite a pre-existing .gitignore', () => {
    const dir = join(tmpDir, '.plan-executor');
    require('fs').mkdirSync(dir, { recursive: true });
    const customContent = '# operator customized\n*.log\n';
    writeFileSync(join(dir, '.gitignore'), customContent, 'utf8');

    appendEvent(tmpDir, {
      type: 'plan.criterion.passed',
      source: 'CheckRunner',
      task: '1.1',
      criterion: '1',
      evidence_len: 4,
    });

    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(customContent);
  });

  test('events.jsonl still written alongside .gitignore', () => {
    appendEvent(tmpDir, {
      type: 'plan.criterion.passed',
      source: 'CheckRunner',
      task: '1.1',
      criterion: '1',
      evidence_len: 4,
    });
    expect(existsSync(join(tmpDir, '.plan-executor', 'events.jsonl'))).toBe(true);
    expect(existsSync(join(tmpDir, '.plan-executor', '.gitignore'))).toBe(true);
  });
});
