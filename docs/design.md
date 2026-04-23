---
status: current
updated: 2026-04-23
---

# Plan Executor Tools — Design

---

## 1. Purpose + scope

This document is the detailed design for the Plan Executor Tools — the enforcement-kernel subset of Architecture A ("The Gate Keeper"). It specifies the three shippable artifacts (StateManager CLI, CheckRunner CLI, PlanGate PreToolUse hook), their deploy topology, the `validation.json` schema they share, the hook's allow-list logic, the plan-checksum algorithm, observability integration, and anti-patterns.

**What this doc covers:**
- Deploy targets and registration for StateManager, CheckRunner, PlanGate
- Validation-state JSON schema (the file the three components all operate on)
- CLI command surfaces, flags, exit codes, and programmatic API
- Hook stdin/stdout contract and allow-list decision logic
- Plan-checksum algorithm
- Shared-library usage and unified-event emission
- Testing scope (Tier A unit, Tier B integration) — NOT the test plan itself
- Anti-patterns that must not be introduced

**Deferred to `architecture-a-gate-keeper.md`:** Rationale for enforcement-by-state-not-action. Bypass-vector analysis. Failure-mode table. Three-tier cost model. Why this shape vs. alternatives.

**Deferred to the Phase-2 requirements doc (implementation-plan.md Task 2.1 produces `docs/requirements.md`):** Business requirements (BR-*), functional requirements (FR-*.*), technical requirements (TR-*.*), anti-requirements. This design doc is the *input* to that extraction — every spec below becomes a requirements trace.

**Deferred to the Phase-3 test plan (Task 3.1 produces `docs/test-plan.md`):** Concrete test cases, fixtures, coverage matrix, pass/fail thresholds. Section 12 below only scopes what Tier A vs Tier B must cover.

**Deferred to a later iteration of Architecture A (explicitly out-of-scope):** PlanParser, CheckGenerator, Recipes YAML, PlanAutoVerify hook, PlanRecorder hook, and the Create / Execute / Fix / Status workflows. Section 13 lists each with a "when to revisit" note.

---

## 2. Deployment topology

Per D1, this project ships no skill wrapper. The three artifacts deploy to PAI's existing tool and hook directories.

### 2.1 Artifact → deploy path

| Source (dev repo) | Deploy target | Kind | Docs |
|---|---|---|---|
| `src/StateManager.ts` (+ bundled lib imports) | `~/.claude/PAI/Tools/StateManager.ts` | CLI + exported API | Section 11 adds entry to `~/.claude/PAI/TOOLS.md` |
| `src/CheckRunner.ts` (+ bundled lib imports) | `~/.claude/PAI/Tools/CheckRunner.ts` | CLI | Section 11 adds entry to `~/.claude/PAI/TOOLS.md` |
| `src/PlanGate.hook.ts` + `src/handlers/PlanGateHandler.ts` (+ bundled lib imports) | `~/.claude/hooks/PlanGate.hook.ts` | PreToolUse hook (single bundled file) | Registered in `~/.claude/settings.json` (section 2.2) |

**Filename conventions** — Title-Case per `PAI/TOOLS.md` "Adding New Tools" section. Hooks use `*.hook.ts` suffix per `THEHOOKSYSTEM.md` examples (LastResponseCache.hook.ts, PRDSync.hook.ts, MdListGuard.hook.ts).

**No nested subdirectories under `PAI/Tools/`.** The TOOLS.md protocol explicitly requires a flat directory.

**`src/lib/*.ts` files are bundled, not deployed separately.** Per D13 and §9.4, the four project-local library files (`event-types.ts`, `event-emitter.ts`, `state-types.ts`, `hook-types.ts`) are inlined at build time into their consumer entry points. `src/handlers/PlanGateHandler.ts` is likewise inlined into the hook's deployed file — no separate handler file at deploy location. See §9.4 for the bundling rationale and the co-deployed `lib/` alternative if bundling proves fragile.

### 2.2 `settings.json` registration block (verbatim)

Add `PlanGate.hook.ts` **in addition to** (not replacing) the existing `SecurityValidator.hook.ts` entries on the `Write`, `Edit`, and `Bash` matchers (D12). Claude Code executes hooks within a matcher list **sequentially** (per `THEHOOKSYSTEM.md` "Multi-Hook Execution Order"), so SecurityValidator runs first and PlanGate runs second on any Bash/Edit/Write call.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${PAI_DIR}/hooks/SecurityValidator.hook.ts" },
          { "type": "command", "command": "${PAI_DIR}/hooks/PlanGate.hook.ts" }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          { "type": "command", "command": "${PAI_DIR}/hooks/SecurityValidator.hook.ts" },
          { "type": "command", "command": "${PAI_DIR}/hooks/PlanGate.hook.ts" }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "${PAI_DIR}/hooks/SecurityValidator.hook.ts" },
          { "type": "command", "command": "${PAI_DIR}/hooks/PlanGate.hook.ts" }
        ]
      }
    ]
  }
}
```

Unrelated `PreToolUse` matchers (`Read`, `AskUserQuestion`, `Task`, `Skill`) stay unchanged.

### 2.3 Post-deploy verification commands

After copying files and editing settings.json, a deploying operator (or deployment workflow) runs:

```bash
# 1. Files exist and are executable
test -x ~/.claude/PAI/Tools/StateManager.ts && echo OK
test -x ~/.claude/PAI/Tools/CheckRunner.ts && echo OK
test -x ~/.claude/hooks/PlanGate.hook.ts && echo OK
# Note: handler is inlined into the bundled hook file (§9.4); no separate handler file at deploy.

# 2. settings.json is valid JSON
jq . ~/.claude/settings.json > /dev/null && echo OK

# 3. settings.json registers PlanGate on all three matchers
jq -e '.hooks.PreToolUse[] | select(.matcher == "Bash")  | .hooks[].command | test("PlanGate\\.hook\\.ts")' ~/.claude/settings.json
jq -e '.hooks.PreToolUse[] | select(.matcher == "Edit")  | .hooks[].command | test("PlanGate\\.hook\\.ts")' ~/.claude/settings.json
jq -e '.hooks.PreToolUse[] | select(.matcher == "Write") | .hooks[].command | test("PlanGate\\.hook\\.ts")' ~/.claude/settings.json

# 4. Tools respond to --help
bun ~/.claude/PAI/Tools/StateManager.ts --help | head -1
bun ~/.claude/PAI/Tools/CheckRunner.ts  --help | head -1

# 5. Hook smoke test — no plan active → allow
echo '{"session_id":"smoke","transcript_path":"/tmp/x.jsonl","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo hello"}}' \
  | bun ~/.claude/hooks/PlanGate.hook.ts
