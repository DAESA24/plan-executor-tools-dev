// exit-code.test.ts — Tier A.3 PlanGate wrapper exit code.
// Covers: TA-PlanGate-015. Red phase — wrapper stub throws.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('PlanGate wrapper exit code (FR-3.21)', () => {
  test('TA-PlanGate-015: wrapper exits 0 on every ALLOW and every BLOCK — no process.exit(non-zero) on the decision path', () => {
    const wrapperSrc = readFileSync(
      join(import.meta.dir, '../../src/PlanGate.hook.ts'),
      'utf8'
    );

    // Any process.exit call must have argument 0 (or no argument — defaults to 0).
    // Extract all process.exit(<arg>) calls and ensure none is non-zero.
    const exitCalls = [...wrapperSrc.matchAll(/process\.exit\s*\(\s*([^)]*)\)/g)];
    for (const match of exitCalls) {
      const arg = match[1].trim();
      // Acceptable: empty, literal 0, variable known to be 0. Reject literal non-zero.
      expect(arg === '' || arg === '0' || /^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)).toBe(true);
      expect(arg).not.toMatch(/^[1-9]/);
    }

    // Also reject exit-2 via stderr-only blocking pattern (explicitly discouraged per
    // design.md §7.5). The wrapper must use the JSON permissionDecision envelope instead.
    expect(wrapperSrc).not.toMatch(/process\.exit\s*\(\s*2\s*\)/);
  });
});
