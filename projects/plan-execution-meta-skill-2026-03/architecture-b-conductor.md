# Architecture B: "The Conductor"

## Agent-Orchestrated Execution with Inspector Verification

---

## Core Enforcement Mechanism

A custom **PlanConductor agent** orchestrates execution. Instead of the primary agent executing the plan directly (and being trusted to verify), the Conductor:

1. Reads the plan and parses it into tasks
2. Dispatches ONE task at a time to a specialist agent (Engineer, Architect, or general-purpose)
3. After each task returns, spawns a READ-ONLY **PlanInspector agent** to independently verify the task's criteria
4. Only advances to the next task when the Inspector's verification passes
5. The executing agent never sees the full plan — only their single task

**Enforcement property:** Information asymmetry + structural authority. The executing agent cannot skip tasks because it doesn't know what comes next. The Inspector cannot be influenced by the executor because it's a separate agent with read-only access. The Conductor controls the flow — it's the only entity that sees the full plan.

**Key insight from Council (Architect):** Verification steps are COMPILED (deterministic CLI tools), not prompted. The Inspector runs CheckRunner.ts — it doesn't judge whether criteria pass, it reads JSON output.

---

## How It Addresses Today's Failures

| Today's Failure | How Architecture B Prevents It |
|---|---|
| Skipped PRD/state tracking | Conductor manages state automatically. Executing agent doesn't interact with state. |
| Didn't verify task criteria | Inspector agent runs verification independently after every task. Not optional — structural. |
| Bypassed CommitGuard by restructuring commands | Executing agent works within a single task scope. Hook bypass doesn't matter because the Conductor gates advancement on Inspector results, not on hooks. |
| Used plan detail as excuse to skip Algorithm | Executing agent never sees the full plan. Can't reason about whether tracking is "needed." |

---

## Component Map (PAI Extensibility Primitives)

### Skill: `_PLANEXECUTOR`

```
~/.claude/skills/_PLANEXECUTOR/
├── SKILL.md                         # Routing + USE WHEN triggers
├── Workflows/
│   ├── Create.md                    # Author implementation plan
│   ├── Execute.md                   # Launch Conductor orchestration
│   ├── Status.md                    # Query current execution state
│   └── Resume.md                    # Resume from last verified checkpoint
├── Recipes/
│   ├── README.md                    # Recipe format spec
│   ├── Filesystem.yaml              # Directory, file, git checks
│   ├── Coding.yaml                  # Test, type, lint checks
│   └── Deployment.yaml              # URL, status, content checks
└── Tools/
    ├── PlanParser.ts                # Parse plan → structured JSON
    ├── CheckGenerator.ts            # Criteria + recipes → checks
    ├── CheckRunner.ts               # Execute checks → results JSON
    ├── StateManager.ts              # Execution state (sole writer)
    └── FlightRecorder.ts            # Forensic log
```

### Custom Agents (2)

**PlanConductor** (`~/.claude/custom-agents/PlanConductor.md`)
- Orchestrator identity with strict operational rules
- Reads full plan, dispatches tasks one at a time
- Runs Inspector after each task
- Manages state via StateManager
- Never executes plan tasks itself — only orchestrates

**PlanInspector** (`~/.claude/custom-agents/PlanInspector.md`)
- Read-only verification agent
- Spawned after each task completes
- Runs CheckRunner.ts, reads results
- Produces structured verification report
- Cannot modify files — read + Bash (verification commands) only
- Optional: HMAC-signed reports using a secret from op-env (prevents executor from fabricating reports)

### Hooks (1-2)

| Hook | Event | What It Does |
|---|---|---|
| `PlanRecorder.hook.ts` | PostToolUse (all) | Forensic logging — append-only action log |
| `PlanGuard.hook.ts` (optional) | PreToolUse | Lightweight guard: blocks if no active plan execution session. Defense-in-depth alongside Conductor control. |

Architecture B relies primarily on structural enforcement (Conductor controls flow), not hook enforcement. Hooks are supplementary.

