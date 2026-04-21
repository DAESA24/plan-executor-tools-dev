---
Status: Draft (Phase 2.1 output — pending Architect/Opus hardening in Phase 2.2)
Created: 2026-04-21
Owner: Drew Arnold
Related:
  - docs/design.md — detailed design (primary source)
  - docs/decisions.md — D1–D13 binding decisions
  - implementation-plan.md — phased build plan
  - ~/projects/dev/dev-tools/projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md — parent architectural spec
  - ~/.claude/PAI/CLIFIRSTARCHITECTURE.md — CLI-First pattern (grounds TR-3.*)
  - ~/.claude/PAI/TOOLS.md — PAI tool deployment convention (grounds TR-1.*, TR-9.*)
  - ~/.claude/PAI/THEHOOKSYSTEM.md — hook conventions (grounds TR-6.*)
Supersedes: none
---

# Plan Executor Tools — Requirements (BRD + FRD + TRD)

Atomic, ID'd, independently testable requirements derived mechanically from `docs/design.md` and `docs/decisions.md`. Every requirement has a direct design-doc or decision-log anchor (cited inline). Every requirement is expected to yield ≥1 entry in the Phase 3 test plan (`docs/test-plan.md`).

Conventions:
- `BR-N` — Business Requirements (what this enables at the user / system level)
- `FR-N.N` — Functional Requirements (what components do, grouped by component)
- `TR-N.N` — Technical Requirements (how, implementation constraints)
- `AR-N` — Anti-Requirements (what must **not** happen; maps to design.md §10 and D-rationales)

Scope boundary is `architecture-a-gate-keeper.md` "Note — 2026-04-21" block: the enforcement kernel only. Authoring / recipes / auto-verify / forensic-recorder are explicitly deferred (see `docs/design.md` §13).

---

## Business Requirements

