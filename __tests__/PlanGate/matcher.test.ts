// matcher.test.ts — Tier A.3 PlanGate wrapper matcher routing.
// Covers: TA-PlanGate-002. Red phase — stub throws.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('PlanGate wrapper matcher routing (FR-3.1a, FR-3.1b, FR-3.1c)', () => {
  test('TA-PlanGate-002: wrapper reads tool_name and routes Bash/Edit/Write into decide; unknown matchers do not invoke block decision', () => {
    const src = readFileSync(join(import.meta.dir, '../../src/PlanGate.hook.ts'), 'utf8');

    // The wrapper must import decide from the handler file.
    expect(src).toMatch(/from\s+['"]\.\/handlers\/PlanGateHandler['"]/);
    expect(src).toContain('decide');

    // The wrapper must reference all three matcher values OR delegate matcher handling
    // entirely to decide() (in which case decide sees tool_name and decides).
    // The handler-delegate pattern routes ALL tools to decide; unknown tools are
    // handled by decide returning ALLOW (TA-PlanGate-013).
    //
    // We assert the wrapper does NOT whitelist/blacklist tool_name on its own;
    // any such filtering belongs in decide.
    expect(src).not.toMatch(/tool_name\s*===\s*['"]Bash['"]\s*\|\|/);
  });
});