# Expected: exit 0, no stdout JSON (silent allow)
```

A Claude Code restart is required after editing `settings.json` (hooks load at startup per `THEHOOKSYSTEM.md` §Creating Custom Hooks step 6).

---

## 3. `validation.json` schema

The single state file all three components operate on. Located at the project's declared validation path (typically `<project_root>/validation.json`). StateManager is the sole writer (D1, D9). CheckRunner and PlanGate are readers. Drew hand-authors the initial file (this project has no PlanParser to generate it).

### 3.1 Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `plan` | string | yes | Relative path to the prose plan (e.g. `implementation-plan.md`). Not parsed by the tools; human reference only. |
| `project` | string | yes | Project slug for logs/events. |
| `status` | enum | yes | `IN_PROGRESS` \| `COMPLETED` \| `ABANDONED`. StateManager flips to `COMPLETED` when the last phase hits PASS. |
| `plan_checksum` | string \| null | yes | SHA256 over the validation.json *criteria structure* (see §8). `null` on init; set by `StateManager init`. Validated on every `read`. |
| `initialized` | string \| null | yes | ISO-8601 timestamp (UTC). Set by `StateManager init`. `null` in the as-authored file. |
| `current_phase` | number | yes | Current phase key as a number. 0 valid. |
| `current_task` | string | yes | Current task ID (e.g. `"2.1"`). Matches a `phases[current_phase].tasks` key. |
| `notes` | string | optional | Free-form human notes. Preserved by StateManager but never written to by it. |
| `phases` | object | yes | Map of phase-id (string) → Phase object (§3.2). |
| (any unknown field) | any | — | **Preserved on write** (D11). StateManager never strips unknown top-level or nested fields. |

### 3.2 Phase object

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human-readable phase name. |
| `status` | enum | yes | `PENDING` \| `IN_PROGRESS` \| `PASS` \| `BLOCKED`. |
| `tasks` | object | yes | Map of task-id (string, dotted like `"2.1"`) → Task object (§3.3). |

### 3.3 Task object

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Human task name. |
| `status` | enum | yes | `PENDING` \| `IN_PROGRESS` \| `PASS` \| `FAIL` \| `BLOCKED`. |
| `verified_at` | string \| null | yes | ISO-8601 timestamp when task flipped to PASS. |
| `fix_attempts` | number | yes | Count of FAIL → retry cycles on this task. StateManager increments on failed `update-criterion`. |
| `criteria` | object | yes | Map of criterion-id (string, typically `"1"`, `"2"`, …) → Criterion object (§3.4). |

### 3.4 Criterion object

| Field | Type | Required | Description |
|---|---|---|---|
| `check` | string | yes | Short description of what is being verified. |
| `type` | enum | yes | `automated` \| `manual`. |
| `command` | string | required when `type === "automated"` | Shell command expected to print `PASS` or `FAIL` on stdout. CheckRunner runs it via `bash -c`. |
| `prompt` | string | required when `type === "manual"` | Question text presented to the orchestrator. |
| `status` | enum | yes | `PENDING` \| `PASS` \| `FAIL`. |
| `evidence` | string | yes | Free-form evidence / answer / captured stdout. Empty string until set by `update-criterion`. |

### 3.5 Forward-compat behavior (D11)

- StateManager parses the entire document, operates on the known fields, and writes back with unknown fields preserved byte-for-byte when possible, preserved semantically (via JSON round-trip) otherwise.
- Unknown fields on criteria, tasks, phases, or the top level are never dropped, never re-ordered deliberately (object-key order is a best-effort property — JSON does not guarantee it, so clients should not rely on it).
- New enum values that StateManager does not recognize in `status` are preserved on read but cannot be targeted by `update-criterion` or `advance-task`. `validate` reports them as `unknown_enum` warnings, not errors.

### 3.6 Concrete example (structural, abbreviated)

A working example is already on disk at `~/projects/dev/dev-sor/agentics-dev/skills-dev/presentations-skill-dev/validation.json`. The shape in miniature:

```json
{
  "plan": "implementation-plan.md",
  "project": "example",
  "status": "IN_PROGRESS",
  "plan_checksum": null,
  "initialized": null,
  "current_phase": 0,
  "current_task": "0.1",
  "notes": "Hand-authored. StateManager populates plan_checksum and initialized on init.",
  "phases": {
    "0": {
      "name": "Git setup",
      "status": "PENDING",
      "tasks": {
        "0.1": {
          "name": "Initialize git repo",
          "status": "PENDING",
          "verified_at": null,
          "fix_attempts": 0,
          "criteria": {
            "1": {
              "check": ".git directory exists",
              "type": "automated",
              "command": "test -d .git && echo PASS || echo FAIL",
              "status": "PENDING",
              "evidence": ""
            },
            "2": {
              "check": "Drew authorized the remote visibility",
              "type": "manual",
              "prompt": "Did you authorize public vs. private for the origin remote?",
              "status": "PENDING",
              "evidence": ""
            }
          }
        }
      }
    }
  }
}
```

---

## 4. StateManager CLI spec

**Invocation:** `bun ~/.claude/PAI/Tools/StateManager.ts <command> [flags]`

**Global flags (D6):** `--json`, `--verbose`, `--help`.

**Global exit codes (D7):** `0` success, `1` user error / FAIL result, `2` system error, `3` gate violation, `4` manual criterion needs AskUserQuestion.

Every command accepts `--path <file>` (default: `./validation.json`) to specify the state file.

### 4.1 `init`

- **Synopsis:** `StateManager init --path <file>`
- **Purpose:** Compute plan_checksum over the as-authored criteria structure; write it and `initialized` (ISO-8601 UTC now). Idempotent: re-running after `plan_checksum` is set is a no-op success if the recomputed checksum matches; an error (exit 1) if the authored structure has changed since first init.
- **Stdin:** none.
- **Stdout:** `--json` → `{"ok":true,"plan_checksum":"...","initialized":"..."}`. Default → `initialized <path> (checksum sha256:abc123...)`.
- **Exit:** 0 on success, 1 if file is malformed JSON, 2 on I/O failure.
- **Errors:**
  - `E_MALFORMED_JSON` — file is not valid JSON
  - `E_SCHEMA` — file lacks required top-level fields (`phases`, `current_phase`, `current_task`)
  - `E_CHECKSUM_DRIFT` — re-init after `plan_checksum` already set, but authored structure changed (this is the "tamper detection" case)

### 4.2 `read`

- **Synopsis:** `StateManager read [--task <id>] [--phase <id>] [--criterion <taskId:critId>] --path <file>`
- **Purpose:** Read-only projection of state. Validates plan_checksum on every invocation. Used by CheckRunner to learn what needs to run, and by PlanGate to answer "is CheckRunner the allowed tool right now."
- **Stdin:** none.
- **Stdout:**
  - Default (no target flags): pretty-print summary of `current_phase`, `current_task`, per-task status counts.
  - `--task <id>`: the full Task object as JSON (forces `--json` semantics).
  - `--phase <id>`: the full Phase object as JSON.
  - `--criterion <taskId:critId>`: the Criterion object as JSON, with its enclosing task id and phase id added in a wrapper (`{"phase":"2","task":"2.1","criterion":"3","object":{...}}`).
- **Exit:** 0 on success. 1 if `--task` / `--phase` / `--criterion` target doesn't exist. 2 on I/O or schema failure. 3 if `plan_checksum` mismatch (treat as gate violation — state is compromised).

### 4.3 `update-criterion`

- **Synopsis:** `StateManager update-criterion --task <id> --criterion <critId> --status <PASS|FAIL> [--evidence <text>] --path <file>`
- **Purpose:** Sole path to flip a criterion from PENDING to PASS or FAIL. Atomic (temp-file-plus-rename per D9). Also updates the parent task's `status` to `IN_PROGRESS` if it was `PENDING`; increments `fix_attempts` on FAIL. Does NOT advance the task to PASS — that's `advance-task`.
- **Stdin:** if `--evidence -` is given, evidence is read from stdin (supports multi-line capture).
- **Stdout:** `--json` → `{"ok":true,"task":"...","criterion":"...","status":"...","evidence_len":N}`. Default → `ok: 2.1 criterion 1 → PASS`.
- **Exit:** 0 on success; 1 if task or criterion id not found, or `--status` is an unknown value.
- **Errors:**
  - `E_TARGET_NOT_FOUND` — phase/task/criterion id doesn't match state
  - `E_INVALID_STATUS` — `--status` not one of `PASS`, `FAIL`
  - `E_WRITE` — atomic rename failed (caller should retry)

### 4.4 `advance-task`

- **Synopsis:** `StateManager advance-task --task <id> --path <file>`
- **Purpose:** Flip task to PASS (setting `verified_at`) iff every criterion is PASS. Update `current_task` to the next task (next numeric key within the phase, or first task of the next phase). Update `current_phase` when the phase rolls over. When all phases PASS, flip top-level `status` to `COMPLETED`.
- **Stdin:** none.
- **Stdout:** `--json` → `{"ok":true,"advanced_to":"2.2","phase_complete":false,"plan_complete":false}`. Default → `ok: 2.1 PASS → 2.2 now current`.
- **Exit:** 0 on success. 1 if any criterion of the task is not PASS (precondition violation). 2 on I/O failure.
- **Errors:**
  - `E_CRITERIA_INCOMPLETE` — task has one or more non-PASS criteria; response payload names which ones
  - `E_TARGET_NOT_FOUND` — task id invalid

### 4.5 `show`

- **Synopsis:** `StateManager show [--phase <id>] --path <file>`
- **Purpose:** Human-oriented rendering. No mutation. If `--phase` omitted, shows `current_phase` detail.
- **Stdout:** Multi-line tree rendering with PASS/FAIL icons (✓ / ✗ / …). Honors `--json` by returning the same Phase object as `read --phase`.
- **Exit:** 0 always on success.

### 4.6 `validate`

- **Synopsis:** `StateManager validate --path <file>`
- **Purpose:** Schema check. Does not mutate. Verifies required fields present, enum values in known sets, criterion objects consistent with `type` (e.g., `automated` has `command`, `manual` has `prompt`), task ids syntactically phase-prefixed, `current_task` resolves within `current_phase`.
- **Stdout:** `--json` → `{"ok":bool,"errors":[...],"warnings":[...]}`. Default → `OK` or error list with line-level context when possible.
- **Exit:** 0 if valid. 1 if validation errors (warnings alone do not fail). 2 on I/O.

### 4.7 `checksum`

- **Synopsis:** `StateManager checksum --path <file>`
- **Purpose:** Emit the recomputed plan_checksum of the file's current criteria structure. Does not write. Used for CI-style drift checks and debugging.
- **Stdout:** `sha256:abc123…` (plain), or `--json` → `{"plan_checksum":"sha256:abc123..."}`.
- **Exit:** 0 always on success. 2 on I/O.

### 4.8 Error and help conventions

- All errors print a structured error to stderr: `ERROR: <E_CODE>: <human message>`. With `--json`, errors also go to stdout as `{"ok":false,"error":"E_CODE","message":"..."}`.
- `--help` on any subcommand prints the synopsis, flags, and one sentence of purpose. `StateManager --help` (no subcommand) lists all subcommands.
- Per `CLIFIRSTARCHITECTURE.md` §Idempotency and §Error Handling, same command twice must yield same result; error messages name the fix.

---

## 5. StateManager programmatic API

Exported TypeScript functions CheckRunner (and, eventually, other tools / hooks) import directly. No subprocess overhead for same-process callers. Signatures are contracts — implementation is not in scope for this doc.

```ts
// Types (exported)
export type CriterionStatus = 'PENDING' | 'PASS' | 'FAIL';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'PASS' | 'FAIL' | 'BLOCKED';
export type PhaseStatus = 'PENDING' | 'IN_PROGRESS' | 'PASS' | 'BLOCKED';

