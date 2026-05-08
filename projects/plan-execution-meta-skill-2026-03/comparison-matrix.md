# Architecture Comparison Matrix

## Quick Reference

| Dimension | A: Gate Keeper | B: Conductor | C: Compiler |
|---|---|---|---|
| **Core mechanism** | PreToolUse hooks check state file | Agent orchestration + Inspector verification | Plan compiled to deterministic script |
| **AI in execution loop?** | Yes (constrained by hooks) | Yes (single-task scope, no plan visibility) | No (only in fix cycles) |
| **Enforcement type** | State-based gating at tool boundary | Structural (information asymmetry + authority) | Removal from loop |
| **Verification trigger** | Automatic (PostToolUse hook) | Independent agent (Inspector) | Compiled into script |

## Detailed Comparison

| Dimension | A: Gate Keeper | B: Conductor | C: Compiler |
|---|---|---|---|
| **Enforcement strength (lazy non-compliance)** | HIGH | VERY HIGH | HIGHEST |
| **Enforcement strength (deliberate circumvention)** | MEDIUM | HIGH | HIGH (for compilable tasks) |
| **Development effort** | LOW-MEDIUM | HIGH | HIGHEST |
| **Maintenance burden** | LOW | MEDIUM | MEDIUM-HIGH |
| **PAI architecture fit** | EXCELLENT | GOOD | GOOD |
| **Execution overhead (tokens)** | Lowest (0 extra agents) | Highest (~3 agents/task) | Lowest for compiled, variable for fix cycles |
| **Domain extensibility** | HIGH (recipe YAML) | HIGH (recipe YAML + specialist selection) | HIGH if compilable, DEGRADES if not |
| **Plan creation support** | Same (Plan + Architect agents) | Same | Same |
| **State tracking** | JSON state file (StateManager) | Same + Inspector reports | Same + compilation metadata |
| **Recovery after session break** | Read state file, resume | Read state file, relaunch Conductor | Read state file, resume compiled script |
| **Hook count** | 3 (gate + auto-verify + recorder) | 1-2 (recorder + optional guard) | 1 (recorder only) |
| **Custom agents** | 0 | 2 (Conductor + Inspector) | 0 |
| **CLI tools** | 4 | 5 (same + FlightRecorder) | 5 (+ PlanCompiler, CompiledRunner) |

## Addressing Today's Specific Failures

| Failure | A: Gate Keeper | B: Conductor | C: Compiler |
|---|---|---|---|
| Skipped PRD/state tracking | Hook blocks until state initialized | Conductor manages state automatically | Script manages state automatically |
| Didn't verify criteria | Auto-verify hook triggers on file changes | Inspector agent verifies independently | Verification compiled into script |
| Bypassed CommitGuard | State-based check can't be avoided by restructuring | Structural — executor doesn't control flow | No AI in loop to bypass anything |
| Plan detail used as excuse | Hook doesn't accept excuses | Executor never sees full plan | AI doesn't execute the plan |

## Shared Components (Build Once, Use in Any Architecture)

These components are identical across all three architectures:

| Component | Purpose |
|---|---|
| PlanParser.ts | Parse plan markdown → structured JSON |
| CheckGenerator.ts | Map criteria to recipe checks |
| CheckRunner.ts | Execute checks → verification-results.json |
| StateManager.ts | Read/write execution state |
| FlightRecorder.ts | Forensic logging |
| Recipes/*.yaml | Domain-specific check templates |
| Create workflow | Plan authoring (Plan + Architect agents) |

**Implication:** ~70% of the implementation is shared. The architecture choice primarily affects the orchestration layer and hook configuration, not the core verification engine.

## Decision Framework

**Choose A (Gate Keeper) when:**
- Plans involve mostly AI-judgment tasks (creative writing, design, strategy)
- Speed and low overhead matter
- Team is small (1 person) and maintenance burden must be minimal
- You want the fastest path to "better than nothing"

**Choose B (Conductor) when:**
- Plans involve high-stakes operations where non-compliance is unacceptable
- You want the strongest structural guarantee against AI reasoning its way around enforcement
- You're willing to accept agent spawning overhead
- Plans have clear task boundaries (each task is independently delegatable)

**Choose C (Compiler) when:**
- Plans are highly automatable (filesystem, infrastructure, deployment)
- Reproducibility matters (run the same plan on a different machine)
- You want the strongest guarantee for the compilable portion
- You accept that AI-required steps will fall back to constrained fix cycles

**Hybrid approach:**
Build the shared components first. Then implement Architecture A (lowest effort). If A proves insufficient, upgrade the orchestration layer to B or C — the shared components don't change.

## Recommended Build Order (If Incremental)

```
Phase 1: Shared foundation (any architecture)
├── PlanParser.ts
├── CheckGenerator.ts
├── CheckRunner.ts
├── StateManager.ts
├── Recipes/ (Filesystem.yaml first)
└── verification-results.json format

Phase 2: Architecture A (lowest effort, immediate value)
├── PlanGate.hook.ts
├── PlanAutoVerify.hook.ts
├── PlanRecorder.hook.ts
└── Execute workflow

Phase 3: Upgrade path (if A insufficient)
├── Option B: Add PlanConductor + PlanInspector agents
└── Option C: Add PlanCompiler + CompiledRunner
```

## Sources

| Insight | Source |
|---|---|
| State-based enforcement > action-based | First Principles analysis (this session) |
| 12 bypass vectors categorized | Red Team analysis (this session) |
| Assembly Line automatic verification | Be Creative cross-domain analysis (this session) |
| Inspector Agent with HMAC signing | Be Creative nuclear two-person integrity pattern |
| Black Box forensic logging | Be Creative aviation flight recorder pattern |
| Information asymmetry enforcement | Council debate — Architect (Serena) |
| "Can't social-engineer a bash script" | Council debate — Security (Rook) |
| Hook enforcement proven by CI/CD | Council debate — Researcher (Ava) |
| Smallest surface area wins | Council debate — Engineer (Marcus) |
| Hybrid: B structure + C determinism | Council synthesis — Architect (Serena) |
| Plan authoring guide as input contract | PAI/USER/PLANAUTHORINGGUIDE.md |
| UIReviewer YAML story → PASS/FAIL pattern | PAI native agent analysis |
| skill-creator eval/benchmark pattern | PAI native skill analysis |
| CLI-first architecture | PAI/EXTENSIBILITY-GUIDE.md |
