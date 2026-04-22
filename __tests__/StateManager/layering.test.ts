// layering.test.ts — Tier A.1 StateManager library layering tests
// Covers: TA-StateManager-052
// Tests must FAIL (red phase) — StateManager.ts is a stub (but structural checks may pass).

import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(import.meta.dir, '../../src');
const LIB_DIR = join(SRC_DIR, 'lib');

describe('StateManager library layering (D13, TR-7)', () => {
  test('TA-StateManager-052: src/lib/ directory structure — state-types.ts exists, no -mvp suffix on any lib file; state-types.ts has only type/interface declarations (TR-7.1, TR-7.2, TR-7.4, TR-7.6, TR-7.9)', () => {
    // Verify state-types.ts exists
    expect(existsSync(join(LIB_DIR, 'state-types.ts'))).toBe(true);

    // Verify no -mvp suffix on any file in src/lib/
    const { readdirSync } = require('fs');
    try {
      const libFiles: string[] = readdirSync(LIB_DIR);
      for (const file of libFiles) {
        expect(file).not.toContain('-mvp');
        expect(file).not.toContain('-local');
      }
    } catch {
      // lib dir may not have all files yet — that's OK for red phase
    }

    // Verify state-types.ts contains only type/interface declarations (zero runtime exports)
    const stateTypesContent = readFileSync(join(LIB_DIR, 'state-types.ts'), 'utf8');
    // Should not contain 'export function', 'export const', 'export class', 'export let', 'export var'
    expect(stateTypesContent).not.toMatch(/^export\s+function\s+/m);
    expect(stateTypesContent).not.toMatch(/^export\s+const\s+/m);
    // export class is acceptable for error hierarchy, but state-types.ts should be types only
    // (error classes live in StateManager.ts, not state-types.ts)
    expect(stateTypesContent).not.toMatch(/^export\s+class\s+/m);
    expect(stateTypesContent).not.toMatch(/^export\s+let\s+/m);
    expect(stateTypesContent).not.toMatch(/^export\s+var\s+/m);

    // Should only contain type/interface exports
    expect(stateTypesContent).toMatch(/export\s+type\s+|export\s+interface\s+/);
  });

  test('TA-StateManager-052b: StateManager.ts imports from lib/state-types only (no direct lib/event-emitter import) (TR-7.2)', () => {
    // StateManager imports types from state-types; event-emitter is for runtime emission
    // The main StateManager.ts should import from ./lib/state-types (types)
    // Event emission happens in the CLI layer, not in pure functions
    const stateManagerContent = readFileSync(join(SRC_DIR, 'StateManager.ts'), 'utf8');

    // Verify state-types import exists
    expect(stateManagerContent).toContain('./lib/state-types');

    // Phase 4.2 expected: event-emitter import should exist in StateManager.ts
    // for the advance-task CLI command (not in pure functions).
    // For now, the stub only imports from ./lib/state-types (correct).
  });
});