export interface Criterion { /* §3.4 fields */ }
export interface Task { /* §3.3 fields */ criteria: Record<string, Criterion>; }
export interface Phase { /* §3.2 fields */ tasks: Record<string, Task>; }
export interface ValidationState { /* §3.1 fields */ phases: Record<string, Phase>; }

// Error hierarchy (exported)
export class StateManagerError extends Error { code: string; }
export class SchemaError          extends StateManagerError {}  // E_SCHEMA, E_MALFORMED_JSON
export class ChecksumError        extends StateManagerError {}  // E_CHECKSUM_DRIFT / mismatch
export class TargetNotFoundError  extends StateManagerError {}  // E_TARGET_NOT_FOUND
export class PreconditionError    extends StateManagerError {}  // E_CRITERIA_INCOMPLETE
export class IOError              extends StateManagerError {}  // E_WRITE, read failures

// Functions
export function readState(path: string): ValidationState;
// Returns the parsed state. Throws SchemaError on malformed JSON/missing required fields.
// Throws ChecksumError if plan_checksum is set AND the recomputed checksum differs.
// Never mutates disk.

export function writeState(path: string, state: ValidationState): void;
// Atomic write: serialise → temp file in same directory → fsync → rename (D9).
// Preserves unknown fields present on the in-memory state object (D11).
// Throws IOError on rename or fsync failure.

export function initState(path: string): ValidationState;
// Reads, computes plan_checksum, stamps initialized, writes atomically.
// Idempotent: no-op if plan_checksum matches; ChecksumError if mismatch.
// Returns the post-init state.

export function computePlanChecksum(state: ValidationState): string;
// Pure. Returns "sha256:<hex>" per §8 algorithm. No side effects.

export function updateCriterion(
  state: ValidationState,
  taskId: string,
  criterionId: string,
  status: 'PASS' | 'FAIL',
  evidence: string
): ValidationState;
// Pure transform. Returns a new state object (structural share is fine, but no
// in-place mutation of caller's object). Flips parent task to IN_PROGRESS if PENDING.
// On FAIL, increments parent task's fix_attempts.
// Throws TargetNotFoundError if taskId/criterionId does not resolve.

export function advanceTask(state: ValidationState, taskId: string): ValidationState;
// Pure transform. If every criterion of taskId is PASS, sets task to PASS,
// stamps verified_at, advances current_task (next key in phase, else first task
// of next phase; sets current_phase accordingly). If all phases PASS, sets
// top-level status to "COMPLETED".
// Throws PreconditionError (E_CRITERIA_INCOMPLETE) with a list of non-PASS
// criterion ids if not all criteria are PASS.

