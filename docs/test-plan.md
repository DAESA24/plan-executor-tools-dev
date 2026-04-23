---
status: current
updated: 2026-04-23
---

# Plan Executor Tools — Test Plan (Tier A + Tier B)

Concrete test plan keyed to the FR / TR / AR IDs in `docs/requirements-hardened.md`. Every FR-X.X and TR-X.X is referenced in at least one test entry's `Verifies` field; every AR is covered by a dedicated negative test in §6. Tests are two-tier only (Tier A unit, Tier B integration). There is no Tier C.

---

## 1. Purpose & scope

This plan enumerates the executable test surface for the Plan Executor Tools project — the enforcement-kernel trio (`StateManager.ts`, `CheckRunner.ts`, `PlanGate.hook.ts`) defined in `docs/design.md`. Each test entry fixes a test file, one or more requirement IDs it verifies, a one-sentence scenario, and the fixtures it consumes. The plan is two-tier by design: Tier A unit tests (pure functions, in-memory fixtures) and Tier B integration tests (on-disk `validation.json`, subprocess CLI invocation, real hook stdin). **There are no Tier C (LLM-behavior) tests in this project — see AR-21 and `design.md` §12.3.** This project is deterministic infrastructure; there is no prompt-grounded behavior to evaluate with an LLM-based judge, so adding Tier C would be cost without benefit and is explicitly forbidden.

---

## 2. Conventions

**Test ID format:**

- **Tier A (unit):** `TA-<Component>-NNN` — e.g., `TA-StateManager-001`, `TA-CheckRunner-017`, `TA-PlanGate-042`, `TA-Checksum-009`, `TA-EventEmitter-005`.
- **Tier B (integration):** `TB-Flow<N>-NNN` — e.g., `TB-Flow1-003`. N ∈ {1..8}.
- **AR negative tests:** `TN-AR<N>-NNN` — e.g., `TN-AR12-001`. One test series per AR.

**Requirement-ID → Test-ID mapping:** every test entry has a `Verifies:` field listing the exact atomic requirement IDs it covers (sub-letters matter — `FR-1.1a`, not `FR-1.1`). A single test may cover multiple IDs when the assertions on one call naturally co-verify them (e.g., one PASS-path assertion that exercises `FR-2.7a` + `FR-2.7b` + `FR-2.7c` in a single subprocess run). The coverage matrix in §7 is the authoritative inverse index.

**Fixture naming:** fixtures live in `__tests__/fixtures/` (unit-scope) and `__tests__/integration/fixtures/` (integration-scope). Each fixture file has a descriptive kebab-case name (e.g., `canonical-2x2x2.json`, `validation-with-manual-criterion.json`, `pointer-stale.json`). Fixtures are listed once in §8 and referenced by name from test entries.

**File locations:** test files mirror `src/` layout. Unit tests live under `__tests__/<ComponentDir>/<function>.test.ts`. Integration tests live under `__tests__/integration/<flow>.test.ts`.

**`Fixtures: none`** means the test constructs its input literally inside the test body (typical for pure-function tests of `computePlanChecksum`, `decide`, etc.).

---

## 3. Tier A — Unit tests

Pure-function and component-local tests. Execute under `bun test` with no on-disk `validation.json`. In-memory or small filesystem fixtures only.

### 3.1 Tier A.1 — StateManager unit tests

Covers: FR-1.*, FR-4.* (checksum projection is exercised by StateManager entry points; dedicated checksum tests also live in §3.5), FR-5.* emission points that originate from StateManager (`plan.task.advanced`, pointer-delete `hook.error`), and the StateManager-side technical requirements TR-5.*, TR-7.2, TR-7.5, TR-7.6, TR-7.9, TR-10.1, TR-10.4.

#### `init` tests

- **TA-StateManager-001**
  - File: `__tests__/StateManager/init.test.ts`
  - Verifies: FR-1.1a, FR-1.1b, FR-1.1c, FR-1.28c
  - Description: Given a fresh canonical fixture (no `plan_checksum`, no `initialized`), `initState` computes the checksum, stamps `initialized` to a valid ISO-8601 UTC timestamp, and writes both fields in a single atomic rename (temp file never remains on disk after successful write).
  - Fixtures: `canonical-2x2x2.json`

- **TA-StateManager-002**
  - File: `__tests__/StateManager/init.test.ts`
  - Verifies: FR-1.2a, FR-1.2b, FR-1.32
  - Description: When `init` is invoked a second time on a file with a matching `plan_checksum` already present, the process exits 0, performs no disk write (mtime unchanged), and emits no `plan.*` events.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-003**
  - File: `__tests__/StateManager/init.test.ts`
  - Verifies: FR-1.3a, FR-1.3b
  - Description: When `init` is invoked on a file whose on-disk `plan_checksum` disagrees with the recomputed checksum (criteria structurally changed since first init), the process exits with `E_CHECKSUM_DRIFT` and the error payload names both the stored and the recomputed checksum strings.
  - Fixtures: `canonical-2x2x2-drifted.json`

- **TA-StateManager-004**
  - File: `__tests__/StateManager/init-pointer.test.ts`
  - Verifies: FR-1.38a, FR-1.38b, FR-1.38c, FR-1.38d, TR-5.8
  - Description: `init` writes `plan-executor.active.json` at `$HOME/.claude/MEMORY/STATE/`, creates the parent directory if absent, produces a payload with the four required keys (`validation_path`, `project`, `activated_at` ISO-8601 UTC, `session_id`), and the write goes through `plan-executor.active.json.tmp` → rename (the temp file briefly exists and is gone after rename).
  - Fixtures: `canonical-2x2x2.json` (temp `HOME` override per §9)

- **TA-StateManager-005**
  - File: `__tests__/StateManager/init-pointer.test.ts`
  - Verifies: FR-1.38b
  - Description: When `CLAUDE_SESSION_ID` is unset, the pointer's `session_id` field equals the literal string `"unknown"`; when set, it equals the env value.
  - Fixtures: `canonical-2x2x2.json`

#### `read` tests

- **TA-StateManager-006**
  - File: `__tests__/StateManager/read.test.ts`
  - Verifies: FR-1.4, FR-1.5
  - Description: `read --task 2.1` returns the full Task object as JSON on stdout, and the on-disk file mtime is unchanged (non-mutating).
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-007**
  - File: `__tests__/StateManager/read.test.ts`
  - Verifies: FR-1.6
  - Description: `read --phase 2` returns the full Phase object as JSON.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-008**
  - File: `__tests__/StateManager/read.test.ts`
  - Verifies: FR-1.7
  - Description: `read --criterion 2.1:3` returns an object with exactly the keys `phase`, `task`, `criterion`, `object`, where `object` is the Criterion and the first three are the enclosing ids.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-009**
  - File: `__tests__/StateManager/read.test.ts`
  - Verifies: FR-1.8a, FR-1.8b, FR-1.28k
  - Description: `read` recomputes the checksum on every invocation; on mismatch it exits 3 and throws (via `readState`) a `ChecksumError`.
  - Fixtures: `canonical-2x2x2-drifted.json`

- **TA-StateManager-010**
  - File: `__tests__/StateManager/read.test.ts`
  - Verifies: FR-1.8c
  - Description: `read --task 9.9` exits 1 when the target id does not resolve; same for unresolved `--phase` or `--criterion` targets.
  - Fixtures: `canonical-2x2x2-initialized.json`

#### `update-criterion` tests

- **TA-StateManager-011**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.9, FR-1.28e
  - Description: `update-criterion --task 2.1 --criterion 1 --status PASS` flips the target criterion's status to `PASS` in the returned state value.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-012**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.10a
  - Description: Updating the first criterion of a `PENDING` task transitions the parent task's status from `PENDING` to `IN_PROGRESS`.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-013**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.10b
  - Description: Updating a criterion under a task already `IN_PROGRESS` does not re-transition the task status (status remains `IN_PROGRESS`), and updating a criterion under a task at `PASS` does not demote the task.
  - Fixtures: `canonical-2x2x2-in-progress.json`

- **TA-StateManager-014**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.11
  - Description: `--status FAIL` increments the parent task's `fix_attempts` counter by exactly 1 per call.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-015**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.12a
  - Description: `--evidence -` reads evidence from stdin (multi-line captured verbatim, preserving internal newlines).
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-016**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.12b
  - Description: When `--evidence` is omitted, the target criterion's `evidence` field is set to the empty string (not `null`, not absent).
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-017**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.13
  - Description: `--task 9.9 --criterion 1 --status PASS` errors with `E_TARGET_NOT_FOUND` on the task-not-found path.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-018**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.14a
  - Description: `--task 2.1 --criterion 99 --status PASS` errors with `E_TARGET_NOT_FOUND` on the criterion-not-found path (task resolves, criterion does not).
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-019**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.14b
  - Description: `--status BOGUS` errors with `E_INVALID_STATUS` and does not write.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-020**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.29a, FR-1.29c
  - Description: The programmatic `updateCriterion(state, ...)` does not read or write the filesystem (no `fs.*` calls via a spy), and it returns a fresh state value; the input `state` argument is deep-equal to its pre-call snapshot.
  - Fixtures: none (inline state)

- **TA-StateManager-021**
  - File: `__tests__/StateManager/update-criterion.test.ts`
  - Verifies: FR-1.37
  - Description: `update-criterion` never calls `advanceTask` implicitly — after the last PENDING criterion of a task becomes PASS, the task's status remains `IN_PROGRESS` (not `PASS`) and `current_task` is unchanged.
  - Fixtures: `canonical-2x2x2-initialized.json`

#### `advance-task` tests

- **TA-StateManager-022**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.15a, FR-1.15b, FR-1.28f
  - Description: `advanceTask` flips the task's `status` to `PASS` only when every criterion of the task is `PASS`; otherwise the status is unchanged.
  - Fixtures: `canonical-2x2x2-all-pass.json`, `canonical-2x2x2-one-fail.json`

- **TA-StateManager-023**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.16a, FR-1.16b
  - Description: When the task flips to `PASS`, `verified_at` is stamped at that moment and is a valid ISO-8601 UTC string.
  - Fixtures: `canonical-2x2x2-all-pass.json`

- **TA-StateManager-024**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.17a, FR-1.17b
  - Description: With tasks `"2.1"`, `"2.2"`, `"2.10"` present, advancing from `"2.2"` sets `current_task` to `"2.10"` (dotted-numeric, not lexicographic). Re-invoking the pure function on the same input yields the same output (determinism).
  - Fixtures: `canonical-phase-with-mixed-ids.json`

- **TA-StateManager-025**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.18a, FR-1.18b, FR-1.19
  - Description: Advancing the last task of phase `"1"` sets `current_task` to the first task of phase `"2"` and increments `current_phase` to `"2"`; phase rollover uses lexicographic order on the `phases` map keys.
  - Fixtures: `canonical-2x2x2-last-task-of-phase1.json`

- **TA-StateManager-026**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.20a, FR-1.20b
  - Description: Advancing the last task of the last phase sets top-level `status` to `COMPLETED`; the `--json` response sets `plan_complete: true`.
  - Fixtures: `canonical-2x2x2-last-task-of-last-phase.json`

- **TA-StateManager-027**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.21a, FR-1.21b, FR-1.21c
  - Description: When `advance-task` is called on a task with non-PASS criteria, the process exits 1 with error code `E_CRITERIA_INCOMPLETE` and the payload lists the ids of every non-PASS criterion.
  - Fixtures: `canonical-2x2x2-one-fail.json`

- **TA-StateManager-028**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.21d
  - Description: `advance-task --task 9.9` errors with `E_TARGET_NOT_FOUND`.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-StateManager-029**
  - File: `__tests__/StateManager/advance-task.test.ts`
  - Verifies: FR-1.29b, FR-1.29d
  - Description: The programmatic `advanceTask` does not read or write the filesystem and returns a new state value; the input `state` argument is deep-equal to its pre-call snapshot.
  - Fixtures: none (inline state)

- **TA-StateManager-030**
  - File: `__tests__/StateManager/advance-task-events.test.ts`
  - Verifies: FR-1.34, FR-5.7a, FR-5.7b
  - Description: `advance-task` emits a single `plan.task.advanced` event with `from_task` = the advanced task id and `to_task` = the new `current_task`.
  - Fixtures: `canonical-2x2x2-all-pass.json`

- **TA-StateManager-031**
  - File: `__tests__/StateManager/advance-task-events.test.ts`
  - Verifies: FR-1.35, FR-5.7c, FR-5.16
  - Description: On a phase-rollover advance, the event sets `phase_rolled: true`; on an in-phase advance, the field is absent or `false`.
  - Fixtures: `canonical-2x2x2-last-task-of-phase1.json`, `canonical-2x2x2-in-progress.json`

- **TA-StateManager-032**
  - File: `__tests__/StateManager/advance-task-events.test.ts`
  - Verifies: FR-1.36, FR-5.7d
  - Description: When the advance completes the plan, the event sets `plan_completed: true`.
  - Fixtures: `canonical-2x2x2-last-task-of-last-phase.json`

#### Pointer lifecycle tests (scope change 2026-04-21)

- **TA-StateManager-033**
  - File: `__tests__/StateManager/advance-task-pointer.test.ts`
  - Verifies: FR-1.39a, FR-1.40, TR-5.9
  - Description: On the advance call that flips plan `status` to `COMPLETED`, the pointer file at `$HOME/.claude/MEMORY/STATE/plan-executor.active.json` is deleted via a single `unlinkSync`; on phase-only rollover (no plan completion), the pointer persists.
  - Fixtures: `canonical-2x2x2-last-task-of-last-phase.json`, `canonical-2x2x2-last-task-of-phase1.json`

- **TA-StateManager-034**
  - File: `__tests__/StateManager/advance-task-pointer.test.ts`
  - Verifies: FR-1.39b, FR-1.39c, TR-5.9
  - Description: When the pointer-delete call fails (e.g., pointer already absent, or filesystem returns EACCES via dependency-injected fs wrapper), `advance-task` still exits 0, the state write still completes, and a `hook.error` event is emitted with a `reason` field naming the cause.
  - Fixtures: `canonical-2x2x2-last-task-of-last-phase.json`

#### `show` tests

- **TA-StateManager-035**
  - File: `__tests__/StateManager/show.test.ts`
  - Verifies: FR-1.22, FR-1.23
  - Description: `show` renders a tree containing `✓` for PASS, `✗` for FAIL, and `…` for PENDING criteria; `show --phase 2` renders phase 2; `show` without a flag renders the phase at `current_phase`.
  - Fixtures: `canonical-2x2x2-mixed-statuses.json`

#### `validate` tests