### CLI Tools (5 — same as Architecture A)

Same tools, same interfaces. The difference is WHO invokes them:

| Tool | Invoked By | In Architecture A |
|---|---|---|
| PlanParser.ts | Conductor (at plan start) | Execute workflow |
| CheckGenerator.ts | Conductor (per task) | Execute workflow |
| CheckRunner.ts | Inspector (after each task) | PlanAutoVerify hook |
| StateManager.ts | Conductor + Inspector | CheckRunner + hooks |
| FlightRecorder.ts | PlanRecorder hook | Same |

---

## Workflows

### Create Workflow (same as Architecture A)

Leverages Plan agent + Architect agent. Plan authoring guide format. PlanParser validates structure.

### Execute Workflow

1. Run `PlanParser.ts` → `plan-structure.json`
2. Run `StateManager.ts init` → `execution-state.json`
3. Load PlanConductor agent (`ComposeAgent.ts --load PlanConductor`)
4. Conductor reads plan-structure.json
5. **For each task:**
   a. Conductor extracts task N's objective, steps, criteria, constraints
   b. Conductor selects specialist: Engineer for code tasks, Architect for design tasks, general-purpose for filesystem tasks
   c. Conductor spawns specialist with ONLY task N's content (not the full plan):
      ```
      Task(subagent_type="Engineer", prompt="TASK: [objective]\nSTEPS: [steps]\nDONE WHEN: [criteria]\nDO NOT: [constraints]")
      ```
   d. Specialist executes task, returns completion message
   e. Conductor spawns Inspector:
      ```
      Task(subagent_type="general-purpose", prompt=[PlanInspector identity] + "Verify TASK N using CheckRunner.ts. Report PASS/FAIL per criterion.")
      ```
   f. Inspector runs CheckRunner.ts, returns verification report
   g. If ALL PASS: Conductor advances (StateManager updates state)
   h. If ANY FAIL: Conductor enters fix cycle (see below)
6. At checkpoints: Conductor runs cumulative verification

### Fix Cycle (When Inspector Reports Failure)

1. Conductor receives Inspector's failure report: "TASK N CRITERION M: expected X, actual Y"
2. Conductor spawns the SAME specialist again with the failure details:
   ```
   Task(subagent_type="Engineer", prompt="TASK N FAILED VERIFICATION.\nFailed criterion: [details]\nFix the specific issue. Do not modify anything else.")
   ```
3. Specialist fixes, returns
4. Conductor re-spawns Inspector for re-verification
5. If passes: advance. If fails again: repeat up to 3 times
6. After 3 failures: Conductor escalates to Drew via the main agent (AskUserQuestion)

### Resume Workflow (After Session Break)

1. Read `execution-state.json`
2. Validate plan checksum
3. Identify last verified task
4. Re-launch Conductor from that point

---

## State Tracking & Recovery

Same state file format as Architecture A. Conductor is the orchestration layer that reads/writes state via StateManager.

Additional state for Conductor:
```json
{
  "conductor_session": "2026-03-30T19:30:00Z",
  "specialist_used": { "1": "general-purpose", "2": "Engineer", "3": "Architect" },
  "inspector_reports": {
    "1": { "result": "PASS", "report_hash": "sha256:..." },
    "2": { "result": "PASS", "report_hash": "sha256:..." }
  }
}
```

---

## Domain Extensibility

Same as Architecture A — recipe YAML files, auto-discovered by CheckGenerator. The Conductor also selects specialists based on task domain:

| Domain keyword in task | Specialist agent |
|---|---|
| `git`, `mv`, `directory`, `path` | general-purpose |
| `code`, `function`, `test`, `API` | Engineer |
| `architecture`, `design`, `spec` | Architect |
| `deploy`, `pipeline`, `infrastructure` | Engineer with deployment context |

---

## Three-Tier Cost Model