export function findCurrentCriterion(state: ValidationState): {
  phaseId: string;
  taskId: string;
  criterion: Criterion | null;  // null when current task has no PENDING criterion
  criterionId: string | null;
};
// Resolver used by CheckRunner (§6) to decide what to run when called without --task.
```

**Contract notes:**
- All transform functions are **pure** — they never touch disk, never mutate input. The CLI layer is the *only* site that calls `readState` / `writeState`.
- `computePlanChecksum` is called twice per `init`: once to stamp, once on re-init to verify idempotency.
- CheckRunner only needs `readState`, `writeState`, `updateCriterion`, `advanceTask`, `findCurrentCriterion`, and the error classes.

---

## 6. CheckRunner CLI spec

**Invocation:** `bun ~/.claude/PAI/Tools/CheckRunner.ts <command> [flags]`

Currently one subcommand (`run`) is in scope scope. The top-level binary also accepts `--help`, `--json`, `--verbose` (D6).

### 6.1 `run`

- **Synopsis:** `CheckRunner run [--task <id>] [--dry-run] [--manual-prompt-strategy stdin|askuser] [--answer <response>] --path <file>`
- **Default behavior:** resolve current task via `findCurrentCriterion` on the loaded state; iterate the task's criteria in numeric-id order; evaluate each pending one; call `updateCriterion` on the result; if every criterion ends PASS, call `advanceTask`.
- **Flags:**
  - `--task <id>` — explicit task to run (overrides current_task; useful for retries).
  - `--dry-run` — evaluate all automated criteria, print a report, **do not write to state**. Manual criteria are reported as "would prompt: <prompt>"; `--answer` is ignored under `--dry-run`.
  - `--manual-prompt-strategy stdin|askuser` — how to resolve manual criteria (default: `stdin`, per D10).
  - `--answer <response>` — supply the answer for the next pending manual criterion without prompting. Only consumed when `--manual-prompt-strategy askuser` is active and the tool is being re-invoked after an exit-4. Also accepted under `stdin` strategy as a scripted shortcut.
- **Stdin:** Under `stdin` strategy, when a manual criterion is reached, CheckRunner prints the prompt to stdout and reads a single line from stdin as the answer. Under `askuser` strategy, CheckRunner exits with code 4 (§6.4).

### 6.2 Automated-criterion execution flow

For each PENDING automated criterion in order:

1. Emit `plan.criterion.running` event (optional — §9).
2. Spawn `bash -c "<criterion.command>"`. Timeout: 30s default; overridable via `CHECKRUNNER_TIMEOUT_MS` env. Capture stdout, stderr, exit code.
3. Parse stdout: the last non-empty line must be exactly `PASS` or `FAIL`. Any other content in stdout is captured as `evidence`.
4. Decide:
   - `PASS` on stdout AND exit 0 → record PASS with evidence = captured stdout (trimmed). Emit `plan.criterion.passed`.
   - `FAIL` on stdout OR exit != 0 → record FAIL with evidence = `exit_code=N\nstdout=...\nstderr=...`. Emit `plan.criterion.failed`.
   - Timeout → record FAIL with evidence = `TIMEOUT after 30000ms`.
5. Call `StateManager.updateCriterion` (unless `--dry-run`).

### 6.3 Manual-criterion execution flow (D10)

For each PENDING manual criterion in order:

**Strategy `stdin` (default):**
1. Print the criterion's `prompt` to stdout on its own line, prefixed with `MANUAL: `.
2. Read one line from stdin (blocking).
3. Treat the line as evidence. Classify:
   - Empty line → FAIL (evidence: `no answer provided`).
   - Non-empty → PASS with evidence = the line, **unless** `--verbose` is set, in which case CheckRunner additionally echoes `Recorded as PASS` to stderr.
4. Call `StateManager.updateCriterion`.
5. Emit `plan.criterion.passed` / `plan.criterion.failed`.

This strategy is the default because it composes naturally: the orchestrator agent can invoke CheckRunner as a normal subprocess and pipe answers in. It also works in interactive terminal usage.

**Strategy `askuser`:**
1. The very first pending manual criterion encountered aborts the run.
2. CheckRunner prints structured JSON to **stderr** and exits with code 4:
   ```json
   {
     "exit_reason": "manual_criterion_needs_askuser",
     "task": "2.2",
     "criterion": "3",
     "prompt": "Did you review the diff…?",
     "resume_command": "CheckRunner run --task 2.2 --manual-prompt-strategy askuser --answer <RESPONSE>"
   }
   ```
3. The orchestrator calls AskUserQuestion, captures the human response, and re-invokes CheckRunner with `--answer <response>`. That response is applied to the criterion that caused the exit-4; CheckRunner then continues into any remaining criteria for the task.
4. If there are further manual criteria after the answered one, CheckRunner again exits 4 for the next one — one round-trip per manual criterion. (Acceptable because manual criteria are rare and the cost is a single AskUserQuestion per.)

**Why both strategies exist:** `stdin` is for scripted runs and CI-like usage where Drew is piping answers or accepting the criterion via a prompt at the terminal. `askuser` is for main-agent orchestration where the model wants to pause and use AskUserQuestion UX, especially when a criterion benefits from a structured response shape.

### 6.4 Exit codes (CheckRunner-specific, per D7)

- `0` — all criteria for the target task ended PASS; task was advanced.
- `1` — user error (unknown `--task`, malformed flags) OR one or more criteria ended FAIL. Stderr lists which.
- `2` — system error (command timeout, StateManager write failure, malformed state file).
- `3` — plan_checksum mismatch detected on read. Halts immediately.
- `4` — manual criterion encountered under `askuser` strategy (§6.3). Stderr contains the structured payload.

### 6.5 Reporting format

Default stdout after a `run` that completed (exit 0 or exit 1 FAIL):

```
Task 2.1  "Draft requirements document"
  [✓] Criterion 1: docs/requirements.md exists
       evidence: PASS
  [✓] Criterion 2: Contains Business Requirements section
       evidence: PASS
  [✗] Criterion 3: Contains Functional Requirements section
       evidence: exit_code=1
                 stdout=FAIL
                 stderr=grep: docs/requirements.md: No such file
Result: 2 passed, 1 failed, 0 manual
Task advance: SKIPPED (criteria incomplete)
```

`--json` swaps the above for:

```json
{
  "task": "2.1",
  "results": [
    { "id": "1", "status": "PASS", "evidence": "PASS" },
    { "id": "2", "status": "PASS", "evidence": "PASS" },
    { "id": "3", "status": "FAIL", "evidence": "exit_code=1\nstdout=FAIL\nstderr=grep: ..." }
  ],
  "summary": { "passed": 2, "failed": 1, "manual": 0 },
  "advanced": false
}
```

### 6.6 Dry-run reporting

`--dry-run` adds a header line `[DRY RUN — state file not modified]` and uses hypothetical verbs in prose mode (`would record PASS`). No `plan.*` events are emitted in dry-run.

---

## 7. PlanGate hook spec

### 7.1 Role

PreToolUse hook fired on `Write`, `Edit`, and `Bash` (D12). Guards against the primary failure mode (AI mutating files without verifying the current task). Allow-lists the specific tool calls needed to make the current task pass.

Per D3, the hook uses the **handler-delegate pattern**:
- `src/PlanGate.hook.ts` — thin wrapper. Reads stdin via `readHookInput()`, calls `PlanGateHandler.decide(input)`, prints JSON response, exits. Fail-open on any error per `THEHOOKSYSTEM.md` §Graceful Failure.
- `src/handlers/PlanGateHandler.ts` — pure function. Given a parsed HookInput, returns a decision object (`{ decision: "allow" | "block", reason?: string, event?: EventPayload }`). No stdin reading, no process.exit, no filesystem side-effects other than calling `appendEvent()` (from `./lib/event-emitter` per D13). Unit-testable.

### 7.2 Hook stdin input (canonical Claude Code shape)

Per `THEHOOKSYSTEM.md` §Hook Input and §PreToolUse payload:

```ts
interface HookInput {
  session_id: string;
  transcript_path: string;
  hook_event_name: "PreToolUse";
  tool_name: "Bash" | "Edit" | "Write";
  tool_input: Record<string, unknown>;
  // cwd present in session-start; may be absent in PreToolUse — do not depend on it.
}
```

Concrete `tool_input` shapes PlanGate reads:
- `Bash` → `{ command: string, description?: string, run_in_background?: boolean }`
- `Edit` → `{ file_path: string, old_string: string, new_string: string, replace_all?: boolean }`
- `Write` → `{ file_path: string, content: string }`

### 7.3 Active-plan discovery

The hook is session-wide (per `architecture-a-gate-keeper.md` §Subagent coverage: "Hooks registered in settings.json apply session-wide"), but it only enforces when a plan is active. An "active plan" is signalled by the presence of a pointer at a well-known path.

**Pointer file:** `~/.claude/MEMORY/STATE/plan-executor.active.json`

```json
{
  "validation_path": "/abs/path/to/project/validation.json",
  "project": "presentations-skill-dev",
  "activated_at": "2026-04-21T14:00:00Z",
  "session_id": "session-uuid-…"
}
```

The pointer is written by StateManager on `init` (which also takes `--activate` implicitly: init activates the plan for the current session) and deleted on `SessionEnd` or on explicit `StateManager deactivate` (deferred; not in scope). In scope, the operator manually deletes the pointer when done.

If no pointer exists → `decision: allow` (silent). If pointer exists but `validation_path` doesn't resolve → `decision: allow` (fail-open per hook best practice; log a `hook.error` event).

### 7.4 Allow-list decision logic (D2 — pseudocode)

```text
decide(input):
  if not plan_active():                              # no pointer → ignore
    return ALLOW
  state = readState(pointer.validation_path)         # throws on checksum drift
  current = findCurrentCriterion(state)
  task = state.phases[current.phaseId].tasks[current.taskId]

  # 1. Checksum drift = fail closed
  # (readState already throws ChecksumError → caller treats as BLOCK)

  # 2. State-file write protection (applies BEFORE allow-list)
  target = extract_target_path(input.tool_name, input.tool_input)
  if target and realpath_equals(target, pointer.validation_path):
    return BLOCK(reason="validation.json is written only by StateManager. Use: bun ~/.claude/PAI/Tools/StateManager.ts update-criterion|advance-task ...")

  # 3. Allow-list: per-tool
  if input.tool_name == "Bash":
    cmd = input.tool_input.command
    if invokes_statemanager(cmd) or invokes_checkrunner(cmd):
      return ALLOW
    if task.status == "PASS":
      return ALLOW    # task is done; any Bash is fine until advance
    return BLOCK(reason=gate_message(current))

  if input.tool_name in ("Edit", "Write"):
    target_real = realpath(input.tool_input.file_path)
    if not target_exists_or_parent_exists(target_real):
      # Writing a brand-new file — allowed if within project root declared in pointer.
      if is_under_project_root(target_real, pointer):
        return ALLOW
    if task.status == "PASS":
      return ALLOW
    return BLOCK(reason=gate_message(current))
