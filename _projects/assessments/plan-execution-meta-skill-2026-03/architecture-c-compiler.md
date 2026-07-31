# Architecture C: "The Compiler"

## Plan-to-Script Transpilation with AI Fix Cycles

---

## Core Enforcement Mechanism

The plan is **compiled into a deterministic TypeScript script** before execution begins. Each task becomes a function. Each "Done when" criterion becomes a test assertion. The script runs tasks sequentially, executes verification after each, and **halts on failure**.

The AI is **removed from the execution loop entirely**. It operates at exactly two chokepoints:
1. **Plan creation** — authoring the plan (AI-guided, creative work)
2. **Fix cycles** — when a compiled verification fails, the AI is invoked to fix the specific issue, then the script resumes

**Enforcement property:** Total removal of the unreliable component from the critical path. A TypeScript script cannot rationalize, skip steps, or restructure commands. `process.exit(1)` doesn't negotiate. The AI's attack surface collapses to plan creation (reviewable) and fix cycles (constrained).

**Key insight from Council (Security):** "You removed the adversary from the loop. I can't social-engineer a bash script."

---

## How It Addresses Today's Failures

| Today's Failure | How Architecture C Prevents It |
|---|---|
| Skipped PRD/state tracking | Script manages state automatically. AI never touches state. |
| Didn't verify task criteria | Verification is compiled INTO the script. It runs whether the AI wants it to or not. |
| Bypassed CommitGuard by restructuring commands | No AI in the execution loop = no commands to restructure. Script runs deterministically. |
| Used plan detail as excuse to skip Algorithm | AI doesn't execute the plan. The script does. AI has no opportunity to make this decision. |

---

## Component Map (PAI Extensibility Primitives)

### Skill: `_PLANEXECUTOR`

```
~/.claude/skills/_PLANEXECUTOR/
├── SKILL.md                         # Routing + USE WHEN triggers
├── Workflows/
│   ├── Create.md                    # Author implementation plan
│   ├── Compile.md                   # Transpile plan to executable script
│   ├── Run.md                       # Execute compiled script
│   ├── Fix.md                       # AI fix cycle for failed verifications
│   └── Status.md                    # Query execution state
├── Recipes/
│   ├── README.md                    # Recipe format spec
│   ├── Filesystem.yaml              # Compiled to filesystem check functions
│   ├── Coding.yaml                  # Compiled to test/type/lint check functions
│   └── Deployment.yaml              # Compiled to URL/status check functions
└── Tools/
    ├── PlanParser.ts                # Parse plan → structured JSON
    ├── PlanCompiler.ts              # Structured JSON + recipes → executable .ts script
    ├── CompiledRunner.ts            # Execute the compiled script, manage state, halt on failure
    ├── StateManager.ts              # Execution state (sole writer)
    └── FlightRecorder.ts            # Forensic log
```

### Custom Agents: None for execution

Architecture C deliberately removes agents from the execution path. The AI operates only in Create and Fix workflows.

### Hooks (1)

| Hook | Event | What It Does |
|---|---|---|
| `PlanRecorder.hook.ts` | PostToolUse (all) | Forensic logging during fix cycles |

Minimal hook footprint — the compiled script IS the enforcement. No gate hooks needed because the AI isn't making tool calls during execution.

### CLI Tools (5)

| Tool | Deterministic? | What It Does |
|---|---|---|
| `PlanParser.ts` | Yes | Parse plan markdown → `plan-structure.json` |
| `PlanCompiler.ts` | Yes | Transpile plan-structure.json + recipes → `plan-execution.ts` |
| `CompiledRunner.ts` | Yes | Execute plan-execution.ts, manage state, halt on failure, invoke fix cycle |
| `StateManager.ts` | Yes | Read/write execution state |
| `FlightRecorder.ts` | Yes | Append-only forensic log |

### The Compiled Script (Key Innovation)

PlanCompiler.ts generates a TypeScript file like this:

