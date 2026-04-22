// subprocess-free.test.ts — Tier A.2 CheckRunner ↔ StateManager module-level integration.
// Covers: TA-CheckRunner-031. Red phase — source passes structural checks, logic stubs throw.

import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('CheckRunner subprocess-free integration (FR-2.28, TR-7.7)', () => {
  test('TA-CheckRunner-031: CheckRunner imports StateManager as a module, not subprocess; imports event-emitter', () => {
    const src = readFileSync(join(import.meta.dir, '../../src/CheckRunner.ts'), 'utf8');

    // Module-level imports from StateManager.
    expect(src).toMatch(/from\s+['"]\.\/StateManager['"]/);
    expect(src).toContain('readState');
    expect(src).toContain('updateCriterion');
    expect(src).toContain('advanceTask');
    expect(src).toContain('writeState');

    // Event emitter import from project-local lib.
    expect(src).toMatch(/from\s+['"]\.\/lib\/event-emitter['"]/);
    expect(src).toContain('appendEvent');

    // No evidence of spawning StateManager as a subprocess.
    expect(src).not.toMatch(/spawn(?:Sync)?\(\s*['"]bun['"][^)]*StateManager/);
    expect(src).not.toMatch(/spawn(?:Sync)?\(\s*['"]node['"][^)]*StateManager/);
    expect(src).not.toMatch(/StateManager\.ts['"]\s*,\s*\[/);
  });
});