```

**Allow-list match criteria (D2 — realpath + existence):**
- A path is "under the project root" iff `realpath(target)` starts with `realpath(project_root_from_pointer) + "/"`.
- A Bash command "invokes StateManager" iff, after shell-safe tokenisation (splitting on whitespace outside quotes), one of the tokens is the real path of `~/.claude/PAI/Tools/StateManager.ts` OR a path that resolves to it. Same rule for CheckRunner.
- No env-var secrets (D2). No cryptographic bypass key. The threat model is "my own AI under context pressure," not adversarial — physical path + existence check is sufficient.

**Why allow-list is simple on purpose (D2):** A richer allow-list (per-task, per-tool) is on the architecture-a roadmap but not in scope. This project pattern is "either a task is PASS, or only StateManager/CheckRunner may write." This is strong enough for the failure mode being mitigated (AI skipping verification) and avoids the complexity of an allow-list that must itself be edited as tasks advance.

### 7.5 Block / allow output format

Per `THEHOOKSYSTEM.md` (MdListGuard.hook.ts as the canonical example), hooks emit JSON to stdout.

**Allow** — silent. No stdout. Exit 0.

**Block** — JSON to stdout naming the reason and the exact next step. Exit 0 (per best practice — block via content, not exit code).

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "PlanGate: task 2.1 \"Draft requirements document\" has 1 FAIL and 2 PENDING criteria. Run verification before mutating files:\n\n  bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1\n\nIf the criteria pass, advancement is automatic. If they fail, fix the specific issue and re-run CheckRunner."
  }
}
```

**Schema verified 2026-04-21** via the `claude-code-guide` agent against the current Claude Code hooks documentation at https://code.claude.com/docs/en/hooks.md §PreToolUse.

- The envelope is `hookSpecificOutput` with fields `hookEventName: "PreToolUse"`, `permissionDecision: "deny" | "allow" | "ask" | "defer"`, and `permissionDecisionReason: string`.
- `permissionDecision: "defer"` was added in Claude Code v2.1.89+ (non-interactive mode only); this project does not use it.
- **Exit code 0** when returning JSON — do not exit 1 or 2. Exit 2 with stderr is the older blocking pattern and is now discouraged in favour of structured `permissionDecision: "deny"` with exit 0.
- The production precedent on Drew's machine is `SecurityValidator.hook.ts`, registered on the same `Write|Edit|Bash` matchers (that's what PlanGate will sit alongside per D12). It uses this exact schema.

MdListGuard's envelope — `{"hookSpecificOutput":{"hookEventName":"PostToolUse","message":"..."}}` — is the PostToolUse warning shape (non-blocking). PlanGate is PreToolUse blocking, which is the `permissionDecision` shape shown above.

### 7.6 Event emission (D5)

On every decide() call:
- `allow` → `appendEvent({ type: "plan.gate.allowed", source: "PlanGate", tool: input.tool_name, task: current.taskId })`
- `block` → `appendEvent({ type: "plan.gate.blocked", source: "PlanGate", tool: input.tool_name, task: current.taskId, reason_code: "..." })`
- State-file write attempt → `appendEvent({ type: "plan.gate.blocked", source: "PlanGate", tool: input.tool_name, task: current.taskId, reason_code: "state_file_write_attempt" })`

`reason_code` is a short enum: `"task_not_pass"`, `"state_file_write_attempt"`, `"checksum_drift"`.

### 7.7 Interaction with SecurityValidator (D12, sequential)

`settings.json` lists SecurityValidator first, PlanGate second (§2.2). Per `THEHOOKSYSTEM.md` §Multi-Hook Execution Order, Claude Code runs them sequentially. If SecurityValidator denies, Claude Code short-circuits and PlanGate never sees the call. If SecurityValidator allows, PlanGate runs next and may still deny. This means:

- **SecurityValidator retains its role** as the first line of defence for dangerous-command detection and sensitive-file protection. PlanGate does not duplicate or replace any SecurityValidator rule.
- **PlanGate's only concern is plan discipline.** It has no security opinions about `rm -rf /` — SecurityValidator handles that.
- **No conflict on the validation.json path.** PlanGate's write-protection rule targets the plan's state file, not any of SecurityValidator's sensitive paths. Even if both fired, a "deny" from either is enough to block.

---

## 8. Plan checksum

### 8.1 Algorithm (D8)

```text
1. Read validation.json as parsed JSON object (full document, unknown fields included).
2. Extract the "criteria structure" projection:
   - For each phase-id in phases (sorted lexicographically):
     - For each task-id in that phase's tasks (sorted by natural dotted-numeric order, i.e. "2.1" < "2.2" < "2.10"):
       - For each criterion-id in that task's criteria (sorted numerically when possible, lexicographically otherwise):
         - Keep only: check, type, command (if automated), prompt (if manual).
         - Drop: status, evidence, verified_at, fix_attempts (these are state, not structure).
3. Emit canonical JSON: stable sorted object keys at every level, no insignificant whitespace, \n as object separator.
   (Implementation: JSON.stringify with a key-sorting replacer; or `json-stable-stringify`-style canonicalisation.)
4. SHA256 over the UTF-8 bytes of that canonical JSON.
5. Return "sha256:" + lowercase hex digest.
```

**This is a checksum of the plan's *criteria structure*, not the prose plan.** The prose plan (implementation-plan.md) can be edited freely — typos fixed, rationale elaborated — without invalidating the checksum. Only changes to *what is being verified* (adding/removing a criterion, changing an automated command, changing a manual prompt, renaming a task) invalidate the checksum.

**Rationale:** The prose plan is documentation; the criteria structure is the enforcement surface. Coupling the checksum to the prose would create churn and discourage plan refinement. Coupling it to the criteria structure makes tamper-detection precise.

### 8.2 When it's computed

- Once at `StateManager init` — computed and stamped into `plan_checksum`.
- On every `StateManager read` — recomputed and compared. Mismatch is a `ChecksumError` (CLI exit 3; hook translates to BLOCK).
- By the `StateManager checksum` subcommand on demand (no side effects).

### 8.3 What validation failure means

A `ChecksumError` means the validation.json criteria structure has been modified since init without going through StateManager. This is the tamper-detection signal from `architecture-a-gate-keeper.md` §Failure Mode Analysis ("AI modifies plan to weaken criteria"). Response:

1. StateManager/CheckRunner halts and prints: `ERROR: E_CHECKSUM_DRIFT: plan_checksum in validation.json does not match recomputed structure. Plan may have been modified. Restore from git or re-init with --force-reinit (if intended).`
2. PlanGate halts (`decide` returns BLOCK with `reason_code: "checksum_drift"`), so no Bash/Edit/Write can proceed until resolved.
3. Drew decides: restore from git, or explicitly re-init (a `--force-reinit` flag on `StateManager init` that overwrites `plan_checksum` with the current recomputed value). this project does not ship `--force-reinit` automatically; implement only if Phase-4 testing surfaces the need.

---

## 9. Shared library usage

**Two categories of library imports:**

1. **Existing PAI shared libs** (already shipped in `~/.claude/hooks/lib/`). Import unchanged.
2. **project-local libs** (authored by this project, carry no-suffix library naming per D13). Live in `src/lib/`. Single source of truth for all four deploy targets (StateManager, CheckRunner, PlanGate hook wrapper, PlanGateHandler).

### 9.1 Existing PAI libs (imported unchanged)

| Component | Imports | Why |
|---|---|---|
| `PlanGate.hook.ts` (thin wrapper) | `~/.claude/hooks/lib/hook-io.ts → readHookInput()` | Standard stdin-reading boilerplate with 500ms timeout. Matches existing hooks (LastResponseCache, PRDSync). Generic JSON parser — shape-agnostic. |