```typescript
// plan-execution.ts — GENERATED, DO NOT EDIT
import { execSync } from "child_process";
import { StateManager } from "./StateManager";

const state = new StateManager("./execution-state.json");

// ============ TASK 1 ============
async function task1() {
  console.log("TASK 1: Commit all dirty repos before migration");

  // Steps (commands extracted from plan)
  execSync("cd ~/projects/work/website-sor && git add -A && git commit -m 'pre-migration commit'");
  execSync("cd ~/projects/work/brand && git add -A && git commit -m 'pre-migration commit'");
  execSync("cd ~/projects/work/knowledge-work && git add -A && git commit -m 'pre-migration commit'");

  // Verification (criteria compiled to assertions)
  const checks = [
    { id: "T1.1", cmd: "git -C ~/projects/work/website-sor status --porcelain", expected: "" },
    { id: "T1.2", cmd: "git -C ~/projects/work/brand status --porcelain", expected: "" },
    { id: "T1.3", cmd: "git -C ~/projects/work/knowledge-work status --porcelain", expected: "" },
  ];

  for (const check of checks) {
    const actual = execSync(check.cmd, { encoding: "utf-8" }).trim();
    if (actual !== check.expected) {
      state.recordFailure(1, check.id, check.expected, actual);
      return "FAIL"; // Halts — CompiledRunner invokes fix cycle
    }
    state.recordPass(1, check.id, actual);
  }

  state.completeTask(1);
  return "PASS";
}

// ============ TASK 2 ============
async function task2() {
  // ... similar structure
}

// ============ RUNNER ============
const tasks = [task1, task2, /* ... */];
for (const task of tasks) {
  const result = await task();
  if (result === "FAIL") {
    console.log("HALTED — fix cycle required");
    process.exit(1);
  }
}
console.log("ALL TASKS PASSED");
```

**What compiles and what doesn't:**

| Plan element | Compiles to | AI needed? |
|---|---|---|
| `mv ~/projects/a ~/projects/b` | `execSync("mv ~/projects/a ~/projects/b")` | No |
| `grep -rn 'pattern' path/` | Check function with expected "" | No |
| `test -d path` | Check function with expected exit 0 | No |
| "Update README.md path references" | **CANNOT COMPILE** — requires AI judgment | Yes — flagged as AI_REQUIRED step |
| "Create README.md with purpose and contents" | **CANNOT COMPILE** — creative work | Yes — flagged as AI_REQUIRED step |

**AI_REQUIRED steps:** PlanCompiler identifies steps that need AI judgment and generates pause points:

```typescript
async function task3() {
  // Compiled steps
  execSync("mv ~/projects/work/brand ~/projects/sor-co/brand");

  // AI_REQUIRED: "Update README.md path references"
  console.log("AI_REQUIRED: Update README.md path references in ~/projects/sor-co/brand/");
  console.log("Run: bun run CompiledRunner.ts fix --task 3 --step 2");
  process.exit(2); // Exit code 2 = AI fix cycle needed (not failure)

  // Verification runs after AI fix cycle completes and script resumes
}
```

---

## Workflows

### Create Workflow (same as A and B)

Leverages Plan + Architect agents. Plan authoring guide format. PlanParser validates structure.

### Compile Workflow

1. Run `PlanParser.ts` on plan → `plan-structure.json`
2. Run `PlanCompiler.ts`:
   a. For each task, classify each step: COMPILABLE (has an explicit command) or AI_REQUIRED (needs judgment)
   b. For each "Done when" criterion, match to a recipe → generate check function
   c. For unmatchable criteria, flag as MANUAL_REVIEW
   d. Generate `plan-execution.ts`
3. Output compilation report: "N tasks compiled, M steps require AI, K criteria unmappable"
4. Drew reviews the compiled script before execution

### Run Workflow

1. `bun run CompiledRunner.ts --plan plan-execution.ts`
2. Script executes tasks sequentially
3. On PASS: advances to next task
4. On FAIL (exit 1): CompiledRunner displays failure details, invokes Fix workflow
5. On AI_REQUIRED (exit 2): CompiledRunner displays what the AI needs to do, invokes Fix workflow
6. After fix/AI step: CompiledRunner resumes script from the interrupted point

### Fix Workflow (Constrained AI Re-Entry)

1. CompiledRunner provides: which task, which step/criterion, what failed, expected vs. actual
2. AI operates in a CONSTRAINED scope: "Fix TASK N STEP M. The issue is: [details]. Do not modify anything outside this task's scope."
3. AI makes the fix
4. CompiledRunner resumes the compiled script — verification runs automatically
5. If still fails: repeat up to 3 times, then escalate

### Status Workflow

Reads execution-state.json. Shows: tasks compiled/passed/failed/pending, current position, fix cycle count.

---

## State Tracking & Recovery

Same state file format. Additional compilation metadata:

```json
{
  "plan": "plans/root-reorg-plan-2026-03-30.md",
  "plan_checksum": "sha256:abc...",
  "compiled_script": "plan-execution.ts",
  "compilation_timestamp": "2026-03-30T19:30:00Z",
  "ai_required_steps": [3, 5, 9, 17],
  "manual_review_criteria": ["T4.7", "T17.7"],
  "current_task": 3,
  "tasks": { /* same structure as A */ }
}
```

