// stdout-classification.test.ts — Tier A.2 CheckRunner PASS/FAIL classifier.
// Covers: TA-CheckRunner-006, 007. Red phase — stub throws.

import { describe, test, expect } from 'bun:test';

import { classifyAutomatedResult } from '../../src/CheckRunner';

describe('CheckRunner stdout classification', () => {
  test('TA-CheckRunner-006: PASS requires last non-empty stdout line = "PASS" AND exit code 0 (FR-2.7a, FR-2.7b, FR-2.7c, TR-10.2a)', () => {
    // "hello\nPASS" + exit 0 → PASS.
    const a = classifyAutomatedResult({ stdout: 'hello\nPASS', stderr: '', exitCode: 0, timedOut: false });
    expect(a.status).toBe('PASS');

    // "PASS" + exit 1 → NOT PASS (exit code breaks the conjunction).
    const b = classifyAutomatedResult({ stdout: 'PASS', stderr: '', exitCode: 1, timedOut: false });
    expect(b.status).toBe('FAIL');

    // "hello" + exit 0 (no PASS marker) → NOT PASS.
    const c = classifyAutomatedResult({ stdout: 'hello', stderr: '', exitCode: 0, timedOut: false });
    expect(c.status).toBe('FAIL');
  });

  test('TA-CheckRunner-007: FAIL when last non-empty stdout line is "FAIL" OR exit non-zero (FR-2.8a, FR-2.8b, FR-2.8c, TR-10.2a)', () => {
    // "FAIL" + exit 0 → FAIL (stdout marker alone is sufficient).
    const a = classifyAutomatedResult({ stdout: 'FAIL', stderr: '', exitCode: 0, timedOut: false });
    expect(a.status).toBe('FAIL');

    // "hello" + exit 7 → FAIL (non-zero exit alone is sufficient).
    const b = classifyAutomatedResult({ stdout: 'hello', stderr: '', exitCode: 7, timedOut: false });
    expect(b.status).toBe('FAIL');

    // "something\nFAIL" + exit 0 → FAIL (last non-empty line is FAIL).
    const c = classifyAutomatedResult({ stdout: 'something\nFAIL', stderr: '', exitCode: 0, timedOut: false });
    expect(c.status).toBe('FAIL');
  });
});