`hook-io.ts`'s exported `HookInput` type is Stop-hook-shaped (`session_id`, `transcript_path`, `hook_event_name`, `last_assistant_message`). PreToolUse adds `tool_name` and `tool_input`. The wrapper casts the parsed input to this project's richer `PreToolUseHookInput` type (defined in `src/lib/hook-types.ts` — see 9.2).

### 9.2 project-local libs (authored by this project, per D13)

All four files live at `src/lib/` in the dev repo. At deploy time, each entry-point CLI and the hook wrapper are produced as self-contained bundles (see §9.4).

| File | Kind | Purpose | Consumers |
|---|---|---|---|
| `event-types.ts` | Types only | TypeScript discriminated union of all `plan.*` event shapes, plus common base `{ timestamp, session_id, source, type }`. Zero runtime. | Imported by `event-emitter.ts`. |
| `event-emitter.ts` | Runtime | Exports `appendEvent(event)`. Auto-injects `timestamp` (ISO 8601) and `session_id` (from `CLAUDE_SESSION_ID` env var). Resolves project-local log path. Calls `fs.appendFileSync`. Swallows write errors silently (observability never breaks host code). | `PlanGateHandler.ts`, `StateManager.ts`, `CheckRunner.ts`. |
| `state-types.ts` | Types only | Interface types for `validation.json`: `ValidationState`, `Phase`, `Task`, `Criterion` (discriminated on `type: "automated" \| "manual"`), `PhaseStatus`, `TaskStatus`, `CriterionStatus`. Zero runtime. | `StateManager.ts`, `CheckRunner.ts`, `PlanGateHandler.ts`. |
| `hook-types.ts` | Types only | `PreToolUseHookInput` interface extending `hook-io.ts`'s `HookInput` with `tool_name` and `tool_input`. Plus typed `tool_input` shapes for `Bash`, `Edit`, `Write`. Zero runtime. | `PlanGate.hook.ts`, `PlanGateHandler.ts`. |

### 9.3 Event emission contract (D5)

**Log path (per-project, per D5 revised):**
```
<project-root>/.plan-executor/events.jsonl
```

`<project-root>` is resolved from the active-plan pointer file (§7.3) — the `validation_path` field's directory is the project root. No events are written if no plan pointer is active.

**`appendEvent(event)` signature:**
```ts
function appendEvent(event: PlanExecutorEventMvp): void
```

Auto-injected fields (caller must not supply): `timestamp` (ISO 8601 current time), `session_id` (from `CLAUDE_SESSION_ID` env var; falls back to string `"unknown"` if unset). Caller supplies: `source`, `type`, type-specific fields below.

**Event types emitted (per D5):**

| Event type | Emitted by | Caller-supplied fields |
|---|---|---|
| `plan.gate.blocked` | PlanGateHandler | `tool` (Bash\|Edit\|Write), `task`, `reason_code`, `target_path?` |
| `plan.gate.allowed` | PlanGateHandler | `tool`, `task` |
| `plan.task.advanced` | StateManager (`advance-task`) | `from_task`, `to_task`, `phase_rolled?`, `plan_completed?` |
| `plan.criterion.passed` | CheckRunner | `task`, `criterion`, `evidence_len` |
| `plan.criterion.failed` | CheckRunner | `task`, `criterion`, `exit_code?`, `evidence_snippet` (first 240 chars) |

### 9.4 Deploy-time bundling

Source imports `./lib/event-emitter` relatively. At deploy, each entry point is bundled into a single self-contained file via `bun build --compile --target=bun` (or equivalent). Deployed files have no `lib/` dependency directory — the project-local libs are inlined.

- `src/StateManager.ts` + its lib imports → single file at `~/.claude/PAI/Tools/StateManager.ts`
- `src/CheckRunner.ts` + its lib imports → single file at `~/.claude/PAI/Tools/CheckRunner.ts`
- `src/PlanGate.hook.ts` + `src/handlers/PlanGateHandler.ts` + their lib imports → single file at `~/.claude/hooks/PlanGate.hook.ts` (the handler is inlined, not separately deployed)

**Rationale for bundling over co-deployed `lib/`:** matches existing PAI/Tools/ pattern (Inference.ts, RemoveBg.ts, GetTranscript.ts are single files — no sibling `lib/` directory). Keeps deploy topology flat. No relative-path fragility across directories.

**Alternative if bundling proves fragile:** co-deploy a `~/.claude/PAI/Tools/lib/` directory with the four files, have the hook import via absolute path `~/.claude/PAI/Tools/lib/event-emitter`. Slightly less clean but mechanically simpler. Implementer chooses.

### 9.5 Migration path if PAI eventually ships `appendEvent()`

Per D5 rationale, the no-suffix library naming is designed to make this a rename:

```ts
// Before (project-local):
import { appendEvent } from './lib/event-emitter';
appendEvent({ type: 'plan.gate.blocked', ... });

// After (PAI upstream):
import { appendEvent } from '~/.claude/hooks/lib/event-emitter';
appendEvent({ type: 'plan.gate.blocked', ... });
```

`event-types.ts` becomes redundant (types come from the upstream equivalent) and is deleted. `event-emitter.ts` likewise deleted. The log destination migrates from `<project>/.plan-executor/events.jsonl` to `~/.claude/MEMORY/STATE/events.jsonl` (the documented unified log) — one config change in the emitter, not a structural refactor.

---

## 10. Anti-patterns (NOT This)

1. **NOT This: allow the AI to edit `validation.json` directly** — breaks state-integrity. State is mutated only via `StateManager update-criterion` / `advance-task`. PlanGate explicitly blocks writes whose target path resolves to `validation_path`.
2. **NOT This: compute plan_checksum over the prose plan** — the prose plan is documentation and must be editable without breaking enforcement. Checksum is over the criteria structure inside validation.json (§8.1).
3. **NOT This: skip plan_checksum validation on read** — even if the file parses, a structure mismatch signals tampering. Every `readState` recomputes and compares.
4. **NOT This: fail-open on malformed state inside PlanGate** — fail-open applies to *missing pointer* / *absent plan*, not to corrupted state. If the pointer exists but the state is malformed, the hook must BLOCK with `reason_code: "state_malformed"` and fix-guidance message. Silently allowing would undo the entire enforcement.
5. **NOT This: env-var secrets for the allow-list** (D2) — threat model is my-own-AI-under-context-pressure, not adversary. A secret would add operational burden without strengthening the property this project needs. Allow-list is realpath-match + file-existence check.
6. **NOT This: call StateManager CLI from CheckRunner via subprocess** — they co-locate in `~/.claude/PAI/Tools/`. CheckRunner imports StateManager's programmatic API directly (§5). Subprocess would double parsing cost and lose exception type information.
7. **NOT This: write state without atomic rename** (D9) — every write is temp-file-in-same-directory + fsync + rename. No file locking (single-writer discipline). Partial writes must never be observable by a concurrent reader.
8. **NOT This: let PlanGate do its own stdin parsing** (D3) — use `readHookInput()` from `hooks/lib/hook-io.ts`. Matches the existing hook ecosystem and inherits the 500 ms timeout and JSON parsing.
9. **NOT This: put CheckRunner's manual-prompt logic in StateManager** — StateManager is a pure state CLI; it does not know about prompts. Manual-criterion UX (D10) lives entirely in CheckRunner.
10. **NOT This: use exit code 0 for FAIL in CheckRunner** — exit 0 is reserved for "all criteria PASS and task advanced." FAIL is exit 1. This lets callers script `CheckRunner run --task X && git commit ...` with correct semantics.
11. **NOT This: ship without `--help` on every CLI entry** — per `CLIFIRSTARCHITECTURE.md` §Progressive Disclosure and §Error Handling, both CLIs expose `--help` at top level and per-subcommand. Non-optional for usability.
12. **NOT This: gate normal skill invocations** (per architecture-a §Scope boundary) — PlanGate only matters when a validation.json pointer is active. Invoking the Presentations skill or any other tool without an active plan passes freely.