---

## Domain Extensibility

Same recipe system. PlanCompiler uses recipes to generate TypeScript check functions. Adding a new domain = adding a YAML recipe with command templates that compile to `execSync()` calls.

**Compilation quality depends on recipe coverage.** A domain with poor recipe coverage produces a script with many AI_REQUIRED pauses — degrading toward Architecture A's model. A domain with excellent recipe coverage produces a fully autonomous script.

---

## Three-Tier Cost Model

| Tier | When | Cost |
|---|---|---|
| **Compiled execution** | COMPILABLE steps + verification | Zero AI tokens |
| **AI fix cycles** | AI_REQUIRED steps + failure fixes | ~10-30K tokens per intervention |
| **Plan creation** | Authoring the plan | Standard Algorithm session tokens |

Architecture C has the LOWEST execution cost for plans with high compilation coverage (filesystem operations, infrastructure). Cost increases proportionally with AI_REQUIRED steps.

---

## Native Skill/Agent Reuse

| Native Component | How Reused |
|---|---|
| Plan agent | Plan creation |
| Architect agent | Plan creation |
| Engineer agent | Fix cycles for coding tasks |
| skill-creator evals pattern | Compilation report is analogous to evals — "N tasks compilable, M need AI" |
| TDD pattern (Engineer) | The compiled script IS the test suite. Plan criteria ARE the assertions. Fix cycles ARE RED→GREEN. |

---

## Dev-Tools Location

```
~/projects/dev/dev-tools/agentics-dev/skills-dev/plan-executor-dev/
├── src/
│   ├── PlanParser.ts
│   ├── PlanCompiler.ts          # Key new component
│   ├── CompiledRunner.ts        # Key new component
│   ├── StateManager.ts
│   └── FlightRecorder.ts
├── hooks/
│   └── PlanRecorder.hook.ts     # Only hook needed
├── recipes/
├── templates/                   # TypeScript templates for compiled output
│   ├── task-template.ts
│   ├── check-template.ts
│   └── runner-template.ts
├── tests/
├── README.md
└── CLAUDE.md
```

---

## Failure Mode Analysis

| Failure Mode | Severity | Mitigation |
|---|---|---|
| Plan has many AI_REQUIRED steps (low compilation coverage) | HIGH | Compilation report warns upfront. If >50% AI_REQUIRED, recommend Architecture A instead. |
| Compiled script has a bug (bad command generation) | HIGH | Drew reviews compiled script before execution. PlanCompiler generates readable TypeScript with comments. |
| Fix cycle AI escapes constrained scope | MEDIUM | Fix prompt is narrow: specific task, specific criterion, specific failure. But AI still has full tool access during fixes. Optional: PlanGate hook active during fix cycles. |
| Plan changes after compilation | MEDIUM | Plan checksum validated. Recompilation required after plan edits. |
| Recipe doesn't match criterion correctly | MEDIUM | Compilation report flags unmatchable criteria. Human reviews before execution. |
| CompiledRunner crash mid-execution | LOW | State file persists. Resume from last completed task. |

## Bypass Vectors (from Red Team)

| Vector | Difficulty | Mitigation |
|---|---|---|
| AI modifies compiled script before running | BLOCKED | Script checksum validated by CompiledRunner. Also: Drew reviews script. |
| AI fabricates environment during fix cycle | HARD (structural) | Same as A — semantic checks help but can't fully prevent. Fix cycles are time-limited and scope-constrained. |
| AI_REQUIRED steps become loopholes | MEDIUM | AI_REQUIRED steps are identified at compile time. Drew can review and approve each one. They're explicit, not hidden. |
| AI refuses to enter compilation mode | LOW | Compilation is a deterministic CLI command. If AI doesn't run it, human can: `bun run PlanCompiler.ts --plan plan.md` |

---

## Summary

- **Enforcement strength:** HIGHEST for compilable tasks (AI fully removed from loop). MEDIUM for AI_REQUIRED steps (falls back to constrained fix cycles).
- **Development effort:** HIGHEST — PlanCompiler is the most complex component (transpiling markdown criteria to TypeScript). Templates, code generation, edge cases.
- **Maintenance burden:** MEDIUM-HIGH — compiler must be updated when plan format evolves. Recipe-to-code generation must handle new check types.
- **PAI architecture fit:** GOOD — CLI-first (extensibility guide principle), deterministic tools. But the compilation step is novel and has no PAI precedent.
- **Domain extensibility:** HIGH for domains with good recipe coverage. DEGRADES for domains requiring AI judgment (creative writing, design review, etc.).
