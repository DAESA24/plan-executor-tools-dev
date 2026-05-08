# Architecture A: "The Gate Keeper"

## Hook-Enforced Sequential Execution with Automatic Verification

---

## Note — 2026-04-21: Plan Executor Tools subset separates authoring from execution

During planning of the Presentations-skill build (a larger, more deterministic-requirements-heavy project than the impeccable-design-skill prototype), an architectural insight emerged: **plan authoring and plan execution are separable concerns.** Architecture A as specified below bundles both into a single `_PLANEXECUTOR` skill (Workflows/Create.md authors plans, Workflows/Execute.md runs them). But the failure mode we're trying to prevent is specifically about *execution discipline*, not authoring — AI skipping markdown checkbox verifications under context load, claiming PASS without running checks, etc.

A subset of Architecture A — **Plan Executor Tools** — can ship much sooner by implementing only the enforcement kernel:
- **`PlanGate.hook.ts`** (PreToolUse blocker — read-gate)
- **`StateManager.ts`** (sole state-file writer — write-guard)
- **`CheckRunner.ts`** (deterministic check execution)

…while deferring PlanParser, CheckGenerator, Recipes, PlanAutoVerify, PlanRecorder, and the authoring workflows. Plans are authored by hand for now (as the impeccable-design-skill precedent proved viable). Plan Executor Tools are being built at `~/projects/dev/dev-tools/agentics-dev/tools-dev/plan-executor-tools-dev/`. Per PAI/TOOLS.md convention (CLI-First architecture, no skill wrapper for pure utility CLIs), the tools deploy to `~/.claude/PAI/Tools/StateManager.ts` and `~/.claude/PAI/Tools/CheckRunner.ts`, the hook to `~/.claude/hooks/PlanGate.hook.ts`, with documentation appended to `~/.claude/PAI/TOOLS.md`.

**Net effect:** Plan Executor Tools prove the enforcement-kernel portion of Architecture A on a live project (Presentations-skill build), generate real-world design data, and leave the convenience layer (authoring, recipes) for a later iteration that may land in a separate `_PLANEXECUTOR` skill (at `~/.claude/skills/_PLANEXECUTOR/`) which would then CONSUME these tools rather than contain them.

Additional requirements that emerged during planning:
- **Subagent coverage.** Hooks registered in settings.json apply session-wide (main agent + all subagents). Subagents spawned via the Task tool must be BRIEFED on the plan-execution system — current task ID, validation criteria, CheckRunner invocation protocol — so they work WITH the hook rather than hitting blocks cold. Every delegation spec in an implementation plan must include this briefing.
- **CheckRunner allow-list.** PlanGate must permit CheckRunner invocations even when current task is PENDING — otherwise the system deadlocks (can't run the check that would make the task PASS because the task isn't PASS). StateManager → state-file writes are the sole legitimate path.
- **Scope boundary.** Plan Executor Tools gate DEVELOPMENT SESSIONS under an active plan. They do NOT gate execution of finished skills (e.g., invoking the Presentations skill for its normal deck-rendering operation is not plan-execution; those tool calls pass freely). This matters especially for Tier C evals — eval subagents invoke the skill under test, and those invocations cannot be gated without breaking the evals.
- **Per-task tool allow-lists.** Implementation plans should explicitly declare which tools each task (and each delegated subagent) is permitted to use. PlanGate can extend its enforcement beyond "is task PASS" to "is this tool allowed for the current task." Reduces blast radius; makes delegation specs easier to review.
- **Bootstrap chicken-and-egg.** Plan Executor Tools cannot gate their own construction. The session that builds them runs under manual discipline for both main agent and subagents. Once built and registered, subsequent sessions have hook enforcement live.

**Naming note:** This project was originally called "Plan Executor MVP" and scaffolded at `skills-dev/plan-executor-mvp-skill-dev/`. Renamed and relocated 2026-04-21 to reflect (a) CLI-First architecture (these are tools, not a skill), and (b) the fact that the validation.json enforcement pattern was already validated by the impeccable-design-skill project — so "MVP" framing undersold what's being built. The tools are the production implementation of a twice-validated pattern.