- **TA-StateManager-036**
  - File: `__tests__/StateManager/validate.test.ts`
  - Verifies: FR-1.24a, FR-1.24b, FR-1.33
  - Description: `validate` performs a schema check that flags every required-field omission (task without `status`, phase without `tasks`, etc.) without calling `readState` and without throwing `ChecksumError` even on a checksum-mismatched file.
  - Fixtures: `canonical-2x2x2-missing-field.json`, `canonical-2x2x2-drifted.json`

- **TA-StateManager-037**
  - File: `__tests__/StateManager/validate.test.ts`
  - Verifies: FR-1.24c, FR-1.24d, FR-1.24e
  - Description: `validate` detects known enum-value mismatches for `status`, rejects `automated` criteria missing `command` and `manual` criteria missing `prompt`, and rejects a `current_task` that does not resolve inside `phases[current_phase].tasks`.
  - Fixtures: `canonical-2x2x2-bad-enum.json`, `canonical-2x2x2-automated-no-command.json`, `canonical-2x2x2-current-task-orphaned.json`

- **TA-StateManager-038**
  - File: `__tests__/StateManager/validate.test.ts`
  - Verifies: FR-1.24f, FR-1.30d
  - Description: `validate` does not read the `plan_checksum` field; when encountering unknown enum values in `status`, it reports them as `unknown_enum` warnings rather than errors.
  - Fixtures: `canonical-2x2x2-unknown-enum.json`

#### `checksum` tests

- **TA-StateManager-039**
  - File: `__tests__/StateManager/checksum.test.ts`
  - Verifies: FR-1.25
  - Description: `checksum` prints the recomputed plan checksum to stdout and does not write to disk (mtime unchanged).
  - Fixtures: `canonical-2x2x2-initialized.json`

#### `--help` tests

- **TA-StateManager-040**
  - File: `__tests__/StateManager/help.test.ts`
  - Verifies: FR-1.26, FR-1.27, TR-3.4a
  - Description: Invoking each subcommand (`init`, `read`, `update-criterion`, `advance-task`, `show`, `validate`, `checksum`) with `--help` prints a synopsis, its flags, and its purpose; invoking the top-level binary with `--help` lists every subcommand. `-h` is accepted as an alias for `--help`.
  - Fixtures: none

#### Programmatic API export tests

- **TA-StateManager-041**
  - File: `__tests__/StateManager/exports.test.ts`
  - Verifies: FR-1.28a, FR-1.28b, FR-1.28c, FR-1.28d, FR-1.28e, FR-1.28f, FR-1.28g
  - Description: The StateManager module exports the seven function symbols named in design.md §5 with the signatures asserted in FR-1.28a–g (verified by `typeof` checks and TypeScript type-level assertions compiled into the test).
  - Fixtures: none

- **TA-StateManager-042**
  - File: `__tests__/StateManager/exports.test.ts`
  - Verifies: FR-1.28h, FR-1.28i
  - Description: StateManager exports `StateManagerError` and five subclasses `SchemaError`, `ChecksumError`, `TargetNotFoundError`, `PreconditionError`, `IOError`, all extending `StateManagerError` via `instanceof` assertions.
  - Fixtures: none

- **TA-StateManager-043**
  - File: `__tests__/StateManager/exports.test.ts`
  - Verifies: FR-1.28j
  - Description: StateManager exports the TypeScript types `CriterionStatus`, `TaskStatus`, `PhaseStatus`, `Criterion`, `Task`, `Phase`, `ValidationState` (type-level assertion via `type _ = import(...).Criterion` compile check inside the test file).
  - Fixtures: none

#### Unknown-field preservation (D11)

- **TA-StateManager-044**
  - File: `__tests__/StateManager/unknown-fields.test.ts`
  - Verifies: FR-1.30a, TR-10.4
  - Description: A top-level unknown field (`"iteration_count": 3`) present on read is preserved verbatim after `readState` → `updateCriterion` → `writeState`.
  - Fixtures: `canonical-2x2x2-with-unknown-toplevel.json`

- **TA-StateManager-045**
  - File: `__tests__/StateManager/unknown-fields.test.ts`
  - Verifies: FR-1.30b
  - Description: Unknown fields nested on a phase object, a task object, and a criterion object all survive the read-merge-write cycle verbatim.
  - Fixtures: `canonical-2x2x2-with-unknown-nested.json`

- **TA-StateManager-046**
  - File: `__tests__/StateManager/unknown-fields.test.ts`
  - Verifies: FR-1.30c
  - Description: A criterion with `status: "SKIPPED"` (unknown enum value) round-trips through `readState` → `writeState` with the `"SKIPPED"` string preserved (not coerced or dropped).
  - Fixtures: `canonical-2x2x2-unknown-enum.json`

#### Path flag

- **TA-StateManager-047**
  - File: `__tests__/StateManager/path-flag.test.ts`
  - Verifies: FR-1.31
  - Description: Every subcommand accepts `--path <file>`; omitting the flag causes the subcommand to target `./validation.json` relative to CWD (verified via a temp CWD and a custom file location).
  - Fixtures: `canonical-2x2x2-initialized.json`

#### Atomic write

- **TA-StateManager-048**
  - File: `__tests__/StateManager/atomic-write.test.ts`
  - Verifies: TR-5.1a, TR-5.1b, TR-5.1c, TR-5.2
  - Description: `writeState` creates a temp file `<target>.tmp` adjacent to the target in the same directory, then finalises via `fs.renameSync(temp, target)`; the temp file does not remain after the successful write.
  - Fixtures: `canonical-2x2x2.json`

- **TA-StateManager-049**
  - File: `__tests__/StateManager/atomic-write.test.ts`
  - Verifies: TR-5.3, TR-5.7
  - Description: `writeState` acquires no file lock during the write (no `flock`, `fcntl`, or advisory-lock syscalls — verified by stubbing the lock-related module entry points and asserting they are never invoked).
  - Fixtures: none

- **TA-StateManager-050**
  - File: `__tests__/StateManager/atomic-write.test.ts`
  - Verifies: TR-5.4, TR-5.6
  - Description: `writeState` calls `fsync` on the temp file's file descriptor before `rename`; it does not call `fsync` on the parent directory (verified via spy on the fs abstraction).
  - Fixtures: none

- **TA-StateManager-051**
  - File: `__tests__/StateManager/atomic-write.test.ts`
  - Verifies: TR-5.5
  - Description: A concurrent reader invoked mid-write reads the pre-write version (no partial-state visible); implemented via dependency-injected fs wrapper that pauses between temp-write and rename and fires a read during the pause.
  - Fixtures: `canonical-2x2x2.json`

#### Library layering

- **TA-StateManager-052**
  - File: `__tests__/StateManager/layering.test.ts`
  - Verifies: TR-7.1, TR-7.2, TR-7.4, TR-7.6, TR-7.9
  - Description: Static AST inspection of `src/StateManager.ts` confirms its only `./lib/*` import is `./lib/state-types`; `src/lib/state-types.ts` and `src/lib/hook-types.ts` each contain only `export type`/`export interface` declarations (zero runtime value exports); the file base names under `src/lib/` carry no `-mvp` or `-local` suffix; all four library files (`state-types.ts`, `event-types.ts`, `hook-types.ts`, `event-emitter.ts`) live under `src/lib/`.
  - Fixtures: none (walks the repo src tree)

### 3.2 Tier A.2 — CheckRunner unit tests

Covers: FR-2.*, FR-5.8, FR-5.9 emission points originating from CheckRunner, TR-7.7, TR-10.2.

#### Target resolution

- **TA-CheckRunner-001**
  - File: `__tests__/CheckRunner/target-resolution.test.ts`
  - Verifies: FR-2.1
  - Description: `run` without `--task` calls `findCurrentCriterion(state)` and iterates the task returned by it.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-002**
  - File: `__tests__/CheckRunner/target-resolution.test.ts`
  - Verifies: FR-2.2
  - Description: `run --task 2.2` targets task `"2.2"` regardless of `current_task`.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-003**
  - File: `__tests__/CheckRunner/target-resolution.test.ts`
  - Verifies: FR-2.3
  - Description: `run` iterates criteria in numeric-id order (`1, 2, 10`, not `1, 10, 2`).
  - Fixtures: `canonical-task-with-ten-criteria.json`

#### Automated criterion flow

- **TA-CheckRunner-004**
  - File: `__tests__/CheckRunner/automated.test.ts`
  - Verifies: FR-2.4
  - Description: An automated criterion's `command` is executed via `bash -c "<command>"` (verified by spying on the process-spawn abstraction and asserting argv[0] is `bash`, argv[1] is `-c`, argv[2] is the exact command string).
  - Fixtures: none

- **TA-CheckRunner-005**
  - File: `__tests__/CheckRunner/automated.test.ts`
  - Verifies: FR-2.5a, FR-2.5b, FR-2.6
  - Description: With no env override, the timeout is 30,000 ms; when `CHECKRUNNER_TIMEOUT_MS=5000` is set, the effective timeout is 5,000 ms; the env var name is exactly `CHECKRUNNER_TIMEOUT_MS`.
  - Fixtures: none

- **TA-CheckRunner-006**
  - File: `__tests__/CheckRunner/stdout-classification.test.ts`
  - Verifies: FR-2.7a, FR-2.7b, FR-2.7c, TR-10.2a
  - Description: Stdout `"hello\nPASS"` + exit 0 → recorded PASS; `"PASS"` + exit 1 → NOT PASS; `"hello"` + exit 0 (no marker) → NOT PASS — both conjuncts (last-non-empty-line-equals-`PASS` AND exit 0) are required.
  - Fixtures: none

- **TA-CheckRunner-007**
  - File: `__tests__/CheckRunner/stdout-classification.test.ts`
  - Verifies: FR-2.8a, FR-2.8b, FR-2.8c, TR-10.2a
  - Description: FAIL is recorded when the last non-empty stdout line is `"FAIL"` (alone sufficient, exit code irrelevant) OR when exit code is non-zero (alone sufficient, stdout content irrelevant) — the two conditions form a disjunction.
  - Fixtures: none

- **TA-CheckRunner-008**
  - File: `__tests__/CheckRunner/automated.test.ts`
  - Verifies: FR-2.9, TR-10.2a
  - Description: A command that exceeds the timeout is killed and the criterion is recorded FAIL with evidence exactly matching `TIMEOUT after 30000ms` (or the effective override value).
  - Fixtures: none

- **TA-CheckRunner-009**
  - File: `__tests__/CheckRunner/evidence.test.ts`
  - Verifies: FR-2.10, TR-10.2b
  - Description: On PASS, evidence equals the captured stdout with leading/trailing whitespace trimmed; inner newlines preserved.
  - Fixtures: none

- **TA-CheckRunner-010**
  - File: `__tests__/CheckRunner/evidence.test.ts`
  - Verifies: FR-2.11a, FR-2.11b, FR-2.11c, TR-10.2b
  - Description: On FAIL with captured stdout `"hello"` / stderr `"oops"` / exit 7, evidence is a three-line string: line 1 = `exit_code=7`, line 2 = `stdout=hello`, line 3 = `stderr=oops`.
  - Fixtures: none

#### Manual criterion flow (D10)

- **TA-CheckRunner-011**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.12
  - Description: When `--manual-prompt-strategy` is not provided, the default strategy is `stdin`.
  - Fixtures: none

