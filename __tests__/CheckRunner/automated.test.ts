// automated.test.ts — Tier A.2 CheckRunner automated-criterion flow.
// Covers: TA-CheckRunner-004, 005, 008. Red phase — stub throws.

import { describe, test, expect, afterEach } from 'bun:test';

import {
  runShellCommand,
  getDefaultTimeoutMs,
  DEFAULT_TIMEOUT_MS,
  TIMEOUT_ENV_VAR,
  type ExecResult,
} from '../../src/CheckRunner';

describe('CheckRunner automated flow', () => {
  const origTimeout = process.env[TIMEOUT_ENV_VAR];
  afterEach(() => {
    if (origTimeout === undefined) delete process.env[TIMEOUT_ENV_VAR];
    else process.env[TIMEOUT_ENV_VAR] = origTimeout;
  });

  test('TA-CheckRunner-004: automated command executed via bash -c (FR-2.4)', () => {
    // "echo $0" under bash prints "bash" — proves the shell is bash -c.
    const result: ExecResult = runShellCommand('echo $0', { timeoutMs: 5000 });
    expect(result.stdout.trim()).toBe('bash');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  test('TA-CheckRunner-005: default timeout is 30000ms; CHECKRUNNER_TIMEOUT_MS overrides (FR-2.5a, FR-2.5b, FR-2.6)', () => {
    delete process.env[TIMEOUT_ENV_VAR];
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(getDefaultTimeoutMs()).toBe(30_000);

    process.env[TIMEOUT_ENV_VAR] = '5000';
    expect(getDefaultTimeoutMs()).toBe(5000);
  });

  test('TA-CheckRunner-008: timeout kills command and returns timedOut=true with evidence "TIMEOUT after Nms" shape (FR-2.9, TR-10.2a)', () => {
    const result = runShellCommand('sleep 5', { timeoutMs: 200 });
    expect(result.timedOut).toBe(true);
    // Exit code should be non-zero (killed), but the key contract is timedOut=true.
    // When classified, evidence will be formatted "TIMEOUT after 200ms" — classifier owns the string.
  });
});