The full Architecture A spec below remains the target end-state; Plan Executor Tools are the phase-one subset.

---

## Core Enforcement Mechanism

A **PreToolUse hook** fires on every Write, Edit, and Bash call. It reads a JSON state file to check whether the current task's verification has passed. If not, the hook **blocks the action** and returns a structured error telling the AI to run the verification tool first.

The state file is written **ONLY** by a deterministic CLI tool (StateManager). The AI cannot write to it — the hook also guards the state file path.

**Enforcement property:** State-based, not action-based. The state file either shows PASS for the current task or it doesn't. The AI cannot restructure its actions to avoid this check — unlike CommitGuard (which checks actions at commit time), this checks persistent state on every tool call.

---

## How It Addresses Today's Failures

| Today's Failure | How Architecture A Prevents It |
|---|---|
| Skipped PRD/state tracking | StateManager initializes state file at plan start. PlanGate hook blocks all Write/Edit/Bash until state file exists. |
| Didn't verify task criteria | PlanAutoVerify hook auto-triggers verification on file changes. AI doesn't need to remember to verify — system does it. |
| Bypassed CommitGuard by restructuring commands | PlanGate checks STATE (does state file show PASS?), not ACTIONS. No restructuring avoids a state check. |
| Used plan detail as excuse to skip Algorithm | The hook doesn't care about excuses. It reads a JSON file. PASS or blocked. |

---

## Component Map (PAI Extensibility Primitives)

### Skill: `_PLANEXECUTOR`

```
~/.claude/skills/_PLANEXECUTOR/
├── SKILL.md                         # Routing + USE WHEN triggers
├── Workflows/
│   ├── Create.md                    # Author implementation plan (leverages Plan/Architect agents)
│   ├── Execute.md                   # Initialize state, begin execution
│   ├── Fix.md                       # Fix cycle when verification fails
│   └── Status.md                    # Show current plan execution state
├── Recipes/
│   ├── README.md                    # Recipe format specification
│   ├── Filesystem.yaml              # check_dir_exists, check_file_exists, check_git_remote, check_no_stale_refs
│   ├── Coding.yaml                  # check_tests_pass, check_types, check_lint, check_function_exists
│   └── Deployment.yaml              # check_url_responds, check_status_code, check_content_matches
└── Tools/
    ├── PlanParser.ts                # Parse plan markdown → structured JSON (tasks, criteria, dependencies)
    ├── CheckGenerator.ts            # Map criteria to recipe checks → executable verification script
    ├── CheckRunner.ts               # Execute checks → verification-results.json
    └── StateManager.ts              # Read/write state file (SOLE writer). Atomic writes. Checksummed.
```

### Hooks (3)

| Hook | Event | Matcher | What It Does |
|---|---|---|---|
| `PlanGate.hook.ts` | PreToolUse | Write, Edit, Bash | Reads state file. Blocks if current task not verified. Guards state file path from AI writes. |
| `PlanAutoVerify.hook.ts` | PostToolUse | Write, Edit, Bash | Detects file changes relevant to current task criteria. Auto-triggers CheckRunner. Writes results via StateManager. |
| `PlanRecorder.hook.ts` | PostToolUse | (all tools) | Appends to append-only forensic log. Structured JSON: timestamp, tool, args, result. |

### CLI Tools (4)

| Tool | Deterministic? | Who Invokes | Output |
|---|---|---|---|
| `PlanParser.ts` | Yes | Execute workflow (once at plan start) | `plan-structure.json` — tasks, criteria, dependencies |
| `CheckGenerator.ts` | Yes | Execute workflow (once per task) | `task-N-checks.sh` — executable verification script |
| `CheckRunner.ts` | Yes | PlanAutoVerify hook (automatic) or AI (manual) | `verification-results.json` |
| `StateManager.ts` | Yes | CheckRunner (after checks), hooks (for reads) | `execution-state.json` — current task, pass/fail per criterion |

### Recipes (Domain-Specific Verification Templates)