- BR-1: Enforce deterministic plan execution so an AI cannot claim a task PASS without verifying each criterion. (design.md §1; parent spec §Failure Mode Analysis)
- BR-2: Block file mutations (Write / Edit / Bash) until the current task shows PASS, preventing the "skip verification" failure mode. (design.md §1, §7.1)
- BR-3: Detect tampering of `validation.json`'s criteria structure via a plan checksum validated on every read. (D8; design.md §8)
- BR-4: Maintain `validation.json` as the single source of truth for plan state, writable only through a sole-writer CLI. (D1; design.md §1)
- BR-5: Allow-list the verification tools (CheckRunner, StateManager) so the enforcement system can make forward progress without deadlocking itself. (D2; design.md §7.4)
- BR-6: Emit a project-local, append-only event log at `<project-root>/.plan-executor/events.jsonl` so every execution run is post-mortem-reviewable. (D5; design.md §9.3)
- BR-7: Ship no skill wrapper — these three artifacts are tools per PAI's CLI-First architecture, not a skill. (D1; TOOLS.md "Don't create a separate skill if the entire functionality is just a CLI command")
- BR-8: Apply enforcement session-wide (main agent and all subagents equally) via `settings.json` hook registration. (design.md §2.2; parent spec §Subagent coverage)
- BR-9: Gate only active-plan sessions — when no `validation.json` pointer is active, every tool call passes freely (fail-open for no-plan). (design.md §7.3, §10 #12)
- BR-10: Bootstrap via manual discipline — this project cannot enforce its own construction (chicken-and-egg); once deployed, every subsequent plan runs under hook enforcement. (implementation-plan.md "Task Validation Protocol"; README.md "Execution mode")
- BR-11: Preserve unknown fields on write so future plans that add fields (e.g., `iteration_count`) don't lose data when processed by the current StateManager. (D11; design.md §3.5)
- BR-12: Maintain strict separation between security-layer checks (SecurityValidator) and plan-execution-layer checks (PlanGate) — PlanGate adds to, never replaces, SecurityValidator. (D12; design.md §2.2, §7.7)
- BR-13: Support both interactive and delegated manual-criterion workflows via two prompt strategies (`stdin`, `askuser`) so CheckRunner composes in both terminal and subagent contexts. (D10; design.md §6.3)

---

## Functional Requirements

### FR-1: StateManager CLI (7 subcommands + programmatic API)

- FR-1.1: `init` computes the plan checksum and stamps `initialized` (ISO-8601 UTC) on the state file. (design.md §4.1)
- FR-1.2: `init` is idempotent — rerunning after `plan_checksum` is set is a no-op success when the recomputed checksum matches. (design.md §4.1)
- FR-1.3: `init` errors with `E_CHECKSUM_DRIFT` when rerun and the criteria structure has changed since first init. (design.md §4.1)
- FR-1.4: `read` returns a read-only projection of the state file without mutation. (design.md §4.2)
- FR-1.5: `read --task <id>` returns the full Task object as JSON. (design.md §4.2)
- FR-1.6: `read --phase <id>` returns the full Phase object as JSON. (design.md §4.2)
- FR-1.7: `read --criterion <taskId:critId>` returns the Criterion object wrapped with its enclosing phase id and task id. (design.md §4.2)
- FR-1.8: `read` validates `plan_checksum` on every invocation and exits 3 on mismatch. (design.md §4.2, §8.2)
- FR-1.9: `update-criterion --status PASS|FAIL` flips the target criterion's status atomically. (design.md §4.3)
- FR-1.10: `update-criterion` transitions the parent task from `PENDING` to `IN_PROGRESS` on first criterion update. (design.md §4.3)
- FR-1.11: `update-criterion` increments `fix_attempts` on the parent task when `--status FAIL`. (design.md §4.3)
- FR-1.12: `update-criterion --evidence -` reads evidence from stdin (supports multi-line capture). (design.md §4.3)
- FR-1.13: `update-criterion` errors with `E_TARGET_NOT_FOUND` when the task/criterion id does not resolve. (design.md §4.3)
- FR-1.14: `update-criterion` errors with `E_INVALID_STATUS` when `--status` is not `PASS` or `FAIL`. (design.md §4.3)
- FR-1.15: `advance-task` flips the target task to `PASS` iff every criterion is `PASS`. (design.md §4.4)
- FR-1.16: `advance-task` stamps `verified_at` on the task at the moment it flips to `PASS`. (design.md §4.4)
- FR-1.17: `advance-task` advances `current_task` to the next task in the phase (numeric-key order). (design.md §4.4)
- FR-1.18: `advance-task` rolls over to the first task of the next phase at phase boundaries. (design.md §4.4)
- FR-1.19: `advance-task` increments `current_phase` on phase rollover. (design.md §4.4)
- FR-1.20: `advance-task` flips top-level `status` to `COMPLETED` when the last phase's last task is advanced. (design.md §4.4)
- FR-1.21: `advance-task` errors with `E_CRITERIA_INCOMPLETE` (exit 1) when one or more criteria are not `PASS`; payload names the non-PASS criterion ids. (design.md §4.4)
- FR-1.22: `show` renders a phase tree with `✓` / `✗` / `…` icons. (design.md §4.5)
- FR-1.23: `show --phase <id>` renders a specific phase; without flag, renders `current_phase`. (design.md §4.5)
- FR-1.24: `validate` performs a non-mutating schema check (required fields, enum values, criterion-type consistency, `current_task` resolves within `current_phase`). (design.md §4.6)
- FR-1.25: `checksum` emits the recomputed plan checksum without writing. (design.md §4.7)
- FR-1.26: Every subcommand supports `--help` that prints synopsis, flags, and purpose. (design.md §4.8; TR-3.4)
- FR-1.27: Top-level `StateManager --help` lists every subcommand. (design.md §4.8)
- FR-1.28: StateManager exports a programmatic API: `readState`, `writeState`, `initState`, `computePlanChecksum`, `updateCriterion`, `advanceTask`, `findCurrentCriterion`, plus error classes (`StateManagerError`, `SchemaError`, `ChecksumError`, `TargetNotFoundError`, `PreconditionError`, `IOError`). (design.md §5)
- FR-1.29: Programmatic transform functions (`updateCriterion`, `advanceTask`) are pure — no disk I/O, no mutation of the input state. (design.md §5 "Contract notes")
- FR-1.30: State writes preserve unknown top-level and nested fields across the read-merge-write cycle. (D11; design.md §3.5)
- FR-1.31: Every subcommand supports `--path <file>` defaulting to `./validation.json`. (design.md §4 preamble)

### FR-2: CheckRunner CLI (`run` subcommand)

- FR-2.1: `run` without `--task` resolves the target task via `findCurrentCriterion` on the loaded state. (design.md §6.1)
- FR-2.2: `run --task <id>` targets an explicit task, overriding `current_task`. (design.md §6.1)
- FR-2.3: `run` iterates the target task's criteria in numeric-id order. (design.md §6.1)
- FR-2.4: Automated criteria execute `bash -c "<criterion.command>"`. (design.md §6.2 step 2)
- FR-2.5: Automated-criterion default timeout is 30 seconds. (design.md §6.2 step 2)
- FR-2.6: Automated-criterion timeout is overridable via the `CHECKRUNNER_TIMEOUT_MS` env var. (design.md §6.2 step 2)
- FR-2.7: Automated-criterion PASS detection — the last non-empty stdout line equals `PASS` AND exit code is 0. (design.md §6.2 step 4)
- FR-2.8: Automated-criterion FAIL detection — the last non-empty stdout line equals `FAIL` OR exit code is non-zero. (design.md §6.2 step 4)
- FR-2.9: Automated-criterion timeout records FAIL with evidence `TIMEOUT after Nms`. (design.md §6.2 step 4)
- FR-2.10: Automated-criterion PASS evidence is the captured stdout (trimmed). (design.md §6.2 step 4)
- FR-2.11: Automated-criterion FAIL evidence is `exit_code=N\nstdout=...\nstderr=...`. (design.md §6.2 step 4)
- FR-2.12: Manual-criterion strategy defaults to `stdin` when `--manual-prompt-strategy` is not provided. (D10; design.md §6.3)
- FR-2.13: Under `stdin` strategy, CheckRunner prints `MANUAL: <prompt>` to stdout on its own line. (design.md §6.3)
- FR-2.14: Under `stdin` strategy, an empty answer line records FAIL with evidence `no answer provided`. (design.md §6.3)
- FR-2.15: Under `stdin` strategy, a non-empty answer line records PASS with the line as evidence. (design.md §6.3)
- FR-2.16: Under `askuser` strategy, the first pending manual criterion aborts the run with exit code 4. (design.md §6.3, §6.4)
- FR-2.17: The `askuser` exit-4 stderr payload is a JSON object with keys `exit_reason`, `task`, `criterion`, `prompt`, `resume_command`. (design.md §6.3)
- FR-2.18: `--answer <response>` supplies the answer to the exact criterion that caused the prior exit-4, then the run continues into remaining criteria. (design.md §6.3)
- FR-2.19: `--dry-run` evaluates automated criteria without calling `updateCriterion` or `advanceTask`. (design.md §6.1, §6.6)
- FR-2.20: `--dry-run` reports manual criteria as `would prompt: <prompt>` without reading stdin or emitting exit 4. (design.md §6.1)
- FR-2.21: `--dry-run` prefixes default stdout with `[DRY RUN — state file not modified]`. (design.md §6.6)
- FR-2.22: When every criterion of the target task ends `PASS`, CheckRunner calls `advanceTask` before exiting. (design.md §6.1)
- FR-2.23: `run` exits 0 when every criterion ends PASS AND the task was advanced. (D7; design.md §6.4)
- FR-2.24: `run` exits 1 when one or more criteria ended FAIL (stderr lists which). (D7; design.md §6.4)
- FR-2.25: `run` exits 2 on system error (timeout bubble-up, StateManager write failure, malformed state). (D7; design.md §6.4)
- FR-2.26: `run` exits 3 on `plan_checksum` mismatch. (D7; design.md §6.4)
- FR-2.27: `--json` emits a structured result object per design.md §6.5. (design.md §6.5)
- FR-2.28: CheckRunner imports StateManager's programmatic API directly (no subprocess). (design.md §10 #6)

### FR-3: PlanGate PreToolUse hook

- FR-3.1: PlanGate fires on the PreToolUse event for the `Bash`, `Edit`, and `Write` matchers. (D12; design.md §2.2)
- FR-3.2: PlanGate reads stdin via `readHookInput()` imported from `~/.claude/hooks/lib/hook-io.ts`. (D3; design.md §9.1)
- FR-3.3: When the active-plan pointer file (`~/.claude/MEMORY/STATE/plan-executor.active.json`) is absent, PlanGate returns ALLOW silently. (design.md §7.3)
- FR-3.4: When the active-plan pointer exists but `validation_path` does not resolve, PlanGate returns ALLOW and logs a `hook.error` event (fail-open for pointer staleness). (design.md §7.3)
- FR-3.5: When an active plan targets `validation.json` (via Write or Edit at the plan's state-file path), PlanGate BLOCKS with `reason_code: "state_file_write_attempt"`. (design.md §7.4 step 2)
- FR-3.6: When an active plan is present and a Bash command's resolved tokens include the realpath of StateManager, PlanGate ALLOWS. (D2; design.md §7.4 step 3)
- FR-3.7: When an active plan is present and a Bash command's resolved tokens include the realpath of CheckRunner, PlanGate ALLOWS. (D2; design.md §7.4 step 3)
- FR-3.8: When an active plan is present and `current_task.status` is not `PASS`, PlanGate BLOCKS Bash calls (other than allow-listed) with `reason_code: "task_not_pass"`. (design.md §7.4 step 3)
- FR-3.9: When an active plan is present and `current_task.status` is not `PASS`, PlanGate BLOCKS Edit/Write calls with `reason_code: "task_not_pass"`. (design.md §7.4 step 3)
- FR-3.10: When an active plan is present and `current_task.status` is `PASS`, PlanGate ALLOWS Bash/Edit/Write. (design.md §7.4 step 3)
- FR-3.11: When `readState` throws `ChecksumError`, PlanGate BLOCKS with `reason_code: "checksum_drift"`. (design.md §7.4 step 1, §8.3)
- FR-3.12: Block output is a JSON envelope `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` on stdout. (design.md §7.5)
- FR-3.13: Allow output is silent (no stdout). (design.md §7.5)
- FR-3.14: Block `permissionDecisionReason` names the failing task and includes the exact CheckRunner command to run next. (design.md §7.5)
- FR-3.15: The hook wrapper (`PlanGate.hook.ts`) delegates decision logic to a pure function `PlanGateHandler.decide(input)`. (D3; design.md §7.1)
- FR-3.16: `PlanGateHandler.decide` has no stdin reading, no `process.exit`, and no filesystem side effects other than calling `appendEvent()`. (D3; design.md §7.1)
- FR-3.17: When the active-plan pointer is present but the validation state is malformed, PlanGate BLOCKS (not fail-open) with a fix-guidance message. (design.md §10 anti-pattern #4)
- FR-3.18: PlanGate fails open on unexpected (unanticipated) exceptions, per hook graceful-failure convention. (design.md §7.1; THEHOOKSYSTEM.md §Graceful Failure)
- FR-3.19: PlanGate emits `plan.gate.allowed` events on every ALLOW decision via `appendEvent`. (D5; design.md §7.6)
- FR-3.20: PlanGate emits `plan.gate.blocked` events on every BLOCK decision with `reason_code` in `{"task_not_pass","state_file_write_attempt","checksum_drift"}`. (D5; design.md §7.6)
- FR-3.21: PlanGate exits 0 regardless of allow/block decision (block is signalled via `permissionDecision` content, not exit code). (design.md §7.5 "Schema verified 2026-04-21")

### FR-4: Plan checksum algorithm

- FR-4.1: The plan checksum is SHA-256 over a canonical JSON serialization of the criteria structure. (D8; design.md §8.1)
- FR-4.2: The checksum projection retains `check`, `type`, `command` (when `type == "automated"`), and `prompt` (when `type == "manual"`). (design.md §8.1 step 2)
- FR-4.3: The checksum projection drops `status`, `evidence`, `verified_at`, and `fix_attempts`. (design.md §8.1 step 2)
- FR-4.4: Canonical JSON uses stable-sorted object keys at every level. (design.md §8.1 step 3)
- FR-4.5: Canonical JSON contains no insignificant whitespace. (design.md §8.1 step 3)
- FR-4.6: Output format is `sha256:<lowercase-hex>`. (design.md §8.1 step 5)
- FR-4.7: Reordering phases, tasks, or criteria in the source JSON does not change the checksum (ordering stability property). (design.md §8.1, §12.1 "determinism")
- FR-4.8: Changing a single character of any `command` or `prompt` changes the checksum (sensitivity property). (design.md §12.1 "sensitivity")
- FR-4.9: The checksum is computed exactly once at `init` and recomputed on every `read` for comparison. (design.md §8.2)

### FR-5: Observability (event emitter)

- FR-5.1: Events are written to `<project-root>/.plan-executor/events.jsonl`, one JSON object per line. (D5 revised; design.md §9.3)
- FR-5.2: `<project-root>` is derived from the active-plan pointer's `validation_path` (its parent directory). (design.md §9.3)
- FR-5.3: `appendEvent(event)` auto-injects an ISO-8601 UTC `timestamp`. (design.md §9.3)
- FR-5.4: `appendEvent(event)` auto-injects a `session_id` from the `CLAUDE_SESSION_ID` env var, falling back to `"unknown"` when unset. (design.md §9.3)
- FR-5.5: Emitted event type `plan.gate.blocked` includes `tool`, `task`, `reason_code`, and optional `target_path`. (D5; design.md §9.3)
- FR-5.6: Emitted event type `plan.gate.allowed` includes `tool` and `task`. (design.md §9.3)
- FR-5.7: Emitted event type `plan.task.advanced` includes `from_task`, `to_task`, and optional `phase_rolled` / `plan_completed` flags. (design.md §9.3)
- FR-5.8: Emitted event type `plan.criterion.passed` includes `task`, `criterion`, `evidence_len`. (design.md §9.3)
- FR-5.9: Emitted event type `plan.criterion.failed` includes `task`, `criterion`, optional `exit_code`, and `evidence_snippet` (first 240 chars). (design.md §9.3)
- FR-5.10: `appendEvent` write errors are swallowed — observability never throws back to the host caller. (design.md §9.2 emitter row)
- FR-5.11: No events are written when no active-plan pointer is present. (design.md §9.3)

---

## Technical Requirements

### TR-1: Deployment topology (D1; TOOLS.md "Adding New Tools")

- TR-1.1: `StateManager.ts` deploys to `~/.claude/PAI/Tools/StateManager.ts`. (design.md §2.1)
- TR-1.2: `CheckRunner.ts` deploys to `~/.claude/PAI/Tools/CheckRunner.ts`. (design.md §2.1)
- TR-1.3: `PlanGate.hook.ts` deploys to `~/.claude/hooks/PlanGate.hook.ts`. (design.md §2.1)
- TR-1.4: Deployed filenames use Title-Case (e.g., `StateManager.ts`, not `state-manager.ts`). (design.md §2.1; TOOLS.md §Adding New Tools)
- TR-1.5: No subdirectories exist under `~/.claude/PAI/Tools/` at deploy time. (design.md §2.1; TOOLS.md)
- TR-1.6: `src/lib/*.ts` files are inlined into each consumer entry point at deploy (bundling). (D13; design.md §9.4)
- TR-1.7: `src/handlers/PlanGateHandler.ts` is inlined into `PlanGate.hook.ts` at deploy (not a separate file at deploy location). (design.md §2.1, §9.4)
- TR-1.8: Each deployed file is executable (`chmod +x`). (design.md §2.3 step 1; implementation-plan.md Tasks 8.1, 8.2)
- TR-1.9: Each deployed CLI responds to `--help` after deploy (smoke test). (design.md §2.3 step 4)

### TR-2: `settings.json` registration (D12)

- TR-2.1: `PlanGate.hook.ts` appears as a PreToolUse hook on the `Bash` matcher. (design.md §2.2)
- TR-2.2: `PlanGate.hook.ts` appears as a PreToolUse hook on the `Edit` matcher. (design.md §2.2)
- TR-2.3: `PlanGate.hook.ts` appears as a PreToolUse hook on the `Write` matcher. (design.md §2.2)
- TR-2.4: On each of Bash / Edit / Write, `SecurityValidator.hook.ts` appears before `PlanGate.hook.ts` in the `hooks` array (sequential order). (D12; design.md §2.2, §7.7)
- TR-2.5: Existing `SecurityValidator.hook.ts` entries remain unchanged (PlanGate is added, not replacing). (D12; implementation-plan.md §Task 8.3)
- TR-2.6: Registration uses the `${PAI_DIR}/hooks/PlanGate.hook.ts` command template. (design.md §2.2)
- TR-2.7: Unrelated PreToolUse matchers (`Read`, `AskUserQuestion`, `Task`, `Skill`) remain unchanged. (design.md §2.2)
- TR-2.8: `settings.json` remains valid JSON after edit (parsable by `jq`). (implementation-plan.md §Task 8.3 criterion 1)

### TR-3: CLI conventions (D4, D6; CLIFIRSTARCHITECTURE.md)

- TR-3.1: Both CLIs use Tier 1 (manual argv parsing; zero framework dependencies). (D4)
- TR-3.2: Both CLIs support a top-level `--json` flag for machine output. (D6; design.md §4 preamble, §6 preamble)
- TR-3.3: Both CLIs support a top-level `--verbose` flag for debug logging. (D6)
- TR-3.4: Both CLIs support `--help` and `-h` at top level and per-subcommand. (design.md §4.8; AR-11)
- TR-3.5: CLI errors print `ERROR: <E_CODE>: <human message>` to stderr. (design.md §4.8)
- TR-3.6: With `--json`, errors also print a JSON object `{"ok":false,"error":"E_CODE","message":"..."}` to stdout. (design.md §4.8)

### TR-4: Exit codes (D7)

- TR-4.1: Exit code `0` signals success. (D7; design.md §4 preamble)
- TR-4.2: Exit code `1` signals user error or a check-FAIL result. (D7)
- TR-4.3: Exit code `2` signals system error (I/O, malformed JSON, timeout bubble-up). (D7)
- TR-4.4: Exit code `3` signals plan-checksum mismatch (reserved across all CLIs and the hook's block translation). (D7; design.md §8.3)
- TR-4.5: Exit code `4` is CheckRunner-only — signals a manual criterion needs `AskUserQuestion`. (D7; design.md §6.4)

### TR-5: Atomic write strategy (D9)

- TR-5.1: State writes follow the temp-file-plus-rename pattern (`validation.json.tmp` → `validation.json`). (D9; design.md §5 `writeState`)
- TR-5.2: The temp file is created in the same directory as the target (POSIX rename atomicity). (D9; design.md §5)
- TR-5.3: State writes do not use file locking (`flock`) — single-writer discipline is assumed. (D9)
- TR-5.4: `fsync` is called on the temp file before `rename`. (D9; design.md §5 `writeState`)
- TR-5.5: A partial write must never be observable by a concurrent reader. (design.md §10 anti-pattern #7)

### TR-6: Hook contract (D3; THEHOOKSYSTEM.md)

- TR-6.1: `PlanGate.hook.ts` imports `readHookInput` from `~/.claude/hooks/lib/hook-io.ts`. (D3; design.md §9.1)
- TR-6.2: `PlanGate.hook.ts` respects the 500 ms stdin-read timeout of `readHookInput`. (design.md §9.1; THEHOOKSYSTEM.md §Hook Input)
- TR-6.3: Block output is emitted as a single JSON object on stdout matching the `permissionDecision` schema. (design.md §7.5)
- TR-6.4: Allow output produces no stdout. (design.md §7.5)
- TR-6.5: The hook exits 0 regardless of allow/block decision (no exit-2-with-stderr pattern). (design.md §7.5)
- TR-6.6: The handler-delegate pattern matches PAI precedent (LastResponseCache, PRDSync, MdListGuard, VoiceCompletion, DocIntegrity). (D3; design.md §7.1)

### TR-7: Library layering (D13)

- TR-7.1: All four project-local library files live under `src/lib/` in the dev repo. (D13)
- TR-7.2: `src/lib/state-types.ts` contains only type definitions (zero runtime code). (D13; design.md §9.2)
- TR-7.3: `src/lib/event-types.ts` contains only type definitions (zero runtime code). (D13; design.md §9.2)
- TR-7.4: `src/lib/hook-types.ts` contains only type definitions (zero runtime code). (D13; design.md §9.2)
- TR-7.5: `src/lib/event-emitter.ts` contains the `appendEvent` runtime and imports types from `event-types.ts`. (D13; design.md §9.2)
- TR-7.6: `src/StateManager.ts` imports from `./lib/state-types`. (D13; implementation-plan.md Task 4.2 criterion 3)
- TR-7.7: `src/CheckRunner.ts` imports from `./lib/event-emitter` (which re-exports or imports event types). (D13; implementation-plan.md Task 5.2 criterion 3)
- TR-7.8: `src/PlanGate.hook.ts` or `src/handlers/PlanGateHandler.ts` imports from `./lib/hook-types`. (D13; implementation-plan.md Task 6.2 criterion 4)
- TR-7.9: Library file base names carry no suffix (no `-mvp`, no `-local`). (D13)

### TR-8: Allow-list logic (D2)

- TR-8.1: Bash allow-list match is `realpath(token) == realpath(deploy-path)` for StateManager and CheckRunner. (D2; design.md §7.4)
- TR-8.2: Realpath resolution resolves symlinks and `$HOME` / `~` expansions before comparison. (D2; design.md §7.4)
- TR-8.3: The resolved target file must exist on disk for the allow-list to match. (D2)
- TR-8.4: No environment-variable secrets are used for allow-list identification. (D2; design.md §10 anti-pattern #5)
- TR-8.5: Bash command tokenization handles quoted arguments and shell continuations. (design.md §12.1 PlanGateHandler pure surface)
- TR-8.6: A path is "under the project root" iff `realpath(target)` starts with `realpath(project_root_from_pointer) + "/"`. (design.md §7.4)

### TR-9: Documentation (TOOLS.md §Adding New Tools)

- TR-9.1: `~/.claude/PAI/TOOLS.md` receives a new `## StateManager.ts - ...` section. (design.md §11.1; implementation-plan.md Task 8.4)
- TR-9.2: `~/.claude/PAI/TOOLS.md` receives a new `## CheckRunner.ts - ...` section. (design.md §11.2; implementation-plan.md Task 8.4)
- TR-9.3: Each new section contains Location, Usage examples, When to Use, Environment Variables (if any), and Technical Details subsections (matching existing `Inference.ts` / `GetTranscript.ts` / `RemoveBg.ts` format). (TOOLS.md §Adding New Tools step 2)
- TR-9.4: `~/.claude/PAI/SKILL.md` indexes `TOOLS.md` in its documentation list. (TOOLS.md §Adding New Tools step 3; implementation-plan.md Task 8.4)
- TR-9.5: Each StateManager / CheckRunner section cites the `~/.claude/PAI/Tools/...` deployed absolute path. (design.md §11.1, §11.2)

### TR-10: Testing scope (no Tier C — D per design.md §12.3)

- TR-10.1: Tier A unit tests cover every exported function in §5 of design.md (StateManager API). (design.md §12.1)
- TR-10.2: Tier A unit tests cover CheckRunner's pure surface — stdout classification, evidence extraction, manual-prompt stdin path, `--dry-run` non-mutation, exit-4 payload shape. (design.md §12.1)
- TR-10.3: Tier A unit tests cover `PlanGateHandler.decide` decision table for every combination of `{tool, task.status, target_path}`. (design.md §12.1)
- TR-10.4: Tier A unit tests include unknown-field preservation across read-merge-write (D11). (design.md §12.1; D11)
- TR-10.5: Tier B integration tests cover happy-path multi-task phase advancement. (design.md §12.2 Flow 1)
- TR-10.6: Tier B integration tests cover red-then-green fix cycle. (design.md §12.2 Flow 2)
- TR-10.7: Tier B integration tests cover PlanGate block/allow decisions in-band (state-file write attempt, allow-list, task-PASS). (design.md §12.2 Flow 3)
- TR-10.8: Tier B integration tests cover manual criterion under `stdin` strategy. (design.md §12.2 Flow 4)
- TR-10.9: Tier B integration tests cover manual criterion under `askuser` strategy (exit-4 + `--answer` resume). (design.md §12.2 Flow 5)
- TR-10.10: Tier B integration tests cover `plan_checksum` drift detection across StateManager, CheckRunner, PlanGate. (design.md §12.2 Flow 6)
- TR-10.11: Tier B integration tests cover atomic-write crash simulation (fault injection between temp-write and rename). (design.md §12.2 Flow 7)
- TR-10.12: No Tier C tests — project is deterministic infrastructure with no LLM-based behavior to evaluate. (design.md §12.3; implementation-plan.md §Delegation Reference note)
- TR-10.13: Every FR and TR in this document maps to ≥1 test entry in the Phase 3 `docs/test-plan.md`. (implementation-plan.md Task 3.1 briefing)
- TR-10.14: Every AR in this document maps to ≥1 negative test in the Phase 3 `docs/test-plan.md`. (implementation-plan.md Task 3.1 criterion 4)

### TR-11: Runtime & tooling

- TR-11.1: Both CLIs and the hook run under Bun (TypeScript) with a `#!/usr/bin/env bun` shebang when executable. (design.md §2.3; TOOLS.md conventions — Inference.ts precedent)
- TR-11.2: `tsconfig.json` uses `strict: true`. (validation.json Task 1.1 criterion 3; scaffold confirmation)
- TR-11.3: `tsconfig.json` includes `bun-types`. (validation.json Task 1.1 criterion 3; scaffold confirmation)
- TR-11.4: Test runner is `bun test`. (README.md §Development Workflow; implementation-plan.md Phase 4+)

---

## Anti-Requirements

- AR-1: MUST NOT allow the AI to edit `validation.json` directly — PlanGate explicitly blocks writes whose target resolves to `validation_path`. (design.md §10 #1)
- AR-2: MUST NOT compute `plan_checksum` over the prose `implementation-plan.md`. (design.md §10 #2; D8)
- AR-3: MUST NOT skip `plan_checksum` validation on any `readState` call. (design.md §10 #3)
- AR-4: MUST NOT fail-open on malformed state when an active-plan pointer is present (fail-open applies only to the absent-pointer case). (design.md §10 #4)
- AR-5: MUST NOT use environment-variable secrets for the allow-list (D2 threat model). (design.md §10 #5)
- AR-6: MUST NOT call StateManager CLI from CheckRunner via subprocess (same-process programmatic API required). (design.md §10 #6)
- AR-7: MUST NOT write state without atomic rename (temp-file + fsync + rename required). (design.md §10 #7)
- AR-8: MUST NOT let `PlanGate.hook.ts` implement its own stdin parsing — must use `readHookInput()` from `hook-io.ts`. (design.md §10 #8; D3)
- AR-9: MUST NOT place manual-criterion prompt logic in StateManager — UX lives entirely in CheckRunner. (design.md §10 #9)
- AR-10: MUST NOT use exit code 0 for a FAIL result in CheckRunner (exit 0 is reserved for "all PASS + task advanced"). (design.md §10 #10)
- AR-11: MUST NOT ship any CLI without a working `--help` at top level and per-subcommand. (design.md §10 #11)
- AR-12: MUST NOT gate normal skill invocations (when no `validation.json` pointer is active, every tool call passes freely). (design.md §10 #12; BR-9)

---

## Requirements coverage table (by artifact)

| Artifact | BR | FR | TR | AR |
|---|---|---|---|---|
| StateManager.ts (CLI + API) | BR-1, BR-3, BR-4, BR-11 | FR-1.1–1.31, FR-4.*, FR-5.7 | TR-1.1, TR-1.4, TR-1.5, TR-1.6, TR-1.8, TR-1.9, TR-3.*, TR-4.1–4.4, TR-5.*, TR-7.1, TR-7.2, TR-7.6, TR-7.9, TR-11.1 | AR-1, AR-2, AR-3, AR-7, AR-11 |
| CheckRunner.ts (CLI) | BR-1, BR-13 | FR-2.*, FR-5.8, FR-5.9 | TR-1.2, TR-1.4, TR-1.5, TR-1.6, TR-1.8, TR-1.9, TR-3.*, TR-4.*, TR-7.1, TR-7.3, TR-7.5, TR-7.7, TR-7.9, TR-11.1 | AR-6, AR-9, AR-10, AR-11 |
| PlanGate.hook.ts + PlanGateHandler.ts | BR-2, BR-5, BR-8, BR-9, BR-12 | FR-3.*, FR-5.5, FR-5.6 | TR-1.3, TR-1.4, TR-1.7, TR-1.8, TR-2.*, TR-6.*, TR-7.1, TR-7.4, TR-7.8, TR-7.9, TR-8.*, TR-11.1 | AR-1, AR-4, AR-5, AR-8, AR-12 |
| Plan checksum (FR-4) | BR-3 | FR-4.* | — | AR-2, AR-3 |
| Event emitter (FR-5) | BR-6 | FR-5.* | TR-7.1, TR-7.3, TR-7.5, TR-7.9 | — |
| Deploy + docs | BR-7 | — | TR-1.*, TR-2.*, TR-9.* | — |
| Test coverage | BR-10 | — | TR-10.* | — |

---

## Hardening hand-off note (for Phase 2.2)

This document is a mechanical derivation of design.md + decisions.md. The Architect/Opus hardening pass in Phase 2.2 should focus on:

1. **Atomicity audit** — flag any requirement that bundles two independently testable assertions ("and" / "with" compound).
2. **Coverage gap audit** — identify any design.md section, decision rationale, or anti-pattern that lacks a corresponding BR / FR / TR / AR.
3. **Testability audit** — for each requirement, ask "can this be asserted as a binary PASS/FAIL by a single test case?" Split any that cannot.
4. **Consistency audit** — any ID collisions, missing cross-references, or ID gaps.
5. **Scope-drift audit** — flag any requirement that strays beyond the enforcement-kernel scope (design.md §1, §13).

Output file: `docs/requirements-hardened.md`. Architect must not edit `validation.json`; the orchestrator reviews the diff and decides PASS/FAIL.