- **TA-CheckRunner-012**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.13, TR-10.2c
  - Description: Under `stdin` strategy, stdout contains a line `MANUAL: <prompt>` before the read.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-013**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.14, TR-10.2c
  - Description: An empty stdin line under `stdin` records FAIL with evidence `no answer provided`.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-014**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.15, TR-10.2c
  - Description: A non-empty stdin line under `stdin` records PASS with the trimmed line as evidence.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-015**
  - File: `__tests__/CheckRunner/manual-askuser.test.ts`
  - Verifies: FR-2.16, FR-2.17a, TR-10.2e
  - Description: Under `askuser`, the first pending manual criterion aborts with exit code 4 and prints the payload to stderr (not stdout).
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-016**
  - File: `__tests__/CheckRunner/manual-askuser.test.ts`
  - Verifies: FR-2.17b, FR-2.17c, FR-2.17d, FR-2.17e, FR-2.17f, TR-10.2e
  - Description: The exit-4 stderr payload parses as JSON with keys `exit_reason` = `"manual_criterion_needs_askuser"`, `task` = current task id, `criterion` = blocking criterion id, `prompt` = criterion prompt text, `resume_command` = a ready-to-run CheckRunner invocation string.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-017**
  - File: `__tests__/CheckRunner/manual-askuser.test.ts`
  - Verifies: FR-2.18
  - Description: Running `run --task <id> --answer "yes"` under `askuser` supplies the answer to the exact criterion that triggered the prior exit-4 and continues into remaining criteria.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-018**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.30
  - Description: Under `stdin` strategy, `--answer <response>` is accepted as a scripted shortcut — no stdin read happens, and the response is recorded as evidence.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-019**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.31, FR-5.8a, FR-5.8b, FR-5.8c
  - Description: A manual-criterion PASS emits `plan.criterion.passed` with `task`, `criterion`, and `evidence_len` (an integer equal to the trimmed answer's length).
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-020**
  - File: `__tests__/CheckRunner/manual-stdin.test.ts`
  - Verifies: FR-2.32, FR-5.9a, FR-5.9b, FR-5.9d, FR-5.15
  - Description: A manual-criterion FAIL (empty answer) emits `plan.criterion.failed` with `task`, `criterion`, `evidence_snippet` (first 240 chars of evidence), and `exit_code` absent (not `null`, not `-1`).
  - Fixtures: `manual-criterion-fixture.json`

#### Dry run

- **TA-CheckRunner-021**
  - File: `__tests__/CheckRunner/dry-run.test.ts`
  - Verifies: FR-2.19, FR-2.20, TR-10.2d
  - Description: `--dry-run` evaluates automated criteria (runs the bash command) but does not call `updateCriterion` or `advanceTask`; state-file mtime is unchanged.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-022**
  - File: `__tests__/CheckRunner/dry-run.test.ts`
  - Verifies: FR-2.21a, FR-2.21b
  - Description: Under `--dry-run`, manual criteria are reported as `would prompt: <prompt>` with no stdin read, and no exit 4 is emitted.
  - Fixtures: `manual-criterion-fixture.json`

- **TA-CheckRunner-023**
  - File: `__tests__/CheckRunner/dry-run.test.ts`
  - Verifies: FR-2.21c
  - Description: Default (non-`--json`) stdout under `--dry-run` begins with the literal line `[DRY RUN — state file not modified]`.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-024**
  - File: `__tests__/CheckRunner/dry-run.test.ts`
  - Verifies: FR-2.33
  - Description: Under `--dry-run`, no `plan.*` events are emitted (events.jsonl is absent or unchanged across the run).
  - Fixtures: `canonical-2x2x2-initialized.json`

#### Control flow and exit codes

- **TA-CheckRunner-025**
  - File: `__tests__/CheckRunner/control-flow.test.ts`
  - Verifies: FR-2.22
  - Description: When every criterion of the target task resolves PASS, CheckRunner calls `advanceTask(state, taskId)` before exiting.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-026**
  - File: `__tests__/CheckRunner/control-flow.test.ts`
  - Verifies: FR-2.23a, FR-2.23b
  - Description: Exit 0 is emitted only when every criterion is PASS AND the task was successfully advanced in the same invocation; if advance fails (e.g., due to a pointer-delete error), exit is not 0.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-027**
  - File: `__tests__/CheckRunner/control-flow.test.ts`
  - Verifies: FR-2.24
  - Description: One or more criteria FAIL → exit 1, and stderr lists the failing criterion ids.
  - Fixtures: `canonical-task-one-criterion-fails.json`

- **TA-CheckRunner-028**
  - File: `__tests__/CheckRunner/control-flow.test.ts`
  - Verifies: FR-2.25, FR-2.29
  - Description: On system error (StateManager write failure simulated via dependency-injected fs error), CheckRunner exits 2, aborts criterion iteration at the failing point, and does not coerce remaining pending criteria to FAIL.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TA-CheckRunner-029**
  - File: `__tests__/CheckRunner/control-flow.test.ts`
  - Verifies: FR-2.26, FR-2.34
  - Description: On `plan_checksum` mismatch detected at state read, CheckRunner exits 3 before any `updateCriterion` call (spy on `updateCriterion` records zero invocations).
  - Fixtures: `canonical-2x2x2-drifted.json`

#### JSON output

- **TA-CheckRunner-030**
  - File: `__tests__/CheckRunner/json-output.test.ts`
  - Verifies: FR-2.27a, FR-2.27b, FR-2.35
  - Description: Under `--json`, stdout is a single JSON object (zero other lines) with keys `task`, `results` (array), `summary.passed`, `summary.failed`, `summary.manual`, `advanced` (boolean).
  - Fixtures: `canonical-2x2x2-initialized.json`

#### Subprocess-free integration

- **TA-CheckRunner-031**
  - File: `__tests__/CheckRunner/subprocess-free.test.ts`
  - Verifies: FR-2.28, TR-7.7
  - Description: CheckRunner imports and calls `readState`, `updateCriterion`, `advanceTask`, `writeState` from the StateManager module directly (via module import); a spy on `Bun.spawn`/`child_process.spawn` confirms StateManager is never invoked as a subprocess. Imports from `./lib/event-emitter` are verified by static inspection.
  - Fixtures: none

### 3.3 Tier A.3 — PlanGateHandler unit tests (decision table)

Covers: FR-3.*, FR-5.5, FR-5.6 emission points originating from PlanGate, TR-6.*, TR-8.*, TR-10.3.

**Decision-table approach.** The full decision space is `{tool ∈ {Bash, Edit, Write}} × {task.status ∈ {PENDING, IN_PROGRESS, PASS}} × {target_path ∈ {validation.json, other-in-project, out-of-project, StateManager.ts, CheckRunner.ts}}` = 3 × 3 × 5 = 45 cells. Many collapse: (a) the `target_path` dimension only disambiguates for `Bash` (allow-list tokens live in commands), while for `Edit`/`Write` the relevant distinction is `validation.json` vs. any other path; and (b) the `state_file_write_attempt` rule applies before the allow-list/task-status rule, so once the target equals `validation.json` for Edit/Write, task status is irrelevant. We therefore implement the decision table as a parameterised test driving a single `decide()` call per row of the condensed matrix below, with extra one-off tests for checksum-drift, unexpected-tool, state-malformed, and pointer-absent cases. Each distinct decision outcome has ≥1 dedicated test.

**Condensed decision table (parameterised test: `TA-PlanGate-001`):**

| # | tool  | task.status  | target/token                              | expected decision | reason_code                |
|---|-------|--------------|-------------------------------------------|-------------------|----------------------------|
| 1 | Write | PENDING      | validation.json (pointer target)          | BLOCK             | state_file_write_attempt   |
| 2 | Write | IN_PROGRESS  | validation.json                           | BLOCK             | state_file_write_attempt   |
| 3 | Write | PASS         | validation.json                           | BLOCK             | state_file_write_attempt   |
| 4 | Edit  | PENDING      | validation.json                           | BLOCK             | state_file_write_attempt   |
| 5 | Edit  | IN_PROGRESS  | validation.json                           | BLOCK             | state_file_write_attempt   |
| 6 | Edit  | PASS         | validation.json                           | BLOCK             | state_file_write_attempt   |
| 7 | Write | PENDING      | other-in-project                          | BLOCK             | task_not_pass              |
| 8 | Write | IN_PROGRESS  | other-in-project                          | BLOCK             | task_not_pass              |
| 9 | Write | PASS         | other-in-project                          | ALLOW             | —                          |
| 10| Write | PENDING      | out-of-project                            | BLOCK             | task_not_pass              |
| 11| Write | PASS         | out-of-project                            | ALLOW             | —                          |
| 12| Edit  | PENDING      | other-in-project                          | BLOCK             | task_not_pass              |
| 13| Edit  | PASS         | other-in-project                          | ALLOW             | —                          |
| 14| Edit  | PENDING      | out-of-project                            | BLOCK             | task_not_pass              |
| 15| Edit  | PASS         | out-of-project                            | ALLOW             | —                          |
| 16| Bash  | PENDING      | StateManager.ts (allow-listed token)      | ALLOW             | —                          |
| 17| Bash  | IN_PROGRESS  | StateManager.ts                           | ALLOW             | —                          |
| 18| Bash  | PASS         | StateManager.ts                           | ALLOW             | —                          |
| 19| Bash  | PENDING      | CheckRunner.ts (allow-listed token)       | ALLOW             | —                          |
| 20| Bash  | IN_PROGRESS  | CheckRunner.ts                            | ALLOW             | —                          |
| 21| Bash  | PASS         | CheckRunner.ts                            | ALLOW             | —                          |
| 22| Bash  | PENDING      | non-allow-listed (`echo hi`)              | BLOCK             | task_not_pass              |
| 23| Bash  | IN_PROGRESS  | non-allow-listed                          | BLOCK             | task_not_pass              |
| 24| Bash  | PASS         | non-allow-listed                          | ALLOW             | —                          |

#### Core decision table

- **TA-PlanGate-001**
  - File: `__tests__/PlanGateHandler/decision-table.test.ts`
  - Verifies: FR-3.5a, FR-3.5b, FR-3.5c, FR-3.6, FR-3.7, FR-3.8a, FR-3.9a, FR-3.9b, FR-3.10a, FR-3.10b, FR-3.10c, FR-3.20, TR-10.3a, TR-10.3b
  - Description: Parameterised test driving `PlanGateHandler.decide` over all 24 rows of the condensed table above; each row asserts the expected `permissionDecision` (`"deny"` vs. absent) and the `reason_code` (when BLOCK) matches the matrix value.
  - Fixtures: `pg-state-pending.json`, `pg-state-in-progress.json`, `pg-state-pass.json`, `pg-pointer.json`

#### Matcher registration (wrapper-level unit)

- **TA-PlanGate-002**
  - File: `__tests__/PlanGate/matcher.test.ts`
  - Verifies: FR-3.1a, FR-3.1b, FR-3.1c
  - Description: The hook wrapper reads `tool_name` from the stdin payload and routes all three matcher values (`Bash`, `Edit`, `Write`) into `decide`; an unknown matcher (e.g., `Read`) does NOT invoke `decide` with a block decision (covered by FR-3.26 in TA-PlanGate-013).
  - Fixtures: none (stdin fixtures inline)

#### Stdin parsing

- **TA-PlanGate-003**
  - File: `__tests__/PlanGate/stdin.test.ts`
  - Verifies: FR-3.2, TR-6.1, TR-6.2, TR-6.7
  - Description: The wrapper imports `readHookInput` from `~/.claude/hooks/lib/hook-io.ts` (verified by AST inspection + mock at import path); the 500 ms timeout of `readHookInput` is used as shipped (no wrapping setTimeout / AbortController extends it).
  - Fixtures: none

#### Active-plan discovery

- **TA-PlanGate-004**
  - File: `__tests__/PlanGateHandler/pointer.test.ts`
  - Verifies: FR-3.3
  - Description: When the pointer file is absent (temp `HOME`, no pointer exists), `decide` returns ALLOW with no stdout payload.
  - Fixtures: none

- **TA-PlanGate-005**
  - File: `__tests__/PlanGateHandler/pointer.test.ts`
  - Verifies: FR-3.4a, FR-3.4b
  - Description: When the pointer file exists but `pointer.validation_path` does not resolve on disk, `decide` returns ALLOW and emits a `hook.error` event via `appendEvent`.
  - Fixtures: `pointer-stale.json`

- **TA-PlanGate-006**
  - File: `__tests__/PlanGateHandler/pointer.test.ts`
  - Verifies: FR-3.23
  - Description: `decide` calls `readState(pointer.validation_path)` (not a hardcoded path); swapping `validation_path` in the pointer fixture redirects the read target (verified by spying on `readState`).
  - Fixtures: `pointer-redirected.json`

#### Block output envelope

- **TA-PlanGate-007**
  - File: `__tests__/PlanGateHandler/envelope.test.ts`
  - Verifies: FR-3.12a, FR-3.12b, FR-3.12c, FR-3.12d, FR-3.12e, TR-6.3
  - Description: On any BLOCK path, the emitted JSON has a top-level `hookSpecificOutput` key, with `hookEventName` = `"PreToolUse"`, `permissionDecision` = `"deny"`, a non-empty `permissionDecisionReason` string, printed to stdout (not stderr) as a single JSON object.
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

- **TA-PlanGate-008**
  - File: `__tests__/PlanGateHandler/envelope.test.ts`
  - Verifies: FR-3.13, TR-6.4
  - Description: On any ALLOW path, no bytes are written to stdout.
  - Fixtures: `pg-state-pass.json`, `pg-pointer.json`

- **TA-PlanGate-009**
  - File: `__tests__/PlanGateHandler/envelope.test.ts`
  - Verifies: FR-3.14a, FR-3.14b, FR-3.14c, FR-3.24
  - Description: On BLOCK, `permissionDecisionReason` includes the failing task's id, the task's human name, and the exact command string `bun ~/.claude/PAI/Tools/CheckRunner.ts run --task <id>` with the real id substituted.
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

#### Checksum drift

- **TA-PlanGate-010**
  - File: `__tests__/PlanGateHandler/checksum.test.ts`
  - Verifies: FR-3.11
  - Description: When `readState` throws `ChecksumError`, `decide` returns BLOCK with `reason_code: "checksum_drift"`.
  - Fixtures: `pg-state-drifted.json`, `pg-pointer.json`

#### State-malformed

- **TA-PlanGate-011**
  - File: `__tests__/PlanGateHandler/checksum.test.ts`
  - Verifies: FR-3.22
  - Description: When the pointer is present but state parsing throws a schema error (malformed JSON), `decide` returns BLOCK with `reason_code: "state_malformed"`.
  - Fixtures: `pg-state-malformed.json`, `pg-pointer.json`

#### Handler purity

- **TA-PlanGate-012**
  - File: `__tests__/PlanGateHandler/purity.test.ts`
  - Verifies: FR-3.15, FR-3.16a, FR-3.16b, FR-3.16c, FR-3.25, TR-6.6, TR-7.8, TR-7.10
  - Description: `PlanGateHandler.decide` performs no stdin reads (spy on `process.stdin.on`/readHookInput), never calls `process.exit`, has no filesystem write beyond `appendEvent`, and depends only on its input object (swapping `tool_use_id` or any session-scoped identifier does not change the returned decision); `src/handlers/PlanGateHandler.ts` imports `appendEvent` from `../lib/event-emitter` and imports from `../lib/hook-types` (AST inspection verifies both imports).
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

#### Unexpected tool / graceful failure

- **TA-PlanGate-013**
  - File: `__tests__/PlanGateHandler/edge-cases.test.ts`
  - Verifies: FR-3.26
  - Description: When `tool_name` is `Read` (or any value outside `{Bash, Edit, Write}`), `decide` returns ALLOW.
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

- **TA-PlanGate-014**
  - File: `__tests__/PlanGateHandler/edge-cases.test.ts`
  - Verifies: FR-3.17, TR-6.5
  - Description: When a synthetic unexpected exception is raised inside `decide` (e.g., the event emitter throws via stubbing — never should happen but defensively covered), the wrapper prints no block envelope and exits 0.
  - Fixtures: none

#### Exit code

- **TA-PlanGate-015**
  - File: `__tests__/PlanGateHandler/exit-code.test.ts`
  - Verifies: FR-3.21
  - Description: The wrapper exits 0 on every ALLOW and every BLOCK decision (spy on `process.exit` records only code 0 or default 0).
  - Fixtures: `pg-pointer.json`, `pg-state-pending.json`, `pg-state-pass.json`

#### PlanGate event emission

- **TA-PlanGate-016**
  - File: `__tests__/PlanGateHandler/events.test.ts`
  - Verifies: FR-3.18, FR-5.6a, FR-5.6b
  - Description: On ALLOW, `decide` emits `plan.gate.allowed` via `appendEvent` with fields `tool` and `task`.
  - Fixtures: `pg-state-pass.json`, `pg-pointer.json`

- **TA-PlanGate-017**
  - File: `__tests__/PlanGateHandler/events.test.ts`
  - Verifies: FR-3.19, FR-5.5a, FR-5.5b, FR-5.5c, FR-5.5d, FR-5.17
  - Description: On BLOCK, `decide` emits `plan.gate.blocked` with `tool`, `task`, `reason_code`; `target_path` is present only when `reason_code` is `state_file_write_attempt` and absent on `task_not_pass`/`checksum_drift`/`state_malformed`.
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

#### Bash tokenisation (TR-8)

- **TA-PlanGate-018**
  - File: `__tests__/PlanGateHandler/tokenisation.test.ts`
  - Verifies: TR-8.1a, TR-8.1b, TR-8.7
  - Description: Allow-list match compares `realpath(token)` to `realpath(~/.claude/PAI/Tools/StateManager.ts)` (and similarly for CheckRunner). The raw token string is never compared directly (verified by forging a token equal to the target string but with a different realpath — must NOT allow).
  - Fixtures: `pg-pointer.json`

- **TA-PlanGate-019**
  - File: `__tests__/PlanGateHandler/tokenisation.test.ts`
  - Verifies: TR-8.2a, TR-8.2b
  - Description: Realpath expands `$HOME` and `~` before comparison; a symlink pointing at the real StateManager.ts is matched correctly.
  - Fixtures: `pg-pointer.json`

- **TA-PlanGate-020**
  - File: `__tests__/PlanGateHandler/tokenisation.test.ts`
  - Verifies: TR-8.3
  - Description: If the realpath of the target does not exist on disk, the allow-list does not match (even if the token string syntactically looks like the allow-listed path).
  - Fixtures: `pg-pointer.json`

- **TA-PlanGate-021**
  - File: `__tests__/PlanGateHandler/tokenisation.test.ts`
  - Verifies: TR-8.5
  - Description: Bash command tokenisation handles single-quoted args (`bash -c 'echo "hi"'`), double-quoted args, and `\`-newline continuations — tokenised output is an array of resolved path/argument tokens usable for allow-list matching.
  - Fixtures: none

- **TA-PlanGate-022**
  - File: `__tests__/PlanGateHandler/tokenisation.test.ts`
  - Verifies: TR-8.6
  - Description: The "under-project-root" check uses `realpath(target).startsWith(realpath(project_root) + "/")` — a sibling directory with a name prefix (e.g., `myproject-backup/` next to `myproject/`) does not match.
  - Fixtures: `pg-pointer.json`

- **TA-PlanGate-023**
  - File: `__tests__/PlanGateHandler/tokenisation.test.ts`
  - Verifies: TR-8.4, TR-8.8
  - Description: No env var (including `PATH`, `HOME`, and bespoke `*_SECRET`) is used as input to the allow-list identity check (spy on env access during the match). A token literally containing the substring `"StateManager"` but with a different realpath (e.g., `/tmp/malicious-StateManager.ts`) does NOT match.
  - Fixtures: `pg-pointer.json`

### 3.4 Tier A.4 — Event emitter unit tests

Covers: FR-5.1, FR-5.2, FR-5.3, FR-5.4a, FR-5.4b, FR-5.10, FR-5.11, FR-5.12, FR-5.13, FR-5.14, TR-7.3, TR-7.5.

- **TA-EventEmitter-001**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.1, FR-5.2
  - Description: `appendEvent` writes to `<project-root>/.plan-executor/events.jsonl`, where `<project-root>` is the parent directory of the active pointer's `validation_path`.
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-002**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.3
  - Description: Every appended event carries a `timestamp` field matching an ISO-8601 UTC regex (even when the caller did not supply one).
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-003**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.4a, FR-5.4b
  - Description: When `CLAUDE_SESSION_ID` is set, the appended event's `session_id` equals the env value; when unset, it equals the literal string `"unknown"`.
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-004**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.10
  - Description: When the file write fails (e.g., directory not writable, simulated via a dependency-injected fs wrapper), `appendEvent` does not throw — it swallows the error. The caller sees no exception.
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-005**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.11
  - Description: When no pointer file is present, `appendEvent` writes nothing (no events.jsonl is created in any filesystem location).
  - Fixtures: none

- **TA-EventEmitter-006**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.12
  - Description: If `<project-root>/.plan-executor/` does not exist at the moment of `appendEvent`, it is created before the append.
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-007**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.13
  - Description: Each event is a single UTF-8 JSON object per line, terminated by `\n`; a binary byte-level check confirms the trailing `0x0a`.
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-008**
  - File: `__tests__/event-emitter/append.test.ts`
  - Verifies: FR-5.14
  - Description: `appendEvent({ source: "PlanGate", ... })` preserves the caller's `source` field on the persisted record; omitting `source` preserves its absence (the emitter does not auto-inject it).
  - Fixtures: `pointer-for-event-emitter.json`

- **TA-EventEmitter-009**
  - File: `__tests__/event-emitter/layering.test.ts`
  - Verifies: TR-7.3, TR-7.5
  - Description: AST inspection: `src/lib/event-types.ts` contains only `export type`/`export interface` declarations (zero runtime code); `src/lib/event-emitter.ts` contains the `appendEvent` runtime function and imports its types from `./event-types`.
  - Fixtures: none

### 3.5 Tier A.5 — Plan checksum unit tests

Covers: FR-4.1a–c, FR-4.2a–d, FR-4.3a–c, FR-4.4a–c, FR-4.5, FR-4.6a–b, FR-4.7, FR-4.8, FR-4.9a–c, FR-4.10, FR-4.11, FR-4.12, FR-4.13, FR-4.14.

- **TA-Checksum-001**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.1a, FR-4.6a, FR-4.6b
  - Description: `computePlanChecksum(state)` returns a string of the form `sha256:<64 lowercase hex chars>` (regex `^sha256:[0-9a-f]{64}$`).
  - Fixtures: `canonical-2x2x2.json`

- **TA-Checksum-002**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.1b, FR-4.1c, FR-4.5
  - Description: The hash input is the UTF-8 byte sequence of a canonical JSON string of the criteria projection; the canonical string contains no insignificant whitespace (no spaces outside quoted values, no tabs, no newlines).
  - Fixtures: `canonical-2x2x2.json`

- **TA-Checksum-003**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.2a, FR-4.2b
  - Description: The projection retains `check` and `type` on every criterion (verified by extracting the projection string and regex-matching `"check"` and `"type"` keys for each criterion).
  - Fixtures: `canonical-2x2x2.json`

- **TA-Checksum-004**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.2c, FR-4.2d
  - Description: On an automated criterion, the projection retains `command`; on a manual criterion, the projection retains `prompt`; the absent one is absent (a criterion never has both in the projection).
  - Fixtures: `canonical-mixed-auto-manual.json`

- **TA-Checksum-005**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.3a, FR-4.3b, FR-4.3c, FR-4.12
  - Description: The projection drops `status`, `evidence`, `fix_attempts` from criteria/tasks and `verified_at` from every task (verified: swapping any of these fields in the source does NOT change the checksum).
  - Fixtures: `canonical-2x2x2-mixed-statuses.json`, `canonical-2x2x2-all-pass.json`

- **TA-Checksum-006**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.11
  - Description: Top-level `status`, `current_task`, `current_phase`, `initialized`, `notes` are not part of the projection — swapping them leaves the checksum unchanged.
  - Fixtures: `canonical-2x2x2.json`, `canonical-2x2x2-different-toplevel.json`

- **TA-Checksum-007**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.4a, FR-4.4b, FR-4.4c, FR-4.7, FR-4.13
  - Description: Source JSON with phases in reverse order, tasks in reverse order, criteria in reverse order, and criterion object keys in reverse order all yield the same checksum as the canonical-ordered source (stability). Criterion-id projection uses dotted-numeric when all ids are integers, lexicographic otherwise (e.g., `"1b"` sorts lexicographically with `"1a"`).
  - Fixtures: `canonical-2x2x2.json`, `canonical-2x2x2-reversed.json`, `canonical-2x2x2-alphakeys.json`

- **TA-Checksum-008**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.8
  - Description: Changing a single character in any criterion's `command` field changes the checksum (sensitivity).
  - Fixtures: `canonical-2x2x2.json`, `canonical-2x2x2-command-edit.json`

- **TA-Checksum-009**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.9a
  - Description: Changing a single character in any criterion's `prompt` field changes the checksum.
  - Fixtures: `canonical-mixed-auto-manual.json`, `canonical-mixed-auto-manual-prompt-edit.json`

- **TA-Checksum-010**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.9b, FR-4.9c
  - Description: Adding a criterion changes the checksum; removing a criterion changes the checksum.
  - Fixtures: `canonical-2x2x2.json`, `canonical-2x2x2-extra-criterion.json`, `canonical-2x2x2-fewer-criteria.json`

- **TA-Checksum-011**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.14
  - Description: Renaming a task id from `"2.1"` to `"2.1-old"` changes the checksum (structural identity includes ids).
  - Fixtures: `canonical-2x2x2.json`, `canonical-2x2x2-renamed-task.json`

- **TA-Checksum-012**
  - File: `__tests__/StateManager/computePlanChecksum.test.ts`
  - Verifies: FR-4.10
  - Description: The checksum is computed exactly once at `init` (call count = 1 on the first `init`) and recomputed on every `read` (spy shows one call per `read` invocation); `update-criterion` and `advance-task` do not re-compute the checksum.
  - Fixtures: `canonical-2x2x2-initialized.json`

---

## 4. Tier B — Integration tests

Full flows against a temp project directory that contains a real `validation.json`, real deployed-shape `~/.claude/PAI/Tools/StateManager.ts` / `CheckRunner.ts`, and real `PlanGate.hook.ts`. Subprocess invocation via `Bun.spawn`. Temp `HOME` override so the pointer file lives in an isolated `$TMPDIR/.claude/MEMORY/STATE/` per test. Each flow below runs the full sequence described in design.md §12.2 and asserts on both on-disk state and on emitted events (tail of `events.jsonl`). Flow 8 is new — pointer lifecycle coverage for the 2026-04-21 scope change.

### 4.1 Tier B.1 — Flow 1: Happy-path multi-task phase advancement

Design ref: design.md §12.2 Flow 1. TR-10.5.

- **TB-Flow1-001**
  - File: `__tests__/integration/flow1-happy-path.test.ts`
  - Verifies: FR-2.1, FR-2.2, FR-2.3, FR-2.4, FR-2.22, FR-2.23a, FR-2.23b, FR-1.15a, FR-1.15b, FR-1.16a, FR-1.16b, FR-1.17a, FR-1.18a, FR-1.18b, FR-1.19, FR-1.20a, FR-1.34, FR-5.7a, FR-5.7b, TR-10.5
  - Description: Init a fixture with 2 tasks × 3 automated criteria each; run CheckRunner against task `"2.1"` (all criteria PASS via fixture shell scripts that print `PASS` + exit 0) — task advances, `current_task` flips to `"2.2"`, `verified_at` stamps valid ISO-8601 UTC on task `"2.1"`. Repeat for `"2.2"` — phase rolls over to the next phase's first task (FR-1.18a). Final `events.jsonl` tail matches the exact expected sequence: 3× `plan.criterion.passed` + 1× `plan.task.advanced` per task, with `phase_rolled: true` on the rollover event.
  - Fixtures: `integration/project-2x3-happy.json`, `integration/pass-script.sh`

- **TB-Flow1-002**
  - File: `__tests__/integration/flow1-happy-path.test.ts`
  - Verifies: FR-5.7c, FR-5.7d, FR-5.8a, FR-5.8b, FR-5.8c, FR-5.13, FR-5.14, TR-11.4
  - Description: The emitted `events.jsonl` is one JSON object per `\n`-terminated line with each event carrying a `source` field equal to `"CheckRunner"` (criterion events) or `"StateManager"` (advance events); `phase_rolled`/`plan_completed` appear only when true; `plan.criterion.passed.evidence_len` is an integer equal to the byte length of the trimmed stdout.
  - Fixtures: `integration/project-2x3-happy.json`, `integration/pass-script.sh`

### 4.2 Tier B.2 — Flow 2: Red-then-green fix cycle

Design ref: design.md §12.2 Flow 2. TR-10.6.

- **TB-Flow2-001**
  - File: `__tests__/integration/flow2-red-then-green.test.ts`
  - Verifies: FR-1.11, FR-2.8a, FR-2.8b, FR-2.8c, FR-2.11a, FR-2.11b, FR-2.11c, FR-2.24, FR-5.9a, FR-5.9b, FR-5.9c, FR-5.9d, TR-10.6
  - Description: One-task fixture with one intentionally failing criterion (fixture shell script exits 1 with non-empty stderr). CheckRunner run → criterion FAILS, `fix_attempts` increments to 1, task stays `IN_PROGRESS`, exit 1, stderr lists the failing criterion id; emitted `plan.criterion.failed` has `exit_code`, `evidence_snippet`, `task`, `criterion`. Then swap the script to one that passes; CheckRunner run → PASS, task advances.
  - Fixtures: `integration/project-1x1-fixable.json`, `integration/fail-script-v1.sh`, `integration/fail-script-v2.sh`

### 4.3 Tier B.3 — Flow 3: PlanGate enforcement in-band

Design ref: design.md §12.2 Flow 3. TR-10.7.

- **TB-Flow3-001** (state-file write attempt)
  - File: `__tests__/integration/flow3-plangate.test.ts`
  - Verifies: FR-3.1c, FR-3.5a, FR-3.12a, FR-3.12b, FR-3.12c, FR-3.12d, FR-3.12e, TR-6.3, TR-10.7
  - Description: With pointer active and task status `PENDING`, subprocess-invoke `PlanGate.hook.ts` with stdin JSON representing a `Write` tool call whose `file_path` equals the pointer's `validation_path`. Expect stdout to be a single JSON object matching the block envelope with `reason_code: "state_file_write_attempt"`; exit code 0.
  - Fixtures: `integration/pg-project/validation.json`, `integration/pg-pointer.json`

- **TB-Flow3-002** (task-not-pass on Bash)
  - File: `__tests__/integration/flow3-plangate.test.ts`
  - Verifies: FR-3.1a, FR-3.8a, FR-3.20, FR-5.5a, FR-5.5b, FR-5.5c, TR-10.7
  - Description: With pointer active and task `PENDING`, invoke with a Bash `echo hi` stdin payload. Expect BLOCK with `reason_code: "task_not_pass"`; `events.jsonl` tail shows `plan.gate.blocked` with `tool: "Bash"`, `task: "2.1"`, `reason_code: "task_not_pass"`.
  - Fixtures: `integration/pg-project/validation.json`, `integration/pg-pointer.json`

- **TB-Flow3-003** (allow-list)
  - File: `__tests__/integration/flow3-plangate.test.ts`
  - Verifies: FR-3.1a, FR-3.7, TR-10.7, FR-3.18
  - Description: With pointer active and task `PENDING`, invoke with a Bash `bun ~/.claude/PAI/Tools/CheckRunner.ts run --task 2.1` stdin payload (the deployed CheckRunner really exists in the temp `PAI/Tools/` dir). Expect ALLOW (no stdout), and a `plan.gate.allowed` event is emitted.
  - Fixtures: `integration/pg-project/validation.json`, `integration/pg-pointer.json`, `integration/deployed-tools-dir/` (symlink target)

- **TB-Flow3-004** (task-PASS allow for Edit)
  - File: `__tests__/integration/flow3-plangate.test.ts`
  - Verifies: FR-3.1b, FR-3.10b, TR-10.7
  - Description: With pointer active and task `PASS`, invoke with an Edit stdin payload targeting an in-project source file. Expect ALLOW.
  - Fixtures: `integration/pg-project/validation.json` (variant with task PASS), `integration/pg-pointer.json`

### 4.4 Tier B.4 — Flow 4: Manual criterion under stdin strategy

Design ref: design.md §12.2 Flow 4. TR-10.8.

- **TB-Flow4-001**
  - File: `__tests__/integration/flow4-manual-stdin.test.ts`
  - Verifies: FR-2.12, FR-2.13, FR-2.15, FR-2.22, FR-2.31, FR-1.15b, TR-10.8
  - Description: Subprocess-invoke CheckRunner with `--task 2.1` and a piped stdin containing `"Yes, reviewed\n"`; the manual criterion is the only one on the task. Expect exit 0, criterion marked PASS with evidence `"Yes, reviewed"` (trimmed), task advances, one `plan.criterion.passed` event with `evidence_len = 13`.
  - Fixtures: `integration/project-manual-1x1.json`

### 4.5 Tier B.5 — Flow 5: Manual criterion under askuser strategy

Design ref: design.md §12.2 Flow 5. TR-10.9.

- **TB-Flow5-001** (exit-4 shape)
  - File: `__tests__/integration/flow5-askuser.test.ts`
  - Verifies: FR-2.16, FR-2.17a, FR-2.17b, FR-2.17c, FR-2.17d, FR-2.17e, FR-2.17f, TR-10.9
  - Description: Subprocess-invoke CheckRunner with `--task 2.1 --manual-prompt-strategy askuser` against a fixture whose first criterion is manual. Expect exit 4; stderr parses as JSON with the five required payload keys (exit_reason, task, criterion, prompt, resume_command); stdout is empty.
  - Fixtures: `integration/project-manual-1x1.json`

- **TB-Flow5-002** (resume with --answer)
  - File: `__tests__/integration/flow5-askuser.test.ts`
  - Verifies: FR-2.18, FR-2.22, FR-2.23a, FR-2.23b, TR-10.9
  - Description: Following TB-Flow5-001, re-invoke CheckRunner with `--task 2.1 --answer "Reviewed and approved"`; expect exit 0, criterion PASS with evidence = the answer trimmed, task advanced.
  - Fixtures: `integration/project-manual-1x1.json`

### 4.6 Tier B.6 — Flow 6: Plan-checksum drift detection

Design ref: design.md §12.2 Flow 6. TR-10.10.

- **TB-Flow6-001**
  - File: `__tests__/integration/flow6-drift.test.ts`
  - Verifies: FR-1.8a, FR-1.8b, FR-2.26, FR-2.34, FR-3.11, FR-5.5c, TR-10.10
  - Description: Init fixture, then directly-edit the fixture to change one criterion's `command` (bypassing StateManager). Three invocations:
    1. `StateManager read` → exit 3 + `E_CHECKSUM_DRIFT` on stderr.
    2. `CheckRunner run` → exit 3, and a spy/log confirms no `updateCriterion` was called.
    3. `PlanGate.hook.ts` stdin = any Bash command → BLOCK with `reason_code: "checksum_drift"`.
  - Fixtures: `integration/drift-project/validation.json`

### 4.7 Tier B.7 — Flow 7: Atomic-write crash simulation

Design ref: design.md §12.2 Flow 7. TR-10.11.

- **TB-Flow7-001**
  - File: `__tests__/integration/flow7-crash.test.ts`
  - Verifies: TR-5.1a, TR-5.1b, TR-5.1c, TR-5.5, TR-10.11
  - Description: Inject a fault between `writeTemp` and `rename` (via a dependency-inverted fs interface whose `renameSync` throws on the second call) during an `update-criterion` subprocess invocation. Verify: on-disk `validation.json` is byte-identical to the pre-write version; a stray `.tmp` file may remain (documenting behaviour) but the atomic target is never half-written.
  - Fixtures: `integration/project-for-crash.json`

### 4.8 Tier B.8 — Flow 8: Pointer lifecycle (scope change 2026-04-21)

Design ref: design.md §7.3 revised; FR-1.38/1.39/1.40, TR-5.8, TR-5.9. New flow added for Phase 3.

- **TB-Flow8-001** (init writes pointer)
  - File: `__tests__/integration/flow8-pointer-lifecycle.test.ts`
  - Verifies: FR-1.38a, FR-1.38b, FR-1.38c, FR-1.38d, TR-5.8
  - Description: In a clean temp `HOME` with no pointer file and no `$HOME/.claude/MEMORY/STATE/` directory, subprocess-invoke `StateManager init` against a project's `validation.json`. Expect the directory to be created, the pointer written atomically (observe `.tmp` filename during a racing read, OR verify the temp file is absent post-write), and the pointer payload to contain the four required keys with appropriate values.
  - Fixtures: `integration/project-for-pointer/validation.json`

- **TB-Flow8-002** (advance on completion deletes pointer)
  - File: `__tests__/integration/flow8-pointer-lifecycle.test.ts`
  - Verifies: FR-1.39a, FR-1.20a, FR-1.36, FR-5.7d
  - Description: Drive the plan to its final task (via successive CheckRunner runs against a minimal 1-phase-1-task-1-criterion fixture). Immediately after the final `advance-task`, the pointer file at `$HOME/.claude/MEMORY/STATE/plan-executor.active.json` is absent; the `plan.task.advanced` event carries `plan_completed: true`.
  - Fixtures: `integration/project-for-pointer-minimal.json`

- **TB-Flow8-003** (phase rollover does NOT delete pointer)
  - File: `__tests__/integration/flow8-pointer-lifecycle.test.ts`
  - Verifies: FR-1.40, FR-1.18a, FR-1.35, FR-5.16
  - Description: In a 2-phase × 1-task-each fixture, drive CheckRunner through phase 1's last task. Expect the pointer to still exist after the phase rollover; the `plan.task.advanced` event has `phase_rolled: true` and NOT `plan_completed: true`.
  - Fixtures: `integration/project-for-pointer-2phase.json`

- **TB-Flow8-004** (pointer-delete failure is non-fatal)
  - File: `__tests__/integration/flow8-pointer-lifecycle.test.ts`
  - Verifies: FR-1.39b, FR-1.39c, TR-5.9
  - Description: Pre-delete the pointer file (or set its directory to read-only) before the final `advance-task`. Invoke the final advance. Expect exit 0, plan status `COMPLETED`, state file written, and a `hook.error` event emitted with a `reason` field equal to `"pointer_already_absent"` (or `"permission_denied"` under the read-only variant).
  - Fixtures: `integration/project-for-pointer-minimal.json`

---

## 5. Cross-cutting integration coverage (CLI/deploy/settings)

Additional integration tests that don't belong to a specific §12.2 flow but are needed for TR-1, TR-2, TR-3, TR-4, TR-9, TR-11 coverage. These are Tier B because they invoke real subprocesses / real filesystem.

### 5.1 CLI conventions

- **TB-CLI-001**
  - File: `__tests__/integration/cli-conventions.test.ts`
  - Verifies: TR-3.1a, TR-3.1b
  - Description: `package.json` and each CLI's source contain zero runtime framework dependencies (no `yargs`, `commander`, `oclif` in dependencies; argv parsing via a hand-written parser module or inline logic). Verified by static inspection.
  - Fixtures: none

- **TB-CLI-002**
  - File: `__tests__/integration/cli-conventions.test.ts`
  - Verifies: TR-3.2a, TR-3.2b, TR-3.3a, TR-3.3b, TR-3.4b
  - Description: Each CLI accepts `--json`, `--verbose`, `--help`, `-h` at the top level and per-subcommand; invoking with `--help` prints usage and exits 0; invoking with an unknown flag exits 1.
  - Fixtures: none

- **TB-CLI-003**
  - File: `__tests__/integration/cli-conventions.test.ts`
  - Verifies: TR-3.5a, TR-3.5b, TR-3.6
  - Description: On any E_* error, stderr contains a line matching `^ERROR: E_[A-Z_]+: .+$` and the E_CODE is drawn from the known set enumerated in design.md §4.1–§4.4 and §6.4; under `--json`, stdout additionally contains `{"ok":false,"error":"E_CODE","message":"..."}`.
  - Fixtures: `canonical-2x2x2-drifted.json`

### 5.2 Exit codes

- **TB-CLI-004**
  - File: `__tests__/integration/exit-codes.test.ts`
  - Verifies: TR-4.1, TR-4.2, TR-4.3, TR-4.4, TR-4.5, TR-4.6
  - Description: Drive each of exit codes 0, 1, 2, 3, 4 from a known scenario (success; `--task 9.9`; simulated I/O error via a read-only state file; drifted fixture; askuser on a manual criterion). Assert no scenario produces an exit code ≥ 5.
  - Fixtures: `canonical-2x2x2-initialized.json`, `canonical-2x2x2-drifted.json`, `manual-criterion-fixture.json`

### 5.3 Deploy topology

- **TB-Deploy-001**
  - File: `__tests__/integration/deploy.test.ts`
  - Verifies: TR-1.1, TR-1.2, TR-1.3, TR-1.4a, TR-1.4b, TR-1.4c, TR-1.5, TR-1.6, TR-1.7, TR-1.8a, TR-1.8b, TR-1.8c, TR-1.9a, TR-1.9b, TR-1.10, TR-1.11, TR-11.1, TR-11.5
  - Description: Run the deploy script against a temp `HOME`. Assert the three deployed files exist at the stated absolute paths with Title-Case/`.hook.ts` filenames, are executable (mode bit), begin with the `#!/usr/bin/env bun` shebang line byte-for-byte, contain inlined `lib/*` and `handlers/*` content (no outbound `import` from `./lib/` or `./handlers/` in the deployed file), and that no subdirectory or `PlanGateHandler.ts` exists under `~/.claude/PAI/Tools/` or `~/.claude/hooks/` respectively. `bun <path> --help` on each CLI returns synchronously.
  - Fixtures: none (builds the repo and invokes deploy)

- **TB-Deploy-002**
  - File: `__tests__/integration/deploy.test.ts`
  - Verifies: TR-1.12, TR-11.2, TR-11.3
  - Description: `tsconfig.json` has `"strict": true` and includes `"bun-types"` in `types`; a note in test output states that `settings.json` edits require Claude Code restart (verified indirectly by asserting the deploy script's docs/README step mentions the restart requirement).
  - Fixtures: none

### 5.4 settings.json registration

- **TB-Settings-001**
  - File: `__tests__/integration/settings.test.ts`
  - Verifies: TR-2.1, TR-2.2, TR-2.3, TR-2.4a, TR-2.4b, TR-2.4c, TR-2.5, TR-2.6, TR-2.7, TR-2.8, TR-2.9, TR-2.10
  - Description: Starting from a fixture `settings.json` containing only `SecurityValidator.hook.ts` entries, run the registration script. Assert the edit: adds `PlanGate.hook.ts` PreToolUse entries on `Bash`, `Edit`, `Write`; on each matcher `SecurityValidator.hook.ts` appears before `PlanGate.hook.ts`; `SecurityValidator.hook.ts` is not removed; the command template is `${PAI_DIR}/hooks/PlanGate.hook.ts`; `Read`/`AskUserQuestion`/`Task`/`Skill` matchers unchanged; file is valid JSON; no entry is duplicated (running the script twice produces the same output as running it once).
  - Fixtures: `integration/settings-fixture.json`

### 5.5 Documentation

- **TB-Docs-001**
  - File: `__tests__/integration/docs.test.ts`
  - Verifies: TR-9.1, TR-9.2, TR-9.3a, TR-9.3b, TR-9.3c, TR-9.3d, TR-9.3e, TR-9.4, TR-9.5a, TR-9.5b
  - Description: Run the docs-registration step against a temp `~/.claude/PAI/TOOLS.md`. Assert: both new sections exist with the exact title strings; each has the required subsections (Location, Usage, When to Use, Technical Details; CheckRunner additionally Environment Variables listing `CHECKRUNNER_TIMEOUT_MS`); the deployed absolute path appears verbatim; `SKILL.md` indexes `TOOLS.md`.
  - Fixtures: `integration/tools-md-fixture.md`, `integration/skill-md-fixture.md`

### 5.6 Test scaffolding

- **TB-Scaffold-001**
  - File: `__tests__/integration/scaffold.test.ts`
  - Verifies: TR-11.4
  - Description: Running `bun test` from the repo root discovers and executes every `__tests__/**/*.test.ts` file; zero non-bun test runners are invoked.
  - Fixtures: none

---

## 6. Negative tests for Anti-Requirements

One dedicated negative test (or negative-test series) per AR. A negative test fails (asserts non-compliance is present) exactly when the anti-requirement is violated; when the code is correct, the test passes. Each entry below is phrased as "the test fails iff ...".

- **TN-AR1-001**
  - File: `__tests__/negative/ar01-validation-write-blocked.test.ts`
  - Verifies (negatively): AR-1
  - Description: The test fails iff a `Write` or `Edit` to `pointer.validation_path` is ALLOWED by `PlanGateHandler.decide` under any `task.status`. Runs the decision function for six combinations (Write/Edit × PENDING/IN_PROGRESS/PASS) and asserts all six return BLOCK with `reason_code: "state_file_write_attempt"`.
  - Fixtures: `pg-state-pending.json`, `pg-state-in-progress.json`, `pg-state-pass.json`, `pg-pointer.json`

- **TN-AR2-001**
  - File: `__tests__/negative/ar02-checksum-not-prose.test.ts`
  - Verifies (negatively): AR-2
  - Description: The test fails iff modifying `implementation-plan.md` content changes the computed plan checksum. Instantiate a state + a different on-disk `implementation-plan.md`; compute checksum twice (identical states, different prose files); assert the checksums are equal. Also assert (static): `computePlanChecksum` source does not import or read any path containing `implementation-plan`.
  - Fixtures: `canonical-2x2x2.json`, two prose files

- **TN-AR3-001**
  - File: `__tests__/negative/ar03-no-skip-checksum.test.ts`
  - Verifies (negatively): AR-3
  - Description: The test fails iff any `readState` path exists that does not recompute + compare the checksum. Invoke `readState` on a drifted fixture via every code path that reaches it (direct import, `read` subcommand, CheckRunner, PlanGate) and assert every one raises `ChecksumError`.
  - Fixtures: `canonical-2x2x2-drifted.json`

- **TN-AR4-001**
  - File: `__tests__/negative/ar04-fail-closed-malformed.test.ts`
  - Verifies (negatively): AR-4
  - Description: The test fails iff `decide` returns ALLOW on malformed state when an active-plan pointer is present. Load a fixture with a pointer + malformed JSON state; invoke `decide` with a Bash tool call; assert BLOCK with `reason_code: "state_malformed"`.
  - Fixtures: `pg-state-malformed.json`, `pg-pointer.json`

- **TN-AR5-001**
  - File: `__tests__/negative/ar05-no-env-secret-allowlist.test.ts`
  - Verifies (negatively): AR-5, TR-8.4
  - Description: The test fails iff the allow-list match consults any env var. Spy/hook on `process.env` reads inside `decide` during an allow-listed Bash decision; assert the spy records zero env reads for allow-list-relevant keys (excluding `HOME` expansion, which goes through `realpath`/`os.homedir` — verified separately).
  - Fixtures: `pg-pointer.json`

- **TN-AR6-001**
  - File: `__tests__/negative/ar06-no-subprocess.test.ts`
  - Verifies (negatively): AR-6, FR-2.28
  - Description: The test fails iff CheckRunner spawns StateManager as a subprocess. Spy on `Bun.spawn`/`child_process.spawn` during a CheckRunner run; assert no spawned process's argv[0] or argv[1] resolves to `StateManager.ts`.
  - Fixtures: `canonical-2x2x2-initialized.json`

- **TN-AR7-001**
  - File: `__tests__/negative/ar07-atomic-required.test.ts`
  - Verifies (negatively): AR-7, TR-5.1a, TR-5.1c, TR-5.4
  - Description: The test fails iff `writeState` writes directly to the target without going through temp + fsync + rename. Spy on `fs.writeSync`/`fs.writeFileSync`/`fs.openSync`/`fs.renameSync`/`fs.fsyncSync` during a write; assert the call sequence: open(target.tmp) → write → fsync(fd) → rename(tmp, target). Any direct `writeFileSync(target, ...)` path fails the test.
  - Fixtures: `canonical-2x2x2.json`

- **TN-AR8-001**
  - File: `__tests__/negative/ar08-hook-uses-readhookinput.test.ts`
  - Verifies (negatively): AR-8, FR-3.2, TR-6.1
  - Description: The test fails iff `src/PlanGate.hook.ts` (or its deployed form) implements its own stdin parsing. AST inspection asserts the file imports `readHookInput` from `hook-io.ts` and does not invoke `process.stdin.on("data", ...)` directly or read raw stdin bytes.
  - Fixtures: none

- **TN-AR9-001**
  - File: `__tests__/negative/ar09-no-prompt-in-statemanager.test.ts`
  - Verifies (negatively): AR-9
  - Description: The test fails iff `src/StateManager.ts` or any file under `src/lib/state-*.ts` contains `process.stdin.*` reads or prompt-emission strings (`MANUAL:` prefix, `would prompt:` prefix). AST + regex scan.
  - Fixtures: none

- **TN-AR10-001**
  - File: `__tests__/negative/ar10-no-fail-exit-zero.test.ts`
  - Verifies (negatively): AR-10, FR-2.23a, FR-2.23b
  - Description: The test fails iff CheckRunner exits 0 on a scenario with at least one FAIL. Run three fixtures (one with a failing automated criterion; one with a failing manual criterion under stdin; one with a system error). Assert the observed exit codes are 1, 1, 2 respectively — never 0.
  - Fixtures: `canonical-task-one-criterion-fails.json`, `manual-criterion-fixture.json`

- **TN-AR11-001**
  - File: `__tests__/negative/ar11-help-everywhere.test.ts`
  - Verifies (negatively): AR-11, FR-1.26, FR-1.27, TR-3.4a, TR-3.4b
  - Description: The test fails iff any top-level or subcommand invocation of `--help` (or `-h`) on either CLI exits non-zero or produces empty stdout. Iterates StateManager's seven subcommands and CheckRunner's one subcommand, plus the two top-level binaries.
  - Fixtures: none

- **TN-AR12-001**
  - File: `__tests__/negative/ar12-no-plan-allow.test.ts`
  - Verifies (negatively): AR-12, BR-12, FR-3.3
  - Description: The test fails iff PlanGate ever BLOCKs when no pointer file is present. With pointer absent, invoke `decide` with each of Bash / Edit / Write stdin payloads across PENDING / IN_PROGRESS / PASS-like states (though state is not read without a pointer); assert every invocation returns ALLOW and produces no `plan.gate.*` event.
  - Fixtures: none (no pointer)

  **Distinct from TN-AR12-002 below:** AR-12 is the no-pointer fail-open case. FR-3.4a/b is the pointer-present-but-unresolvable fail-open case — a different fail-open trigger that MUST still emit a `hook.error` event.

- **TN-AR12-002** (FR-3.4 fail-open — pointer stale)
  - File: `__tests__/negative/ar12-pointer-stale-allow.test.ts`
  - Verifies (negatively): FR-3.4a, FR-3.4b
  - Description: The test fails iff `decide` BLOCKs (rather than ALLOWs) when the pointer file exists but `pointer.validation_path` does not resolve on disk, OR if no `hook.error` event is emitted in that case. Distinct from TN-AR12-001 because this case has a pointer present — the fail-open happens at a different check.
  - Fixtures: `pointer-stale.json`

- **TN-AR13-001**
  - File: `__tests__/negative/ar13-block-on-stdout.test.ts`
  - Verifies (negatively): AR-13, FR-3.12e
  - Description: The test fails iff PlanGate's block output appears on stderr instead of stdout. Capture both streams on a forced BLOCK subprocess invocation; assert stdout contains the `hookSpecificOutput` JSON and stderr is empty (modulo optional debug lines, excluded by channel check).
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

- **TN-AR14-001**
  - File: `__tests__/negative/ar14-exit-zero-always.test.ts`
  - Verifies (negatively): AR-14, FR-3.21, TR-6.5
  - Description: The test fails iff `PlanGate.hook.ts` returns a non-zero exit code on any decision path. Invoke the hook on ALLOW, BLOCK (each of four `reason_code`s), and state-malformed; assert exit code is 0 in every case.
  - Fixtures: `pg-state-pending.json`, `pg-state-pass.json`, `pg-state-drifted.json`, `pg-state-malformed.json`, `pg-pointer.json`

- **TN-AR15-001**
  - File: `__tests__/negative/ar15-no-askuser-in-checkrunner.test.ts`
  - Verifies (negatively): AR-15
  - Description: The test fails iff CheckRunner's source code (or deployed form) invokes the `AskUserQuestion` tool/API. AST + regex scan for any symbol named `AskUserQuestion` or any message with `tool: "AskUserQuestion"`. Must find zero hits in CheckRunner and its deployed form.
  - Fixtures: none

- **TN-AR16-001**
  - File: `__tests__/negative/ar16-no-events-without-pointer.test.ts`
  - Verifies (negatively): AR-16, FR-5.11
  - Description: The test fails iff any event is written when the pointer is absent. Invoke `appendEvent`, StateManager operations, and a CheckRunner dry-run run with pointer absent; assert no `events.jsonl` file is created anywhere and `appendEvent` returns without side effect.
  - Fixtures: none

- **TN-AR17-001**
  - File: `__tests__/negative/ar17-state-not-in-checksum.test.ts`
  - Verifies (negatively): AR-17, FR-4.3a, FR-4.3b, FR-4.3c, FR-4.12
  - Description: The test fails iff flipping any of `status`, `evidence`, `verified_at`, `fix_attempts` in the source state changes the checksum. Compute the checksum of the canonical fixture; then mutate each of the four fields in turn and recompute; assert all five checksums are equal.
  - Fixtures: `canonical-2x2x2.json`, `canonical-2x2x2-mixed-statuses.json`

- **TN-AR18-001**
  - File: `__tests__/negative/ar18-no-new-toplevel-fields.test.ts`
  - Verifies (negatively): AR-18, FR-1.30a
  - Description: The test fails iff `writeState` produces a top-level field set that is a superset of the input's top-level field set (newly authored fields). Round-trip several fixtures through `readState` → `updateCriterion` → `writeState`; assert `Object.keys(output) ⊆ Object.keys(input) ∪ {"plan_checksum", "initialized"}` (the two StateManager does author, scoped in design.md §4.1). Any other new key fails the test.
  - Fixtures: `canonical-2x2x2-with-unknown-toplevel.json`

- **TN-AR19-001**
  - File: `__tests__/negative/ar19-hook-read-only.test.ts`
  - Verifies (negatively): AR-19, FR-3.16c
  - Description: The test fails iff `PlanGateHandler.decide` invokes any StateManager write operation (`writeState`, `initState`, `updateCriterion`, `advanceTask`). Spy on the four symbols during 24 decide invocations (the condensed table); assert zero calls. AST inspection also asserts the handler file does not import these symbols from StateManager.
  - Fixtures: `pg-state-pending.json`, `pg-pointer.json`

- **TN-AR20-001**
  - File: `__tests__/negative/ar20-pretooluse-only.test.ts`
  - Verifies (negatively): AR-20, FR-3.1a, FR-3.1b, FR-3.1c
  - Description: The test fails iff `settings.json` after registration contains any PostToolUse entry referencing `PlanGate.hook.ts`. Scan every hook group in the JSON; assert `PlanGate.hook.ts` appears only under `PreToolUse`.
  - Fixtures: `integration/settings-after-registration.json`

- **TN-AR21-001**
  - File: `__tests__/negative/ar21-no-tier-c.test.ts`
  - Verifies (negatively): AR-21
  - Description: The test fails iff any file under `__tests__/` imports an LLM-as-judge dependency (e.g., `anthropic`, `@anthropic-ai/sdk`, `openai`) or references `Tier C` as a test-tier tag in its name or body. AST + path scan. Also asserts that `docs/test-plan.md` (this file) contains the phrase "no Tier C" at least once and contains no `## Tier C` heading.
  - Fixtures: none (scans the test tree and this document)

---

## 7. Coverage matrix

**Attestation.** I extracted the complete set of FR / TR / AR IDs from `docs/requirements-hardened.md` (enumerated in the §Hardening changelog and the body of sections FR-1 through FR-5, TR-1 through TR-11, and AR-1 through AR-21). I verified — by grepping the finalised test plan and cross-checking against the extracted ID set — that every FR, every TR, and every AR appears at least once in the `Verifies` field of a test entry (FR/TR) or in the `Verifies (negatively)` field of a negative-test entry (AR). No gaps.

**How to read the matrix.** Each requirement row lists every test that covers it. Multiple-test rows indicate a requirement exercised from several angles (unit + integration, or decision-table cell + event-emission side-effect). BR-N rows are aggregate and intentionally not mapped directly per the Task 3.1 briefing ("BRs are aggregate and don't need direct test mapping") — each BR is satisfied transitively through its downstream FRs/TRs, all of which are covered.

### 7.1 FR coverage

| Requirement | Tests |
|---|---|
| FR-1.1a | TA-StateManager-001 |
| FR-1.1b | TA-StateManager-001 |
| FR-1.1c | TA-StateManager-001 |
| FR-1.2a | TA-StateManager-002 |
| FR-1.2b | TA-StateManager-002 |
| FR-1.3a | TA-StateManager-003 |
| FR-1.3b | TA-StateManager-003 |
| FR-1.4 | TA-StateManager-006 |
| FR-1.5 | TA-StateManager-006 |
| FR-1.6 | TA-StateManager-007 |
| FR-1.7 | TA-StateManager-008 |
| FR-1.8a | TA-StateManager-009, TB-Flow6-001 |
| FR-1.8b | TA-StateManager-009, TB-Flow6-001 |
| FR-1.8c | TA-StateManager-010 |
| FR-1.9 | TA-StateManager-011 |
| FR-1.10a | TA-StateManager-012 |
| FR-1.10b | TA-StateManager-013 |
| FR-1.11 | TA-StateManager-014, TB-Flow2-001 |
| FR-1.12a | TA-StateManager-015 |
| FR-1.12b | TA-StateManager-016 |
| FR-1.13 | TA-StateManager-017 |
| FR-1.14a | TA-StateManager-018 |
| FR-1.14b | TA-StateManager-019 |
| FR-1.15a | TA-StateManager-022, TB-Flow1-001 |
| FR-1.15b | TA-StateManager-022, TB-Flow1-001, TB-Flow4-001 |
| FR-1.16a | TA-StateManager-023, TB-Flow1-001 |
| FR-1.16b | TA-StateManager-023, TB-Flow1-001 |
| FR-1.17a | TA-StateManager-024, TB-Flow1-001 |
| FR-1.17b | TA-StateManager-024 |
| FR-1.18a | TA-StateManager-025, TB-Flow1-001, TB-Flow8-003 |
| FR-1.18b | TA-StateManager-025, TB-Flow1-001 |
| FR-1.19 | TA-StateManager-025, TB-Flow1-001 |
| FR-1.20a | TA-StateManager-026, TB-Flow1-001, TB-Flow8-002 |
| FR-1.20b | TA-StateManager-026 |
| FR-1.21a | TA-StateManager-027 |
| FR-1.21b | TA-StateManager-027 |
| FR-1.21c | TA-StateManager-027 |
| FR-1.21d | TA-StateManager-028 |
| FR-1.22 | TA-StateManager-035 |
| FR-1.23 | TA-StateManager-035 |
| FR-1.24a | TA-StateManager-036 |
| FR-1.24b | TA-StateManager-036 |
| FR-1.24c | TA-StateManager-037 |
| FR-1.24d | TA-StateManager-037 |
| FR-1.24e | TA-StateManager-037 |
| FR-1.24f | TA-StateManager-038 |
| FR-1.25 | TA-StateManager-039 |
| FR-1.26 | TA-StateManager-040, TN-AR11-001 |
| FR-1.27 | TA-StateManager-040, TN-AR11-001 |
| FR-1.28a | TA-StateManager-041 |
| FR-1.28b | TA-StateManager-041 |
| FR-1.28c | TA-StateManager-001, TA-StateManager-041 |
| FR-1.28d | TA-StateManager-041 |
| FR-1.28e | TA-StateManager-011, TA-StateManager-041 |
| FR-1.28f | TA-StateManager-022, TA-StateManager-041 |
| FR-1.28g | TA-StateManager-041 |
| FR-1.28h | TA-StateManager-042 |
| FR-1.28i | TA-StateManager-042 |
| FR-1.28j | TA-StateManager-043 |
| FR-1.28k | TA-StateManager-009 |
| FR-1.29a | TA-StateManager-020 |
| FR-1.29b | TA-StateManager-029 |
| FR-1.29c | TA-StateManager-020 |
| FR-1.29d | TA-StateManager-029 |
| FR-1.30a | TA-StateManager-044, TN-AR18-001 |
| FR-1.30b | TA-StateManager-045 |
| FR-1.30c | TA-StateManager-046 |
| FR-1.30d | TA-StateManager-038 |
| FR-1.31 | TA-StateManager-047 |
| FR-1.32 | TA-StateManager-002 |
| FR-1.33 | TA-StateManager-036 |
| FR-1.34 | TA-StateManager-030, TB-Flow1-001 |
| FR-1.35 | TA-StateManager-031 |
| FR-1.36 | TA-StateManager-032, TB-Flow8-002 |
| FR-1.37 | TA-StateManager-021 |
| FR-1.38a | TA-StateManager-004, TB-Flow8-001 |
| FR-1.38b | TA-StateManager-004, TA-StateManager-005, TB-Flow8-001 |
| FR-1.38c | TA-StateManager-004, TB-Flow8-001 |
| FR-1.38d | TA-StateManager-004, TB-Flow8-001 |
| FR-1.39a | TA-StateManager-033, TB-Flow8-002 |
| FR-1.39b | TA-StateManager-034, TB-Flow8-004 |
| FR-1.39c | TA-StateManager-034, TB-Flow8-004 |
| FR-1.40 | TA-StateManager-033, TB-Flow8-003 |
| FR-2.1 | TA-CheckRunner-001, TB-Flow1-001 |
| FR-2.2 | TA-CheckRunner-002, TB-Flow1-001 |
| FR-2.3 | TA-CheckRunner-003, TB-Flow1-001 |
| FR-2.4 | TA-CheckRunner-004, TB-Flow1-001 |
| FR-2.5a | TA-CheckRunner-005 |
| FR-2.5b | TA-CheckRunner-005 |
| FR-2.6 | TA-CheckRunner-005 |
| FR-2.7a | TA-CheckRunner-006 |
| FR-2.7b | TA-CheckRunner-006 |
| FR-2.7c | TA-CheckRunner-006 |
| FR-2.8a | TA-CheckRunner-007, TB-Flow2-001 |
| FR-2.8b | TA-CheckRunner-007, TB-Flow2-001 |
| FR-2.8c | TA-CheckRunner-007, TB-Flow2-001 |
| FR-2.9 | TA-CheckRunner-008 |
| FR-2.10 | TA-CheckRunner-009 |
| FR-2.11a | TA-CheckRunner-010, TB-Flow2-001 |
| FR-2.11b | TA-CheckRunner-010, TB-Flow2-001 |
| FR-2.11c | TA-CheckRunner-010, TB-Flow2-001 |
| FR-2.12 | TA-CheckRunner-011, TB-Flow4-001 |
| FR-2.13 | TA-CheckRunner-012, TB-Flow4-001 |
| FR-2.14 | TA-CheckRunner-013 |
| FR-2.15 | TA-CheckRunner-014, TB-Flow4-001 |
| FR-2.16 | TA-CheckRunner-015, TB-Flow5-001 |
| FR-2.17a | TA-CheckRunner-015, TB-Flow5-001 |
| FR-2.17b | TA-CheckRunner-016, TB-Flow5-001 |
| FR-2.17c | TA-CheckRunner-016, TB-Flow5-001 |
| FR-2.17d | TA-CheckRunner-016, TB-Flow5-001 |
| FR-2.17e | TA-CheckRunner-016, TB-Flow5-001 |
| FR-2.17f | TA-CheckRunner-016, TB-Flow5-001 |
| FR-2.18 | TA-CheckRunner-017, TB-Flow5-002 |
| FR-2.19 | TA-CheckRunner-021 |
| FR-2.20 | TA-CheckRunner-021 |
| FR-2.21a | TA-CheckRunner-022 |
| FR-2.21b | TA-CheckRunner-022 |
| FR-2.21c | TA-CheckRunner-023 |
| FR-2.22 | TA-CheckRunner-025, TB-Flow1-001, TB-Flow4-001, TB-Flow5-002 |
| FR-2.23a | TA-CheckRunner-026, TB-Flow1-001, TB-Flow5-002, TN-AR10-001 |
| FR-2.23b | TA-CheckRunner-026, TB-Flow1-001, TB-Flow5-002, TN-AR10-001 |
| FR-2.24 | TA-CheckRunner-027, TB-Flow2-001 |
| FR-2.25 | TA-CheckRunner-028 |
| FR-2.26 | TA-CheckRunner-029, TB-Flow6-001 |
| FR-2.27a | TA-CheckRunner-030 |
| FR-2.27b | TA-CheckRunner-030 |
| FR-2.28 | TA-CheckRunner-031, TN-AR6-001 |
| FR-2.29 | TA-CheckRunner-028 |
| FR-2.30 | TA-CheckRunner-018 |
| FR-2.31 | TA-CheckRunner-019, TB-Flow4-001 |
| FR-2.32 | TA-CheckRunner-020 |
| FR-2.33 | TA-CheckRunner-024 |
| FR-2.34 | TA-CheckRunner-029, TB-Flow6-001 |
| FR-2.35 | TA-CheckRunner-030 |
| FR-3.1a | TA-PlanGate-002, TB-Flow3-002, TB-Flow3-003, TN-AR20-001 |
| FR-3.1b | TA-PlanGate-002, TB-Flow3-004, TN-AR20-001 |
| FR-3.1c | TA-PlanGate-002, TB-Flow3-001, TN-AR20-001 |
| FR-3.2 | TA-PlanGate-003, TN-AR8-001 |
| FR-3.3 | TA-PlanGate-004, TN-AR12-001 |
| FR-3.4a | TA-PlanGate-005, TN-AR12-002 |
| FR-3.4b | TA-PlanGate-005, TN-AR12-002 |
| FR-3.5a | TA-PlanGate-001, TB-Flow3-001, TN-AR1-001 |
| FR-3.5b | TA-PlanGate-001, TN-AR1-001 |
| FR-3.5c | TA-PlanGate-001, TN-AR1-001 |
| FR-3.6 | TA-PlanGate-001 |
| FR-3.7 | TA-PlanGate-001, TB-Flow3-003 |
| FR-3.8a | TA-PlanGate-001, TB-Flow3-002 |
| FR-3.9a | TA-PlanGate-001 |
| FR-3.9b | TA-PlanGate-001 |
| FR-3.10a | TA-PlanGate-001 |
| FR-3.10b | TA-PlanGate-001, TB-Flow3-004 |
| FR-3.10c | TA-PlanGate-001 |
| FR-3.11 | TA-PlanGate-010, TB-Flow6-001 |
| FR-3.12a | TA-PlanGate-007, TB-Flow3-001 |
| FR-3.12b | TA-PlanGate-007, TB-Flow3-001 |
| FR-3.12c | TA-PlanGate-007, TB-Flow3-001 |
| FR-3.12d | TA-PlanGate-007, TB-Flow3-001 |
| FR-3.12e | TA-PlanGate-007, TB-Flow3-001, TN-AR13-001 |
| FR-3.13 | TA-PlanGate-008 |
| FR-3.14a | TA-PlanGate-009 |
| FR-3.14b | TA-PlanGate-009 |
| FR-3.14c | TA-PlanGate-009 |
| FR-3.15 | TA-PlanGate-012 |
| FR-3.16a | TA-PlanGate-012 |
| FR-3.16b | TA-PlanGate-012 |
| FR-3.16c | TA-PlanGate-012, TN-AR19-001 |
| FR-3.17 | TA-PlanGate-014 |
| FR-3.18 | TA-PlanGate-016, TB-Flow3-003 |
| FR-3.19 | TA-PlanGate-017 |
| FR-3.20 | TA-PlanGate-001, TA-PlanGate-017, TB-Flow3-002 |
| FR-3.21 | TA-PlanGate-015, TN-AR14-001 |
| FR-3.22 | TA-PlanGate-011, TN-AR4-001 |
| FR-3.23 | TA-PlanGate-006 |
| FR-3.24 | TA-PlanGate-009 |
| FR-3.25 | TA-PlanGate-012 |
| FR-3.26 | TA-PlanGate-013 |
| FR-4.1a | TA-Checksum-001 |
| FR-4.1b | TA-Checksum-002 |
| FR-4.1c | TA-Checksum-002 |
| FR-4.2a | TA-Checksum-003 |
| FR-4.2b | TA-Checksum-003 |
| FR-4.2c | TA-Checksum-004 |
| FR-4.2d | TA-Checksum-004 |
| FR-4.3a | TA-Checksum-005, TN-AR17-001 |
| FR-4.3b | TA-Checksum-005, TN-AR17-001 |
| FR-4.3c | TA-Checksum-005, TN-AR17-001 |
| FR-4.4a | TA-Checksum-007 |
| FR-4.4b | TA-Checksum-007 |
| FR-4.4c | TA-Checksum-007 |
| FR-4.5 | TA-Checksum-002 |
| FR-4.6a | TA-Checksum-001 |
| FR-4.6b | TA-Checksum-001 |
| FR-4.7 | TA-Checksum-007 |
| FR-4.8 | TA-Checksum-008 |
| FR-4.9a | TA-Checksum-009 |
| FR-4.9b | TA-Checksum-010 |
| FR-4.9c | TA-Checksum-010 |
| FR-4.10 | TA-Checksum-012 |
| FR-4.11 | TA-Checksum-006 |
| FR-4.12 | TA-Checksum-005, TN-AR17-001 |
| FR-4.13 | TA-Checksum-007 |
| FR-4.14 | TA-Checksum-011 |
| FR-5.1 | TA-EventEmitter-001 |
| FR-5.2 | TA-EventEmitter-001 |
| FR-5.3 | TA-EventEmitter-002 |
| FR-5.4a | TA-EventEmitter-003 |
| FR-5.4b | TA-EventEmitter-003 |
| FR-5.5a | TA-PlanGate-017, TB-Flow3-002 |
| FR-5.5b | TA-PlanGate-017, TB-Flow3-002 |
| FR-5.5c | TA-PlanGate-017, TB-Flow3-002, TB-Flow6-001 |
| FR-5.5d | TA-PlanGate-017 |
| FR-5.6a | TA-PlanGate-016 |
| FR-5.6b | TA-PlanGate-016 |
| FR-5.7a | TA-StateManager-030, TB-Flow1-001 |
| FR-5.7b | TA-StateManager-030, TB-Flow1-001 |
| FR-5.7c | TA-StateManager-031, TB-Flow1-002 |
| FR-5.7d | TA-StateManager-032, TB-Flow1-002, TB-Flow8-002 |
| FR-5.8a | TA-CheckRunner-019, TB-Flow1-002 |
| FR-5.8b | TA-CheckRunner-019, TB-Flow1-002 |
| FR-5.8c | TA-CheckRunner-019, TB-Flow1-002 |
| FR-5.9a | TA-CheckRunner-020, TB-Flow2-001 |
| FR-5.9b | TA-CheckRunner-020, TB-Flow2-001 |
| FR-5.9c | TB-Flow2-001 |
| FR-5.9d | TA-CheckRunner-020, TB-Flow2-001 |
| FR-5.10 | TA-EventEmitter-004 |
| FR-5.11 | TA-EventEmitter-005, TN-AR16-001 |
| FR-5.12 | TA-EventEmitter-006 |
| FR-5.13 | TA-EventEmitter-007, TB-Flow1-002 |
| FR-5.14 | TA-EventEmitter-008, TB-Flow1-002 |
| FR-5.15 | TA-CheckRunner-020 |
| FR-5.16 | TA-StateManager-031, TB-Flow8-003 |
| FR-5.17 | TA-PlanGate-017 |

### 7.2 TR coverage

| Requirement | Tests |
|---|---|
| TR-1.1 | TB-Deploy-001 |
| TR-1.2 | TB-Deploy-001 |
| TR-1.3 | TB-Deploy-001 |
| TR-1.4a | TB-Deploy-001 |
| TR-1.4b | TB-Deploy-001 |
| TR-1.4c | TB-Deploy-001 |
| TR-1.5 | TB-Deploy-001 |
| TR-1.6 | TB-Deploy-001 |
| TR-1.7 | TB-Deploy-001 |
| TR-1.8a | TB-Deploy-001 |
| TR-1.8b | TB-Deploy-001 |
| TR-1.8c | TB-Deploy-001 |
| TR-1.9a | TB-Deploy-001 |
| TR-1.9b | TB-Deploy-001 |
| TR-1.10 | TB-Deploy-001 |
| TR-1.11 | TB-Deploy-001 |
| TR-1.12 | TB-Deploy-002 |
| TR-2.1 | TB-Settings-001 |
| TR-2.2 | TB-Settings-001 |
| TR-2.3 | TB-Settings-001 |
| TR-2.4a | TB-Settings-001 |
| TR-2.4b | TB-Settings-001 |
| TR-2.4c | TB-Settings-001 |
| TR-2.5 | TB-Settings-001 |
| TR-2.6 | TB-Settings-001 |
| TR-2.7 | TB-Settings-001 |
| TR-2.8 | TB-Settings-001 |
| TR-2.9 | TB-Settings-001 |
| TR-2.10 | TB-Settings-001 |
| TR-3.1a | TB-CLI-001 |
| TR-3.1b | TB-CLI-001 |
| TR-3.2a | TB-CLI-002 |
| TR-3.2b | TB-CLI-002 |
| TR-3.3a | TB-CLI-002 |
| TR-3.3b | TB-CLI-002 |
| TR-3.4a | TA-StateManager-040, TN-AR11-001 |
| TR-3.4b | TB-CLI-002, TN-AR11-001 |
| TR-3.5a | TB-CLI-003 |
| TR-3.5b | TB-CLI-003 |
| TR-3.6 | TB-CLI-003 |
| TR-4.1 | TB-CLI-004 |
| TR-4.2 | TB-CLI-004 |
| TR-4.3 | TB-CLI-004 |
| TR-4.4 | TB-CLI-004 |
| TR-4.5 | TB-CLI-004 |
| TR-4.6 | TB-CLI-004 |
| TR-5.1a | TA-StateManager-048, TB-Flow7-001, TN-AR7-001 |
| TR-5.1b | TA-StateManager-048, TB-Flow7-001 |
| TR-5.1c | TA-StateManager-048, TB-Flow7-001, TN-AR7-001 |
| TR-5.2 | TA-StateManager-048 |
| TR-5.3 | TA-StateManager-049 |
| TR-5.4 | TA-StateManager-050, TN-AR7-001 |
| TR-5.5 | TA-StateManager-051, TB-Flow7-001 |
| TR-5.6 | TA-StateManager-050 |
| TR-5.7 | TA-StateManager-049 |
| TR-5.8 | TA-StateManager-004, TB-Flow8-001 |
| TR-5.9 | TA-StateManager-033, TA-StateManager-034, TB-Flow8-004 |
| TR-6.1 | TA-PlanGate-003, TN-AR8-001 |
| TR-6.2 | TA-PlanGate-003 |
| TR-6.3 | TA-PlanGate-007, TB-Flow3-001 |
| TR-6.4 | TA-PlanGate-008 |
| TR-6.5 | TA-PlanGate-015, TN-AR14-001 |
| TR-6.6 | TA-PlanGate-012 |
| TR-6.7 | TA-PlanGate-003 |
| TR-7.1 | TA-StateManager-052 |
| TR-7.2 | TA-StateManager-052 |
| TR-7.3 | TA-EventEmitter-009 |
| TR-7.4 | TA-StateManager-052 |
| TR-7.5 | TA-EventEmitter-009 |
| TR-7.6 | TA-StateManager-052 |
| TR-7.7 | TA-CheckRunner-031 |
| TR-7.8 | TA-PlanGate-012 |
| TR-7.9 | TA-StateManager-052 |
| TR-7.10 | TA-PlanGate-012 |
| TR-8.1a | TA-PlanGate-018 |
| TR-8.1b | TA-PlanGate-018 |
| TR-8.2a | TA-PlanGate-019 |
| TR-8.2b | TA-PlanGate-019 |
| TR-8.3 | TA-PlanGate-020 |
| TR-8.4 | TA-PlanGate-023, TN-AR5-001 |
| TR-8.5 | TA-PlanGate-021 |
| TR-8.6 | TA-PlanGate-022 |
| TR-8.7 | TA-PlanGate-018 |
| TR-8.8 | TA-PlanGate-023 |
| TR-9.1 | TB-Docs-001 |
| TR-9.2 | TB-Docs-001 |
| TR-9.3a | TB-Docs-001 |
| TR-9.3b | TB-Docs-001 |
| TR-9.3c | TB-Docs-001 |
| TR-9.3d | TB-Docs-001 |
| TR-9.3e | TB-Docs-001 |
| TR-9.4 | TB-Docs-001 |
| TR-9.5a | TB-Docs-001 |
| TR-9.5b | TB-Docs-001 |
| TR-10.1 | TA-StateManager-041, TA-StateManager-042, TA-StateManager-043 |
| TR-10.2a | TA-CheckRunner-006, TA-CheckRunner-007, TA-CheckRunner-008 |
| TR-10.2b | TA-CheckRunner-009, TA-CheckRunner-010 |
| TR-10.2c | TA-CheckRunner-012, TA-CheckRunner-013, TA-CheckRunner-014 |
| TR-10.2d | TA-CheckRunner-021 |
| TR-10.2e | TA-CheckRunner-015, TA-CheckRunner-016 |
| TR-10.3a | TA-PlanGate-001 |
| TR-10.3b | TA-PlanGate-001 |
| TR-10.4 | TA-StateManager-044 |
| TR-10.5 | TB-Flow1-001 |
| TR-10.6 | TB-Flow2-001 |
| TR-10.7 | TB-Flow3-001, TB-Flow3-002, TB-Flow3-003, TB-Flow3-004 |
| TR-10.8 | TB-Flow4-001 |
| TR-10.9 | TB-Flow5-001, TB-Flow5-002 |
| TR-10.10 | TB-Flow6-001 |
| TR-10.11 | TB-Flow7-001 |
| TR-10.12 | self-referential — this matrix is the evidence; every FR and TR appears ≥1× above |
| TR-10.13 | self-referential — the §6 negative-test section has one entry per AR (§7.3 below) |
| TR-11.1 | TB-Deploy-001 |
| TR-11.2 | TB-Deploy-002 |
| TR-11.3 | TB-Deploy-002 |
| TR-11.4 | TB-Flow1-002, TB-Scaffold-001 |
| TR-11.5 | TB-Deploy-001 |

### 7.3 AR coverage

| Requirement | Negative test |
|---|---|
| AR-1 | TN-AR1-001 |
| AR-2 | TN-AR2-001 |
| AR-3 | TN-AR3-001 |
| AR-4 | TN-AR4-001 |
| AR-5 | TN-AR5-001 |
| AR-6 | TN-AR6-001 |
| AR-7 | TN-AR7-001 |
| AR-8 | TN-AR8-001 |
| AR-9 | TN-AR9-001 |
| AR-10 | TN-AR10-001 |
| AR-11 | TN-AR11-001 |
| AR-12 | TN-AR12-001 (no-pointer fail-open) and TN-AR12-002 (pointer-stale fail-open — distinct case per FR-3.4) |
| AR-13 | TN-AR13-001 |
| AR-14 | TN-AR14-001 |
| AR-15 | TN-AR15-001 |
| AR-16 | TN-AR16-001 |
| AR-17 | TN-AR17-001 |
| AR-18 | TN-AR18-001 |
| AR-19 | TN-AR19-001 |
| AR-20 | TN-AR20-001 |
| AR-21 | TN-AR21-001 |

---

## 8. Fixtures

All fixtures are plain JSON (or small shell scripts for integration). Unit fixtures live in `__tests__/fixtures/`. Integration fixtures live in `__tests__/integration/fixtures/` (referenced as `integration/<name>` in this document). No fixture is invented inside a test entry — each appears once in this registry.

### 8.1 Canonical state fixtures

- `canonical-2x2x2.json` — 2 phases × 2 tasks × 2 criteria. No `plan_checksum`, no `initialized`. Baseline for init tests.
- `canonical-2x2x2-initialized.json` — same, after `init` has run (has `plan_checksum` and `initialized`).
- `canonical-2x2x2-drifted.json` — initialised, then a criterion's `command` was edited so the on-disk checksum is stale.
- `canonical-2x2x2-all-pass.json` — every criterion status is `PASS`.
- `canonical-2x2x2-one-fail.json` — one criterion under task `2.1` has `status: "FAIL"`, others PENDING.
- `canonical-2x2x2-in-progress.json` — one task at `IN_PROGRESS`, one criterion already PASS.
- `canonical-2x2x2-mixed-statuses.json` — mixture of PASS, FAIL, PENDING across criteria (for `show` + checksum-state-invariance tests).
- `canonical-2x2x2-last-task-of-phase1.json` — `current_task` is the last task of phase 1; all its criteria PASS.
- `canonical-2x2x2-last-task-of-last-phase.json` — `current_task` is the last task of the last phase; all its criteria PASS.
- `canonical-2x2x2-missing-field.json` — a required field (e.g., `status`) is missing from one task. For `validate` negative tests.
- `canonical-2x2x2-bad-enum.json` — `status: "WEIRD"` at a position where the schema requires a known enum.
- `canonical-2x2x2-automated-no-command.json` — `type: "automated"` criterion with no `command` field.
- `canonical-2x2x2-current-task-orphaned.json` — `current_task` points at a task id not in `phases[current_phase].tasks`.
- `canonical-2x2x2-unknown-enum.json` — criterion has `status: "SKIPPED"` (unknown enum; preserved-on-read test).
- `canonical-2x2x2-with-unknown-toplevel.json` — a top-level unknown field like `"iteration_count": 3`.
- `canonical-2x2x2-with-unknown-nested.json` — unknown fields nested on phase, task, and criterion objects.
- `canonical-2x2x2-different-toplevel.json` — same `phases` as `canonical-2x2x2.json` but different `status`/`current_task`/`current_phase`/`initialized`/`notes` (checksum invariance test).
- `canonical-2x2x2-reversed.json` — same criteria as `canonical-2x2x2.json` but with phases/tasks/criteria in reverse order (stability test).
- `canonical-2x2x2-alphakeys.json` — same criteria but object keys inside criteria in reverse alphabetical order (key-order stability test).
- `canonical-2x2x2-command-edit.json` — same as canonical but one character in one `command` differs (sensitivity test).
- `canonical-2x2x2-extra-criterion.json` — canonical plus one additional criterion on task `2.1` (sensitivity test).
- `canonical-2x2x2-fewer-criteria.json` — canonical minus one criterion on task `2.1` (sensitivity test).
- `canonical-2x2x2-renamed-task.json` — canonical with task id `"2.1"` renamed to `"2.1-old"` (structural-id sensitivity test).
- `canonical-phase-with-mixed-ids.json` — a phase containing tasks `"2.1"`, `"2.2"`, `"2.10"` to exercise dotted-numeric ordering.
- `canonical-task-with-ten-criteria.json` — one task with 10 criteria (ids 1..10) to exercise numeric-id iteration order.
- `canonical-task-one-criterion-fails.json` — one task whose first of three automated criteria fails (for CheckRunner exit-1 test).
- `canonical-mixed-auto-manual.json` — a fixture with both automated and manual criteria on the same task.
- `canonical-mixed-auto-manual-prompt-edit.json` — same, with one character of a `prompt` field edited (checksum sensitivity).

### 8.2 PlanGate fixtures

- `pg-state-pending.json` — minimal validation.json with `current_task` at PENDING status.
- `pg-state-in-progress.json` — same shape, `current_task` status `IN_PROGRESS`.
- `pg-state-pass.json` — same shape, `current_task` status `PASS`.
- `pg-state-drifted.json` — checksum mismatch on read (forces `ChecksumError`).
- `pg-state-malformed.json` — invalid JSON or missing required schema field (forces `SchemaError`).
- `pg-pointer.json` — canonical pointer JSON pointing at one of the `pg-state-*.json` fixtures.
- `pg-pointer-redirected.json` — pointer whose `validation_path` points to a different fixture (verifies `decide` reads the path from the pointer, not a hardcoded path).
- `pointer-stale.json` — pointer whose `validation_path` does not resolve on disk (fail-open test).

### 8.3 CheckRunner fixtures

- `manual-criterion-fixture.json` — one-task fixture whose criteria are exclusively manual (for stdin/askuser tests).

### 8.4 Event-emitter fixtures

- `pointer-for-event-emitter.json` — a pointer whose `validation_path`'s parent dir is a temp directory writable by the test.

### 8.5 Integration-scope fixtures

- `integration/project-2x3-happy.json` — a validation.json with 2 tasks × 3 automated criteria, the commands of which are small shell scripts in this same fixtures dir (below).
- `integration/pass-script.sh` — `#!/usr/bin/env bash\necho PASS\n` (used as a command by project-2x3-happy criteria).
- `integration/project-1x1-fixable.json` — one task with one criterion whose command is `integration/fail-script-v1.sh` on first run and `integration/fail-script-v2.sh` on second (test swaps symlink/file between runs).
- `integration/fail-script-v1.sh` — exits 1, prints `oops` to stderr.
- `integration/fail-script-v2.sh` — exits 0, prints `PASS` to stdout.
- `integration/pg-project/validation.json` — full validation.json consumed by PlanGate integration tests.
- `integration/pg-pointer.json` — pointer file for PlanGate integration tests.
- `integration/deployed-tools-dir/` — directory with real `StateManager.ts` / `CheckRunner.ts` files (symlinks from the built repo), for realpath allow-list matching in Flow 3.
- `integration/project-manual-1x1.json` — minimal fixture with one task + one manual criterion (for Flow 4 / 5).
- `integration/drift-project/validation.json` — initialised fixture that a helper pre-mutates to force a checksum mismatch across Flow 6 invocations.
- `integration/project-for-crash.json` — minimal fixture used by the atomic-write fault-injection test.
- `integration/project-for-pointer/validation.json` — fixture used by Flow 8 pointer-lifecycle tests.
- `integration/project-for-pointer-minimal.json` — single-phase single-task single-criterion fixture for pointer-on-completion and pointer-delete-failure tests.
- `integration/project-for-pointer-2phase.json` — 2-phase × 1-task-each fixture for phase-rollover-preserves-pointer test.
- `integration/settings-fixture.json` — baseline `settings.json` containing only SecurityValidator entries (for the registration test).
- `integration/settings-after-registration.json` — expected output of running the registration script against the above.
- `integration/tools-md-fixture.md` — baseline `~/.claude/PAI/TOOLS.md` without the two new sections.
- `integration/skill-md-fixture.md` — baseline `~/.claude/PAI/SKILL.md` without a `TOOLS.md` reference.

**Fixture file count:** 37 distinct fixture files (28 unit-scope JSON fixtures + 9 integration-scope artifacts — JSON/Markdown/shell).

---

## 9. Test scaffolding notes

**Runner.** All tests run under `bun test`. Discovery pattern: `__tests__/**/*.test.ts`. No other test runner is introduced (TR-11.4).

**Temp `HOME` + temp project directory.** Both Tier A pointer-writing tests and every Tier B test isolate filesystem state by setting `HOME=<per-test-tmpdir>/home` and running all subprocesses with that env. The temp project directory (with `validation.json` + any source files) is created per-test under `<tmpdir>/project`. Cleanup runs in `afterEach`. This prevents cross-test leaks and allows parallel `bun test` runs safely.

**Subprocess invocation (Tier B).** Tests subprocess-invoke the deployed-shape CLIs and the hook using `Bun.spawn` with explicit `env`, `stdin`, and `cwd`. Each subprocess test captures stdout, stderr, and exit code and asserts against the text/JSON shape directly — no snapshot matchers (too fragile for this project's byte-level assertions).

**Hook stdin tests.** `PlanGate.hook.ts` subprocess tests pipe a JSON payload in the shape `{session_id: "...", tool_name: "...", tool_input: {...}, tool_use_id: "..."}` (matching what Claude Code injects) to the hook's stdin via `Bun.spawn({ stdin: Buffer.from(JSON.stringify(payload)) })`. Expected stdout is parsed as JSON and asserted against the `hookSpecificOutput` schema.

**Atomic-write crash simulation (TB-Flow7-001 and TN-AR7-001).** The atomic-write fault injection does NOT monkey-patch `fs.renameSync` globally. Instead, `writeState`'s implementation takes a filesystem interface object as an injectable dependency (production uses the real `node:fs`, tests pass a wrapper whose `renameSync` throws or pauses on demand). This is the D3-style dependency inversion; it is strictly more testable than process-level `require` interception and does not affect production code paths. Same pattern is used for (a) pointer-delete failure injection in TB-Flow8-004 and (b) `appendEvent` write-error swallow test in TA-EventEmitter-004.

**Readstate spy pattern for AR-3.** To prove every `readState` path validates the checksum, a test-only re-export of `readState` wraps the production function with a Jest-style spy that records call arguments. Each caller (CLI `read`, CheckRunner, PlanGate) is tested through an integration harness that imports the same module — the spy is observed from across the call sites. No production code change is needed.

**Event assertions.** Tier B flows tail `<project-root>/.plan-executor/events.jsonl` at end-of-test and parse each line as JSON. Tests assert on the subset of events that match a type predicate (e.g., "every `plan.criterion.*` event for this run"), not on full-file byte equality, so ordering of concurrent emissions (if any) does not cause false negatives. `source` field is always asserted because it is one of the observability invariants (FR-5.14).

**CI vs local.** `bun test` runs identically locally and in CI. No network-dependent fixtures. Tests requiring `~/.claude/PAI/Tools/*.ts` on disk use the temp-deploy path described above, not a real user install.

**Test-local types.** All type-level assertions (e.g., FR-1.28j) are written inside `.test.ts` files using `type Assert<T extends true> = T` or equivalent patterns, so they fail the TypeScript compile step (and therefore fail the `bun test` run) when the exported type shape diverges.

---

## 10. Summary of counts

| Section | Test count |
|---|---|
| Tier A.1 StateManager | 52 |
| Tier A.2 CheckRunner | 31 |
| Tier A.3 PlanGateHandler | 23 |
| Tier A.4 Event emitter | 9 |
| Tier A.5 Plan checksum | 12 |
| **Tier A total** | **127** |
| Tier B Flow 1–8 | 14 |
| Tier B cross-cutting (CLI/deploy/settings/docs/scaffold) | 8 |
| **Tier B total** | **22** |
| AR negative tests | 22 (21 ARs + 1 distinct FR-3.4 fail-open test, TN-AR12-002) |
| **Grand total test entries** | **171** |

(Note: a single test entry typically contains multiple `expect()` assertions — the count above is test entries in this plan, not raw assertion count.)