```yaml
# Filesystem.yaml
checks:
  - name: check_dir_exists
    command: "test -d {path}"
    expected: "exit 0"
    params: [path]

  - name: check_git_remote
    command: "git -C {repo_path} remote -v"
    expected: "contains {expected_remote}"
    params: [repo_path, expected_remote]

  - name: check_no_stale_refs
    command: "grep -rn '{pattern}' {search_path} 2>/dev/null"
    expected: "empty output"
    params: [pattern, search_path]

  - name: check_clean_working_tree
    command: "git -C {repo_path} status --porcelain"
    expected: "empty output"
    params: [repo_path]
```

```yaml
# Coding.yaml
checks:
  - name: check_tests_pass
    command: "{runner} {test_path}"
    expected: "exit 0"
    params: [runner, test_path]

  - name: check_types
    command: "bun tsc --noEmit --project {tsconfig_path}"
    expected: "exit 0"
    params: [tsconfig_path]
```

### Custom Agent: None

Architecture A does not use a custom agent. The primary agent executes the plan directly, constrained by hooks. This is the simplest architecture — fewest moving parts.

---

## Workflows

### Create Workflow

1. Read plan authoring guide (`~/.claude/PAI/USER/PLANAUTHORINGGUIDE.md`)
2. Leverage Architect agent for system design, Plan agent for task breakdown
3. Author plan following the guide's task specification format
4. Run PlanParser on the draft to validate structure (all tasks have "Done when" with executable criteria)
5. PlanParser flags any criteria that can't be mapped to a recipe as MANUAL_REVIEW

### Execute Workflow

1. Run `PlanParser.ts` on the plan → `plan-structure.json`
2. Run `StateManager.ts init` → creates `execution-state.json` with all tasks PENDING
3. Register hooks in settings.json (PlanGate, PlanAutoVerify, PlanRecorder)
4. Display current task to the AI with its criteria
5. AI begins work on the task
6. PlanAutoVerify fires on file changes → runs CheckRunner → updates state via StateManager
7. When all criteria pass, PlanGate allows advancement to next task
8. At checkpoint boundaries, run cumulative verification

### Fix Workflow (When Verification Fails)

1. PlanGate blocks advancement, displays: "TASK N CRITERION M FAILED: expected X, actual Y"
2. AI reads the failure details from verification-results.json
3. AI fixes the specific issue
4. PlanAutoVerify re-triggers on the fix's file changes
5. If passes: advancement unblocked. If fails again: repeat.
6. After 3 consecutive failures on same criterion: escalate to Drew via AskUserQuestion

---

## State Tracking & Recovery

**State file:** `<project>/.plan-executor/execution-state.json`

```json
{
  "plan": "plans/root-reorg-plan-2026-03-30.md",
  "plan_checksum": "sha256:abc123...",
  "initialized": "2026-03-30T19:30:00Z",
  "current_task": 3,
  "tasks": {
    "1": { "status": "PASS", "verified_at": "2026-03-30T19:35:00Z", "fix_attempts": 0 },
    "2": { "status": "PASS", "verified_at": "2026-03-30T19:38:00Z", "fix_attempts": 0 },
    "3": { "status": "IN_PROGRESS", "criteria": {
      "1": { "status": "PASS", "actual": "exit 0" },
      "2": { "status": "FAIL", "expected": "empty output", "actual": " M README.md" },
      "3": { "status": "PENDING" }
    }, "fix_attempts": 1 }
  }
}
```

**Recovery after session break:** New session reads state file, resumes from current_task. Plan checksum ensures plan hasn't been modified since execution started.

**Forensic log:** `<project>/.plan-executor/flight-recorder.jsonl`
- Append-only, one JSON object per line
- Every tool call recorded: timestamp, tool, args, output summary
- Human can `jq` the log to reconstruct exactly what happened

---

## Domain Extensibility

Add new recipes at `Recipes/*.yaml`. CheckGenerator discovers all YAML files at runtime. Each recipe defines parameterized check templates. Plan criteria are matched to recipes via keyword patterns in the criterion text.