| Tier | When | Cost |
|---|---|---|
| **Direct CLI** | PlanParser, CheckRunner, StateManager | Zero AI tokens |
| **Inspector agent** | Verification after each task | ~5-10K tokens per task (read-only, focused) |
| **Specialist agent** | Task execution | ~20-50K tokens per task (full execution) |
| **Conductor agent** | Orchestration overhead | ~5K tokens per task (dispatch + state management) |

Architecture B has HIGHER overhead than A — every task involves Conductor + Specialist + Inspector (3 agent invocations per task vs. 0 in A). For a 17-task plan: ~50 agent invocations.

---

## Native Skill/Agent Reuse

| Native Component | How Reused |
|---|---|
| Engineer agent | Specialist for coding tasks |
| Architect agent | Specialist for design tasks, plan creation |
| Plan agent | Plan creation workflow |
| UIReviewer pattern | Inspector follows same YAML-story → PASS/FAIL pattern |
| QATester Gate 4 pattern | Inspector is the "gate" between tasks |
| Delegation skill patterns | Conductor uses lightweight vs. full delegation model |
| ComposeAgent | Loads PlanConductor and PlanInspector identities |

---

## Dev-Tools Location

```
~/projects/dev/dev-tools/agentics-dev/skills-dev/plan-executor-dev/
├── src/                          # CLI tools (same as Architecture A)
├── hooks/                        # Lighter hook set (recorder only, optional guard)
├── agents/                       # Custom agent definitions
│   ├── PlanConductor.md
│   └── PlanInspector.md
├── recipes/
├── tests/
├── README.md
└── CLAUDE.md
```

---

## Failure Mode Analysis

| Failure Mode | Severity | Mitigation |
|---|---|---|
| Conductor agent itself is non-compliant | CRITICAL | Conductor's prompt is minimal and operational (not creative). Task: "read task N, spawn specialist, spawn inspector, check results, advance or fail." Minimal decision surface. |
| Specialist escapes single-task scope | HIGH | Specialist receives ONLY task content, no plan context. Cannot reason about sequence. |
| Inspector fabricates PASS without running checks | HIGH | Inspector runs CheckRunner.ts (deterministic). Its report can be HMAC-signed with op-env secret. Conductor validates signature. |
| Prompt injection: specialist output influences Conductor | MEDIUM | Conductor reads Inspector results (structured JSON), not specialist prose. Specialist output is not passed to Conductor's decision logic. |
| Agent spawning overhead makes execution slow | MEDIUM | Specialist agents can use `model: "haiku"` for simple tasks. Inspector always uses haiku (read-only verification). |
| Context loss between Conductor and specialist | LOW | Task content is self-contained per plan authoring guide format. No context dependency on prior tasks (Precondition field handles this). |

## Bypass Vectors (from Red Team)

| Vector | Difficulty | Mitigation |
|---|---|---|
| Specialist modifies state file directly | BLOCKED | Specialist doesn't know state file location (not in its prompt). If attempted via Bash, PlanGuard hook blocks. |
| Conductor skips Inspector step | HARD | Conductor's operational prompt is deterministic: "After specialist returns, spawn Inspector." Minimal decision surface. But this IS the structural weakness — Conductor is still an AI. |
| Inspector passes without running checks | BLOCKED | Inspector must produce CheckRunner output (verification-results.json). Conductor validates the file exists and was recently modified. HMAC signing prevents fabrication. |
| Specialist asks user to run commands | MEDIUM | Same as Architecture A — state file doesn't update without CheckRunner. |

---

## Summary

- **Enforcement strength:** VERY HIGH — structural isolation (information asymmetry) + independent verification (Inspector). Hardest to bypass through AI reasoning alone.
- **Development effort:** HIGH — two custom agents + orchestration workflow + all CLI tools
- **Maintenance burden:** MEDIUM — agent prompts need updating when plan format evolves, agent spawning adds debugging complexity
- **PAI architecture fit:** GOOD — uses custom agents, ComposeAgent, delegation patterns, CLI tools. More complex than A but within PAI patterns.
- **Domain extensibility:** HIGH — same recipe system as A, plus specialist agent selection by domain
