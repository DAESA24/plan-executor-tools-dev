// CheckRunner test aggregator — imports all nested test files.
// Run: bun test __tests__/CheckRunner.test.ts

import './CheckRunner/target-resolution.test';
import './CheckRunner/automated.test';
import './CheckRunner/stdout-classification.test';
import './CheckRunner/evidence.test';
import './CheckRunner/manual-stdin.test';
import './CheckRunner/manual-askuser.test';
import './CheckRunner/dry-run.test';
import './CheckRunner/control-flow.test';
import './CheckRunner/json-output.test';
import './CheckRunner/subprocess-free.test';
