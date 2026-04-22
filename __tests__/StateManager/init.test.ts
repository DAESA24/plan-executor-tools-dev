// init.test.ts — Tier A.1 StateManager init tests (RED phase).
// Tests assert real Phase 4.2 behavior and MUST fail against the current stub.

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, copyFileSync, existsSync, readFileSync, statSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { initState, ChecksumError } from '../../src/StateManager';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');
const makeTempDir = (): string => mkdtempSync(join(tmpdir(), 'sm-init-'));
const copyFixture = (name: string, destDir: string): string => {
  const dest = join(destDir, 'validation.json');
  copyFileSync(join(FIXTURES_DIR, name), dest);
  return dest;
};

describe('StateManager init', () => {
  let tmpDir: string;
  let fakeHome: string;
  let origHome: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    fakeHome = makeTempDir();
    origHome = process.env.HOME ?? '';
    process.env.HOME = fakeHome;
  });
  afterEach(() => {
    process.env.HOME = origHome;
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test('TA-StateManager-001: init computes plan_checksum, stamps initialized UTC ISO-8601, writes atomically (FR-1.1a, FR-1.1b, FR-1.1c, FR-1.28c)', () => {
    const path = copyFixture('canonical-2x2x2.json', tmpDir);
    const result = initState(path);
    expect(result.plan_checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.initialized).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
    expect(existsSync(path + '.tmp')).toBe(false);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.plan_checksum).toBe(result.plan_checksum);
    expect(written.initialized).toBe(result.initialized);
  });

  test('TA-StateManager-002: init idempotent on matching plan_checksum — no write, no events (FR-1.2a, FR-1.2b, FR-1.32)', () => {
    const path = copyFixture('canonical-2x2x2.json', tmpDir);
    initState(path);
    const mtimeBefore = statSync(path).mtimeMs;
    initState(path);
    const mtimeAfter = statSync(path).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  test('TA-StateManager-003: init throws ChecksumError E_CHECKSUM_DRIFT when structure changed since first init (FR-1.3a, FR-1.3b)', () => {
    const path = copyFixture('canonical-2x2x2-drifted.json', tmpDir);
    let caught: unknown = null;
    try { initState(path); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ChecksumError);
    expect((caught as ChecksumError).code).toBe('E_CHECKSUM_DRIFT');
    expect((caught as ChecksumError).message).toContain('sha256:');
  });
});
