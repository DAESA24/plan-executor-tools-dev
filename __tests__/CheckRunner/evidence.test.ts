// evidence.test.ts — Tier A.2 CheckRunner evidence formatting.
// Covers: TA-CheckRunner-009, 010. Red phase — stub throws.

import { describe, test, expect } from 'bun:test';

import { classifyAutomatedResult } from '../../src/CheckRunner';

describe('CheckRunner evidence formatting', () => {
  test('TA-CheckRunner-009: PASS evidence = trimmed stdout; inner newlines preserved (FR-2.10, TR-10.2b)', () => {
    const r = classifyAutomatedResult({
      stdout: '  line1\nline2\nPASS  \n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    });
    expect(r.status).toBe('PASS');
    // Leading/trailing whitespace trimmed; inner newlines preserved.
    expect(r.evidence).toBe('line1\nline2\nPASS');
  });

  test('TA-CheckRunner-010: FAIL evidence = "exit_code=N\\nstdout=...\\nstderr=..." (FR-2.11a, FR-2.11b, FR-2.11c, TR-10.2b)', () => {
    const r = classifyAutomatedResult({
      stdout: 'hello',
      stderr: 'oops',
      exitCode: 7,
      timedOut: false,
    });
    expect(r.status).toBe('FAIL');
    expect(r.evidence).toBe('exit_code=7\nstdout=hello\nstderr=oops');
  });
});