**Adding a new domain (e.g., Docker):**
1. Create `Recipes/Docker.yaml` with checks like `check_container_running`, `check_image_exists`
2. CheckGenerator auto-discovers it on next run
3. Plan criteria referencing Docker concepts get matched to Docker recipe checks

---

## Three-Tier Cost Model

| Tier | When | Cost |
|---|---|---|
| **Direct CLI** | PlanParser, CheckRunner, StateManager — all deterministic tools | Zero AI tokens |
| **Hook enforcement** | PlanGate, PlanAutoVerify — deterministic TypeScript | Zero AI tokens |
| **AI execution** | The primary agent executing plan tasks | Standard agent tokens |

Architecture A has the lowest overhead — hooks and tools are deterministic code with no agent spawning.

---

## Native Skill/Agent Reuse

| Native Component | How Reused |
|---|---|
| Plan agent | Create workflow delegates plan authoring |
| Architect agent | Create workflow delegates system design |
| Engineer agent | Can be spawned for coding tasks within execution |
| skill-creator | Used to scaffold _PLANEXECUTOR itself |
| CommitGuard pattern | PlanGate follows the same PreToolUse hook architecture |

---

## Dev-Tools Location

```
~/projects/dev/dev-tools/agentics-dev/skills-dev/plan-executor-dev/
├── src/                    # CLI tool source
│   ├── PlanParser.ts
│   ├── CheckGenerator.ts
│   ├── CheckRunner.ts
│   └── StateManager.ts
├── hooks/                  # Hook source
│   ├── PlanGate.hook.ts
│   ├── PlanAutoVerify.hook.ts
│   └── PlanRecorder.hook.ts
├── recipes/                # Recipe definitions
├── tests/                  # Tool + hook tests
├── README.md
└── CLAUDE.md
```

---

## Failure Mode Analysis

| Failure Mode | Severity | Mitigation |
|---|---|---|
| AI writes directly to state file | CRITICAL | PlanGate guards the state file path — blocks Write/Edit to `**/execution-state.json` |
| AI writes to state file via Bash (echo >) | CRITICAL | PlanGate on Bash checks if command targets state file path |
| AI modifies plan to weaken criteria | HIGH | Plan checksum validated on every state read. Checksum mismatch = halt execution. |
| AI fabricates environment to pass checks | HIGH (structural) | Mitigated by semantic checks in recipes (content verification, not just file existence). Cannot be fully prevented. |
| PlanAutoVerify doesn't trigger (file change not detected) | MEDIUM | AI can manually invoke CheckRunner as fallback. Hook also fires on Bash (catches `mv`, `cp`). |
| State file corrupted | MEDIUM | Atomic writes via rename. Checksum validation on read. Backup copy maintained. |
| Hook performance slows execution | LOW | State file is flat JSON with O(1) lookup. No network calls. Sub-10ms per check. |

## Bypass Vectors (from Red Team)

| Vector | Difficulty | Mitigation |
|---|---|---|
| Restructure commands to avoid hook trigger | BLOCKED | Hook fires on ALL Write/Edit/Bash — no state-changing tool is unmatched |
| Write directly to state file | BLOCKED | Hook guards state file path specifically |
| Modify verification tool source | HARD | Tool stored at skill path, checksummed at init |
| Fabricate environment before checks run | HARD (structural) | Semantic recipe checks (content, not existence). More effort to fake than to do the work. |
| Ask user to run commands manually | MEDIUM | State file still doesn't update without CheckRunner running |
| Subagent without hooks | LOW | settings.json hooks apply to all sessions/agents |

---

## Summary

- **Enforcement strength:** HIGH for lazy non-compliance (today's failure class). MEDIUM for deliberate circumvention.
- **Development effort:** LOW-MEDIUM — hooks + CLI tools, no agent orchestration
- **Maintenance burden:** LOW — flat file state, simple hook logic, recipe YAML
- **PAI architecture fit:** EXCELLENT — uses hooks, CLI tools, skill structure, recipes exactly as extensibility guide prescribes
- **Domain extensibility:** HIGH — add YAML recipe files, auto-discovered