---

## 11. `PAI/TOOLS.md` additions

Two new entries, inserted in the same format as the existing `Inference.ts`, `GetTranscript.ts`, `RemoveBg.ts` sections.

### 11.1 StateManager.ts entry (verbatim insert)

```markdown
## StateManager.ts - Plan-Execution State File Manager

**Location:** `~/.claude/PAI/Tools/StateManager.ts`

Sole-writer CLI and programmatic API for the Plan Executor Tools's `validation.json` state file. Reads are open; writes are atomic (temp-file + rename). Plan-checksum validated on every read.

**Usage:**
```bash
# Initialise a hand-authored validation.json (compute + stamp plan_checksum)
bun ~/.claude/PAI/Tools/StateManager.ts init --path ./validation.json

# Read full state (pretty-printed) or a specific task/phase/criterion
bun ~/.claude/PAI/Tools/StateManager.ts read --path ./validation.json
bun ~/.claude/PAI/Tools/StateManager.ts read --task 2.1 --path ./validation.json

# Flip a criterion result (called by CheckRunner; orchestrator generally does not call this directly)
bun ~/.claude/PAI/Tools/StateManager.ts update-criterion \
  --task 2.1 --criterion 3 --status PASS --evidence "PASS" --path ./validation.json

# Advance a task to PASS when all its criteria are PASS
bun ~/.claude/PAI/Tools/StateManager.ts advance-task --task 2.1 --path ./validation.json

# Human-readable dump
bun ~/.claude/PAI/Tools/StateManager.ts show --path ./validation.json
bun ~/.claude/PAI/Tools/StateManager.ts show --phase 2 --path ./validation.json

# Schema check (no mutation)
bun ~/.claude/PAI/Tools/StateManager.ts validate --path ./validation.json

# Recompute plan_checksum (no mutation)
bun ~/.claude/PAI/Tools/StateManager.ts checksum --path ./validation.json
```

**Global flags:** `--json`, `--verbose`, `--help`, `--path <file>`.

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error or precondition violation (e.g. advance-task with incomplete criteria) |
| 2 | System error (I/O, malformed JSON) |
| 3 | plan_checksum mismatch — state compromised |

**Programmatic Usage:**
```typescript
import {
  readState, writeState, initState,
  updateCriterion, advanceTask, findCurrentCriterion,
  computePlanChecksum,
  SchemaError, ChecksumError, TargetNotFoundError, PreconditionError, IOError,
} from '../PAI/Tools/StateManager';

const state = readState('./validation.json');       // throws ChecksumError on mismatch
const next = updateCriterion(state, '2.1', '3', 'PASS', 'PASS');
writeState('./validation.json', next);              // atomic
```

**When to Use:**
- Orchestrator hand-authors validation.json, then runs `init` once.
- CheckRunner calls the programmatic API; Drew and orchestrator use the CLI for inspection, recovery, and dry-running.
- Never edit validation.json by hand after init — use the CLI.

**Technical Details:**
- Atomic writes (temp-file + fsync + rename in same directory).
- Unknown top-level or nested fields are preserved across writes (schema forward-compatibility).
- Plan-checksum is SHA256 over the sorted criteria structure — not the prose plan.
- Emits `plan.task.advanced` via `appendEvent()` (to `<project>/.plan-executor/events.jsonl` per D5) on task advancement.
```

### 11.2 CheckRunner.ts entry (verbatim insert)

```markdown
## CheckRunner.ts - Plan-Execution Check Runner

**Location:** `~/.claude/PAI/Tools/CheckRunner.ts`

Deterministic runner for the Plan Executor Tools. Given a task id (or the current task), evaluates each criterion, updates state via StateManager, and auto-advances the task when all criteria PASS.

**Usage:**
```bash
# Run current task's criteria
bun ~/.claude/PAI/Tools/CheckRunner.ts run --path ./validation.json

# Run a specific task (useful for retries after a fix)
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --path ./validation.json

# Evaluate without writing state
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --dry-run --path ./validation.json

# JSON output for scripting / orchestrator consumption
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1 --json --path ./validation.json

# Manual-criterion strategy: stdin (default) or askuser
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 --manual-prompt-strategy stdin --path ./validation.json
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 --manual-prompt-strategy askuser --path ./validation.json

# Resume after askuser exit-4 by supplying the answer
bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.2 --manual-prompt-strategy askuser --answer "Yes, reviewed and approved." --path ./validation.json
```

**Global flags:** `--json`, `--verbose`, `--help`.

**`run`-specific flags:** `--task <id>`, `--dry-run`, `--manual-prompt-strategy stdin|askuser`, `--answer <response>`, `--path <file>`.

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | All criteria PASS; task advanced |
| 1 | One or more criteria FAILED (stderr lists which) |
| 2 | System error (criterion command timeout, state write failure) |
| 3 | plan_checksum mismatch — state compromised |
| 4 | Manual criterion needs AskUserQuestion (stderr has structured payload; re-invoke with `--answer`) |

**When to Use:**
- After each file change during plan execution, to verify the current task's criteria.
- As the gateway to task advancement — AI must run this to unblock the PlanGate hook.
- `--dry-run` for pre-flight checks and test authoring.

**Technical Details:**
- Criterion commands run via `bash -c`, 30 s default timeout (override with `CHECKRUNNER_TIMEOUT_MS`).
- `PASS` / `FAIL` must be on the last non-empty line of stdout; everything else becomes evidence.
- Calls StateManager programmatic API directly (same process, no subprocess overhead).
- Emits `plan.criterion.passed` / `plan.criterion.failed` per criterion via `appendEvent()` (to `<project>/.plan-executor/events.jsonl` per D5).
- `askuser` strategy exits 4 at the first manual criterion with a structured stderr payload; orchestrator must re-invoke with `--answer <response>` to resume.
```

---

## 12. Testing approach (scope for Phase-3 test plan)

Not the full test plan. This section only scopes what Tier A unit tests and Tier B integration tests must cover. Phase 3 writes the concrete cases.

### 12.1 Tier A unit — testable without a live validation.json

Pure functions and isolated logic, exercised with in-memory fixtures. Target: every exported function in §5 (StateManager API), plus pure helpers in PlanGateHandler and CheckRunner.

