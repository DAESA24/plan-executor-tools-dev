// PlanGate test aggregator — imports all nested test files.
// Run: bun test __tests__/PlanGate.test.ts

// Wrapper-level tests:
import './PlanGate/matcher.test';
import './PlanGate/stdin.test';

// Handler-level tests:
import './PlanGateHandler/decision-table.test';
import './PlanGateHandler/pointer.test';
import './PlanGateHandler/envelope.test';
import './PlanGateHandler/checksum.test';
import './PlanGateHandler/purity.test';
import './PlanGateHandler/edge-cases.test';
import './PlanGateHandler/exit-code.test';
import './PlanGateHandler/events.test';
import './PlanGateHandler/tokenisation.test';
