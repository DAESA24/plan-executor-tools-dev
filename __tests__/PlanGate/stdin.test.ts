// stdin.test.ts — Tier A.3 PlanGate wrapper stdin parsing.
// Covers: TA-PlanGate-003. Red phase — wrapper stub throws.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('PlanGate wrapper stdin parsing (FR-3.2, TR-6.1, TR-6.2, TR-6.7)', () => {
  test('TA-PlanGate-003: wrapper imports readHookInput from hook-io (PAI lib path) with shipped 500ms timeout', () => {
    const src = readFileSync(join(import.meta.dir, '../../src/PlanGate.hook.ts'), 'utf8');

    // Imports readHookInput from hook-io. In dev we use a local shim at ./lib/hook-io;
    // at deploy time the bundler points at ~/.claude/hooks/lib/hook-io. Both forms must
    // resolve to a readHookInput symbol. AST-style check: the import specifier contains
    // `hook-io` and the imported binding name is exactly `readHookInput`.
    expect(src).toMatch(/import\s*\{\s*readHookInput[^}]*\}\s*from\s*['"][^'"]*hook-io['"]/);

    // The wrapper must NOT extend the 500ms timeout — no setTimeout/AbortController wrap.
    expect(src).not.toMatch(/new\s+AbortController/);
    // A bare setTimeout for non-timeout purposes is fine; specifically disallow a wrap
    // that passes a timeout > 500 to readHookInput.
    expect(src).not.toMatch(/readHookInput\s*\(\s*[0-9]{4,}/);
  });
});