**StateManager pure surface:**
- `computePlanChecksum` — determinism (same input → same hex), ordering-stability (reordering phases/tasks/criteria in the input yields the same output), sensitivity (changing a criterion's `command` by one char flips the hex).
- `updateCriterion` — PASS path, FAIL path, parent-task transition PENDING → IN_PROGRESS, fix_attempts increment on FAIL, `TargetNotFoundError` on unknown task/criterion.
- `advanceTask` — happy path (all criteria PASS), precondition failure (`PreconditionError` with list of non-PASS criterion ids), phase rollover, plan completion (last task of last phase → top-level `status: "COMPLETED"`).
- `findCurrentCriterion` — current task resolution, returns null criterion when task has no PENDING criteria, returns correct phase id across a rollover.
- Schema-validation logic in `validate` — required-field detection, enum-mismatch detection, `type`/`command` vs `type`/`prompt` consistency, `current_task`-in-`current_phase` check.
- Unknown-field preservation on write (D11) — round-trip a document with an unrecognised field on a criterion object; verify it survives `updateCriterion` + `writeState`.

**CheckRunner pure surface:**
- Stdout classification (`PASS` on last line → PASS; `FAIL` on last line → FAIL; no PASS/FAIL marker + exit 0 → FAIL with `no_marker`).
- Evidence extraction (multi-line stdout, trimming rules).
- Manual-prompt stdin path (empty input → FAIL, non-empty → PASS with evidence).
- Exit-4 payload shape for askuser strategy.
- `--dry-run` non-mutation property (before/after state identical).

**PlanGateHandler pure surface:**
- Decision table: for every combination of { tool ∈ {Bash,Edit,Write} } × { task.status ∈ {PENDING,IN_PROGRESS,PASS} } × { target_path ∈ {validation.json, other in-project, out-of-project, StateManager.ts, CheckRunner.ts} }, assert the expected decision.
- Bash command tokenisation — StateManager/CheckRunner invocation detection must handle quoted arguments, shell continuations, absolute and `~`-relative paths.
- `reason_code` assignment: `"state_file_write_attempt"` vs `"task_not_pass"` vs `"checksum_drift"`.

### 12.2 Tier B integration — full flows exercised

Against a real on-disk validation.json (fixture), a real PAI/Tools layout (under a temp `HOME` if needed), and real subprocess invocation.

**Flow 1: happy-path execution of a multi-task phase**
- Initialise a fixture validation.json with 2 tasks × 3 automated criteria each.
- Invoke StateManager init.
- For each task: run `CheckRunner run --task N` → all PASS → task advances → next task becomes current.
- Verify `current_task` progression, `verified_at` stamps, `phases.*.status` transitions, and the emitted event stream (tail of `events.jsonl` during the run should contain exactly the expected `plan.criterion.*` + `plan.task.advanced` sequence).

**Flow 2: red-then-green fix cycle**
- Task with one intentionally failing criterion.
- CheckRunner run → 1 FAIL → `fix_attempts: 1`, task stays IN_PROGRESS.
- Modify the criterion's target so the command now passes.
- CheckRunner run again → PASS → task advances.

**Flow 3: PlanGate enforcement in-band**
- Pointer file written; fixture validation.json active.
- Simulated hook stdin (JSON on stdin to PlanGate.hook.ts invoked as subprocess):
  - Write to validation.json → BLOCK with `reason_code: "state_file_write_attempt"`.
  - Bash `echo hi` with current task PENDING → BLOCK with `reason_code: "task_not_pass"`.
  - Bash `bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1` with current task PENDING → ALLOW.
  - Edit an in-project source file with current task at PASS → ALLOW.
- Verify the block stdout shape matches §7.5 and event emission matches §7.6.

**Flow 4: manual criterion under stdin strategy**
- Fixture with one manual criterion.
- Pipe an answer into CheckRunner via stdin.
- Verify criterion PASSES, evidence contains the answer, task advances.

**Flow 5: manual criterion under askuser strategy**
- Same fixture.
- Run with `--manual-prompt-strategy askuser` → exit 4.
- Parse structured stderr JSON.
- Re-invoke with `--answer "yes"` → exit 0 (if it was the only manual criterion) or exit 4 again (if more manuals follow).

**Flow 6: plan_checksum drift**
- Init, then manually edit the fixture to change a criterion's `command` field.
- StateManager read → exit 3 + ChecksumError.
- CheckRunner run → exit 3 (surfaces as ChecksumError from readState).
- PlanGate on Bash → BLOCK with `reason_code: "checksum_drift"`.

**Flow 7: atomic-write crash simulation**
- Use a fault-injection wrapper on the write path to fail *between* temp-write and rename.
- Verify the on-disk validation.json is still the pre-update version (no partial state).

### 12.3 Out of Tier A/B for this project

- Concurrency (single-writer discipline per D9; no concurrent-writer tests).
- Cross-session behaviour (pointer-file lifecycle across SessionEnd is documented but not tested in scope; SessionEnd hook integration is Phase-2 scope).
- Performance benchmarks (per architecture-a "sub-10ms per check" target — not formally gated in scope).

---

## 13. Deferred scope

Architecture-A components that are **not** in this project. Each is listed with a one-line "when to revisit" note so a future session can decide whether to fold it in.

- **PlanParser.ts** — parse a prose plan into validation.json. Revisit when hand-authoring validation.json becomes a pain point (post-2-3 plans). This project proves the enforcement kernel; authoring is manual.
- **CheckGenerator.ts** — map criteria to recipe templates and emit executable scripts. Revisit alongside Recipes YAML (same iteration).
- **Recipes YAML** (Filesystem.yaml, Coding.yaml, Deployment.yaml) — parameterised check templates. Revisit when the same command pattern appears across ≥3 plans and hand-writing shell commands becomes tedious.
- **PlanAutoVerify hook** — PostToolUse hook that auto-triggers CheckRunner on file changes. Revisit once real-world friction data shows "AI forgot to run CheckRunner" is a recurring failure. This project requires manual CheckRunner invocation; PlanGate surfaces the reminder on every blocked call.
- **PlanRecorder hook** — append-only forensic log of every tool call during plan execution. Revisit if a plan execution goes sideways and post-mortem requires more than `events.jsonl` provides. The unified event stream may already be sufficient.
- **`_PLANEXECUTOR` skill** — routing surface with Create/Execute/Fix/Status workflows. Revisit when there are ≥3 CLI entry points worth bundling under a single conversational surface. this project ships no skill wrapper (D1).
- **Create workflow** — author plans via Architect + Plan agents. Revisit once PlanParser exists (depends on parser to validate authored plans).
- **Execute workflow** — initialise state, register hooks, display current task. Revisit when `_PLANEXECUTOR` skill is created. In scope, these steps are executed by Drew manually (hand-author validation.json, run StateManager init, ensure hook is deployed).
- **Fix workflow** — structured retry cycle with 3-strikes escalation. Revisit alongside PlanAutoVerify (they co-deploy). In scope, the fix cycle is: CheckRunner FAILs → AI reads evidence → AI fixes → CheckRunner again. No automated three-strikes escalation; Drew handles judgement.
- **Status workflow** — surface current plan state to the AI at session resume. Revisit when session-resume friction surfaces (AI doesn't notice the plan is active). This project surfaces it via the pointer file + the hook's block-message.
- **Per-task tool allow-lists** (architecture-a §Note 2026-04-21 additional requirements #4) — declare which tools each task may use. Revisit after 1–2 plans' worth of real execution data shows whether "allow within project root" is too permissive.
- **Subagent briefing infrastructure** (architecture-a §Note 2026-04-21 #1) — template the "current task, CheckRunner protocol" block that every delegation spec must include. Revisit in Phase-2 requirements when orchestrator delegates the requirements-document drafting to an Architect subagent.
- **`--force-reinit` on StateManager init** — allow re-initialising plan_checksum after a deliberate plan edit. Revisit only if checksum drift without tampering becomes a recurring workflow (currently Drew can always restore from git; adding the flag prematurely weakens the tamper-detection).

---

## Appendix A — Cross-document traceability

This design doc is referenced by, and references, the following canonical sources. Any inconsistency between this doc and them should be resolved in favour of the canonical source (then this doc updated).

| Canonical source | Role |
|---|---|
| `~/.claude/PAI/CLIFIRSTARCHITECTURE.md` | CLI patterns (§CLI Design Best Practices, §Configuration Flags, §Error Handling). D4 Tier-1 baseline. |
| `~/.claude/PAI/TOOLS.md` | Target format for §11 (Inference.ts/GetTranscript.ts/RemoveBg.ts as exemplars). |
| `~/.claude/PAI/THEHOOKSYSTEM.md` | Hook stdin contract, matchers, multi-hook execution order, event emitter, graceful-failure pattern. |
| `~/.claude/skills/Utilities/CreateCLI/SKILL.md` | Tier-1 characteristics (Bun + TypeScript, ~300–400 lines, manual argv, README + QUICKSTART). |
| `~/projects/dev/dev-tools/projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md` | Parent architecture. Bypass-vector, failure-mode, and scope-boundary discussion. |
| `~/projects/dev/dev-sor/agentics-dev/skills-dev/presentations-skill-dev/validation.json` | Live example of the JSON schema in §3. |
| `~/.claude/hooks/lib/hook-io.ts` | Source of `readHookInput()` imported by PlanGate.hook.ts. |
| `~/projects/dev/dev-tools/agentics-dev/hooks-dev/md-list-guard-hook-dev/src/MdListGuard.hook.ts` | PostToolUse example; the closest extant implementation of the handler-delegate pattern (D3). |

---

**End of design.**
