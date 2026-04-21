---
Status: Hardened (Phase 2.2 output — awaiting Drew approval in Phase 2.3)
Created: 2026-04-21
Owner: Drew Arnold
Related:
  - docs/requirements.md — Phase 2.1 draft (baseline; preserved for diff-review)
  - docs/design.md — detailed design (primary source)
  - docs/decisions.md — D1–D13 binding decisions
  - implementation-plan.md — phased build plan
  - ~/projects/dev/dev-tools/projects/plan-execution-meta-skill-2026-03/architecture-a-gate-keeper.md — parent architectural spec
  - ~/.claude/PAI/CLIFIRSTARCHITECTURE.md — CLI-First pattern (grounds TR-3.*)
  - ~/.claude/PAI/TOOLS.md — PAI tool deployment convention (grounds TR-1.*, TR-9.*)
  - ~/.claude/PAI/THEHOOKSYSTEM.md — hook conventions (grounds TR-6.*)
Supersedes: docs/requirements.md
---

# Plan Executor Tools — Requirements (BRD + FRD + TRD), Hardened

Atomic, ID'd, independently testable requirements. Every requirement cites its design.md section or decision-log ID in parentheses. Every requirement is expected to yield ≥1 entry in the Phase 3 test plan (`docs/test-plan.md`).

Conventions:
- `BR-N` — Business Requirements (what this enables at the user / system level)
- `FR-N.N` — Functional Requirements (what components do, grouped by component)
- `TR-N.N` — Technical Requirements (how, implementation constraints)
- `AR-N` — Anti-Requirements (what must **not** happen; maps to design.md §10 and D-rationales)

Scope boundary is `architecture-a-gate-keeper.md` "Note — 2026-04-21" block: the enforcement kernel only. Authoring / recipes / auto-verify / forensic-recorder are explicitly deferred (see `docs/design.md` §13).

---

## Hardening changelog

Every material change from `docs/requirements.md`. Grouped by change type. Skim for diff intent; read the sections below for the atomic text.

### Split (compound requirements broken into atomic assertions)

- FR-1.1 → FR-1.1a (compute checksum), FR-1.1b (stamp `initialized` UTC ISO-8601), FR-1.1c (write both atomically). Each fails independently; each is one test case.
- FR-1.2 → FR-1.2a (idempotent success on matching recompute), FR-1.2b (no write occurs when checksum already set and matches).
- FR-1.8 → FR-1.8a (`read` always recomputes checksum), FR-1.8b (exits 3 on mismatch — exit code is the verifiable fact).
- FR-1.10 → FR-1.10a (PENDING → IN_PROGRESS on first criterion update per task), FR-1.10b (no transition when parent task is already non-PENDING).
- FR-1.15 → FR-1.15a (precondition: every criterion is PASS), FR-1.15b (task status flips to PASS only when precondition holds).
- FR-1.17 → FR-1.17a (next task within same phase by numeric-dotted order e.g. `2.1 < 2.2 < 2.10`), FR-1.17b (ordering stable across re-invocations).
- FR-1.18 → FR-1.18a (last task of phase rolls to first task of next phase), FR-1.18b (phase-id rollover uses lexicographic order on the phases map keys).
- FR-1.21 → FR-1.21a (exit 1), FR-1.21b (`E_CRITERIA_INCOMPLETE` code), FR-1.21c (payload enumerates non-PASS criterion ids).
- FR-1.28 (monolithic API list) → FR-1.28a..FR-1.28k (one FR per exported symbol, so a missing export fails independently of a wrong-signature export).
- FR-1.30 → FR-1.30a (top-level unknown fields preserved), FR-1.30b (nested unknown fields preserved — phase/task/criterion), FR-1.30c (unknown enum values in `status` preserved on read), FR-1.30d (`validate` reports unknown enums as warnings not errors).
- FR-2.5/2.6 → FR-2.5a (default 30s), FR-2.5b (units are milliseconds when overridden via env), FR-2.6 (env var name is exactly `CHECKRUNNER_TIMEOUT_MS`).
- FR-2.7 → FR-2.7a (last non-empty stdout line equals `PASS`), FR-2.7b (exit code is `0`), FR-2.7c (both conjuncts required to record PASS).
- FR-2.8 → FR-2.8a (last non-empty stdout line equals `FAIL` — sufficient), FR-2.8b (non-zero exit — sufficient), FR-2.8c (disjunction, either alone records FAIL).
- FR-2.11 (compound evidence format) → FR-2.11a/b/c (three newline-joined fields, each asserted independently).
- FR-2.17 (exit-4 payload) → FR-2.17a..e (one FR per payload key so missing-key failures are localised).
- FR-2.23/2.24/2.25/2.26 (already split by exit code in draft) → kept split; clarified that exit 0 requires both all-PASS and advanced (FR-2.23a, FR-2.23b).
- FR-3.1 (three matchers) → FR-3.1a (Bash), FR-3.1b (Edit), FR-3.1c (Write).
- FR-3.5 → FR-3.5a (Write-matcher case), FR-3.5b (Edit-matcher case) — draft bundled them.
- FR-3.8/3.9 → preserved split (one for Bash, one for Edit/Write) but renumbered into FR-3.8a, FR-3.9a, FR-3.9b for Edit vs Write distinction per design.md §7.4 step 3.
- FR-3.12 (JSON envelope) → FR-3.12a (`hookSpecificOutput` is the top-level key), FR-3.12b (`hookEventName: "PreToolUse"`), FR-3.12c (`permissionDecision: "deny"`), FR-3.12d (`permissionDecisionReason` is a non-empty string), FR-3.12e (printed to stdout — not stderr).
- FR-3.16 (three "no" clauses) → FR-3.16a, FR-3.16b, FR-3.16c — pure function's three separate purity properties.
- FR-4.1 → FR-4.1a (hash is SHA-256), FR-4.1b (input domain is a canonical JSON string), FR-4.1c (domain is the *criteria projection*, not the full document).
- FR-4.4/4.5 → FR-4.4a (phase-id sort is lexicographic), FR-4.4b (task-id sort is dotted-numeric), FR-4.4c (criterion-id sort is numeric when all numeric else lexicographic), FR-4.5 (no insignificant whitespace retained verbatim).
- FR-5.3/5.4 → FR-5.3 (`timestamp`), FR-5.4a (`session_id` from env var), FR-5.4b (`session_id` falls back to `"unknown"` literal on unset env).
- FR-5.5..FR-5.9 (each "event type X includes fields A, B, C") → one FR per required field so a missing field is one FR failing, not the whole event-type FR failing.
- TR-1.1/1.2/1.3 (three deploy paths) → kept separate, added TR-1.10 (handler file NOT deployed separately per §9.4).
- TR-1.4 (Title-Case convention) → TR-1.4a (StateManager.ts name), TR-1.4b (CheckRunner.ts name), TR-1.4c (PlanGate.hook.ts name — including the `.hook.ts` double-suffix per THEHOOKSYSTEM.md).
- TR-3.* (any "both CLIs" compound) → one TR per CLI per flag so StateManager and CheckRunner failures are localised: TR-3.1a/b, TR-3.2a/b, TR-3.3a/b, TR-3.4a/b.
- TR-5.1 → TR-5.1a (write to temp file), TR-5.1b (temp filename is `<target>.tmp`), TR-5.1c (rename to final path).
- TR-8.1 → TR-8.1a (StateManager allow-list via realpath), TR-8.1b (CheckRunner allow-list via realpath) — each tool independently testable.
- TR-8.2 → TR-8.2a (symlink resolution), TR-8.2b (`$HOME`/`~` expansion).
- TR-9.3 (five subsections bundled) → TR-9.3a..TR-9.3e, one TR per required subsection heading (Location, Usage, When to Use, Environment Variables, Technical Details).
- TR-10.3 (decision-table enumeration) → TR-10.3a (all tool × status × target_path combinations), TR-10.3b (explicit enumeration: `reason_code` assignment cases — see design.md §12.1 PlanGateHandler pure surface).

### Added (coverage gaps filled)

- FR-1.3b — `E_CHECKSUM_DRIFT` includes both the stored checksum and the recomputed checksum in the error payload (so the operator can diff mechanically).
- FR-1.12b — `update-criterion` without `--evidence` flag records empty-string evidence (explicit default, not implicit).
- FR-1.14b — `update-criterion` errors with `E_TARGET_NOT_FOUND` independently when `--task` resolves but `--criterion` does not.
- FR-1.16b — `verified_at` format is ISO-8601 UTC (explicit; draft implied via §4.4 but did not state it).
- FR-1.20b — `plan_completed: true` in the structured response when `status` flips to `COMPLETED`.
- FR-1.32 — `init` idempotent path emits no event (no `plan.checksum.reinit` — out of scope; explicit silence).
- FR-1.33 — `validate` does not read `plan_checksum` (schema-only; separates structural validation from tamper detection; design.md §4.6).
- FR-1.34 — `advance-task` emits `plan.task.advanced` with `to_task` set to the new `current_task` (design.md §9.3).
- FR-1.35 — `advance-task` payload sets `phase_rolled: true` when `current_phase` changes.
- FR-1.36 — `advance-task` payload sets `plan_completed: true` on final task completion.
- FR-1.37 — `update-criterion` does **not** call `advance-task` implicitly (CheckRunner is the orchestrator of that transition; StateManager stays atomic per unit).
- FR-2.29 — CheckRunner aborts iteration on the first system error; pending criteria are not coerced to FAIL (exit 2, not exit 1).
- FR-2.30 — CheckRunner under `stdin` strategy also accepts `--answer <response>` as a scripted shortcut (design.md §6.1 flags; previously only askuser was mentioned).
- FR-2.31 — CheckRunner emits `plan.criterion.passed` on manual-criterion PASS (design.md §6.3 step 5 — draft only covered automated).
- FR-2.32 — CheckRunner emits `plan.criterion.failed` on manual-criterion FAIL (empty answer under `stdin`).
- FR-2.33 — CheckRunner does NOT emit `plan.*` events under `--dry-run` (design.md §6.6 — draft omitted this explicit negative).
- FR-2.34 — CheckRunner exit 3 halts before any `updateCriterion` call (no partial writes under checksum drift).
- FR-2.35 — `--json` prints exactly one JSON object to stdout per `run` (no interleaved progress lines — design.md §6.5).
- FR-3.22 — PlanGate BLOCKS with `reason_code: "state_malformed"` when pointer exists and state file fails schema parse (design.md §10 anti-pattern #4; draft had FR-3.17 as "BLOCKS with fix-guidance message" but did not state the `reason_code` enum value — making it independently testable).
- FR-3.23 — PlanGate's `readState` call receives `pointer.validation_path` (not a hardcoded path; pointer is the source of truth).
- FR-3.24 — PlanGate BLOCK `permissionDecisionReason` contains the exact next-step command `bun ~/.claude/PAI/Tools/CheckRunner.ts run --task <id>` (design.md §7.5 exemplar; draft had FR-3.14 too abstract).
- FR-3.25 — PlanGate's decision never depends on `tool_use_id` or any other session-scoped identifier (it depends only on `tool_name`, `tool_input`, and persisted pointer/state).
- FR-3.26 — When active-plan pointer is present and tool is not `Bash`/`Edit`/`Write`, PlanGate returns ALLOW (defensive — should not occur given matcher registration, but hook must tolerate unexpected invocation).
- FR-4.10 — Checksum projection drops `verified_at` (explicit — draft FR-4.3 listed it but coverage didn't include it in a negative sensitivity test).
- FR-4.11 — Checksum projection drops `plan_checksum` itself (self-reference would be circular; design.md §8.1 step 2 by omission).
- FR-4.12 — Checksum projection drops `current_task`, `current_phase`, `status` (top-level — these are state, not structure; design.md §8.1 step 2).
- FR-4.13 — Reordering keys in a criterion object (e.g. writing `{type, check}` vs `{check, type}`) does not change the checksum (canonicalization property; design.md §8.1 step 3).
- FR-4.14 — Renaming a task id (e.g. `"2.1"` → `"2.1-old"`) changes the checksum (sensitivity — structural identity includes ids).
- FR-5.12 — `appendEvent` creates `<project-root>/.plan-executor/` if missing (implied by first-write idempotency; design.md §9.3).
- FR-5.13 — `appendEvent` output is one JSON object per line, UTF-8 encoded, terminated with `\n` (design.md §9.3).
- FR-5.14 — Event base shape includes `source` field populated by the caller (design.md §9.3 / §7.6 examples).
- FR-5.15 — `plan.criterion.failed` sets `exit_code` when the criterion is automated; omits it when manual (design.md §9.3 "optional `exit_code`").
- FR-5.16 — `plan.task.advanced` sets `phase_rolled: true` only when `current_phase` changed.
- FR-5.17 — `plan.gate.blocked` sets `target_path` only for `state_file_write_attempt` (optional otherwise per design.md §9.3).
- TR-1.10 — `src/handlers/PlanGateHandler.ts` does NOT appear under `~/.claude/hooks/` after deploy (inlined per D13/§9.4 — negative assertion, independently testable via filesystem check).
- TR-1.11 — Deployed files carry `#!/usr/bin/env bun` shebang as their first line (design.md §2.3; TR-11.1 generalised this as "when executable" — this is the concrete byte-level requirement).
- TR-1.12 — Deploy sequence requires Claude Code restart after `settings.json` edit (design.md §2.3 trailing note; operational requirement — independently testable via smoke check that hook is active after restart).
- TR-2.9 — `SecurityValidator.hook.ts` entry appears exactly once per matcher in `settings.json` after PlanGate is added (no duplication introduced).
- TR-2.10 — `PlanGate.hook.ts` entry appears exactly once per matcher (idempotent registration).
- TR-5.6 — `fsync` is called on the temp file's file descriptor, not on the directory (per D9; design.md §5 `writeState`).
- TR-5.7 — State writer does not use `flock`, `fcntl` locks, or any OS-level advisory lock (D9 explicit).
- TR-6.7 — `readHookInput` timeout of 500ms is not extended or bypassed (TR-6.2 renumbered + explicit negative).
- TR-8.7 — Allow-list comparison happens against `realpath(input.tool_input.command` token), not against the raw command string (D2).
- TR-8.8 — Allow-list has zero string-matching of substrings (e.g. `command.includes("StateManager")` would MATCH `malicious-StateManager.ts` — explicitly forbidden; realpath equality only).
- TR-11.5 — Deployed files are valid TypeScript that Bun can execute without an intermediate compile step (design.md §2.3 step 4 — `bun <file> --help` must return synchronously).

#### Scope change 2026-04-21 — Active-plan pointer lifecycle pulled into MVP

- **BR-20** — Automate the active-plan pointer file's write-on-init and delete-on-plan-complete so operators do not manually `rm` the pointer after a plan finishes. (Rationale: manual-rm UX seam was judged unacceptable during Phase 2.3 review; two forget-modes — stale pointer after COMPLETED plan, and pointer overwrite when a second `init` runs before the first pointer is cleaned — justify automating both lifecycle transitions.)
- **FR-1.38a/b/c/d** — `StateManager init` writes the pointer at `~/.claude/MEMORY/STATE/plan-executor.active.json` with the documented payload, creates the parent directory if missing, and uses an atomic temp-file + rename write.
- **FR-1.39a/b/c** — `StateManager advance-task` deletes the pointer on plan completion; delete failure is logged (`hook.error` event with `reason`) but non-fatal so the state write still returns exit 0.
- **FR-1.40** — Phase rollover alone does NOT delete the pointer (explicit negative — pointer marks plan activity, not phase activity).
- **TR-5.8** — Pointer write and delete both follow the temp-file + rename and atomic-remove patterns consistent with D9 (no file locking, single-writer-by-convention). (design.md §7.3 revised; TR-5.1a/b/c generalisation)
- Follow-up docs pass: `docs/design.md` §7.3 should be updated to remove the "deferred; not in scope" clause and cite FR-1.38 / FR-1.39 / FR-1.40 as the new authoritative source. Not done in this requirements pass (scope-bound to requirements only); noted here for the next design-sync.
- AR-13 — MUST NOT let PlanGate's block output appear on stderr (FR-3.12e positive; AR-13 negative — stderr blocks collide with older hook pattern and are now discouraged per design.md §7.5 "Schema verified 2026-04-21").
- AR-14 — MUST NOT return exit code `3` from `PlanGate.hook.ts` (the hook exits `0` and signals block via `permissionDecision: "deny"`; exit 3 is the CLI tools' checksum-drift signal, not the hook's).
- AR-15 — MUST NOT invoke `AskUserQuestion` from within CheckRunner's process (askuser strategy exits 4 and hands off; the orchestrator owns the AskUserQuestion call — design.md §6.3).
- AR-16 — MUST NOT emit events when no active-plan pointer is present (FR-5.11 positive; explicit negative for clarity — events are per-plan artifacts, not session artifacts).
- AR-17 — MUST NOT bundle state data (`status`, `evidence`, `verified_at`, `fix_attempts`) into the plan checksum (design.md §8.1 step 2 — structural-only; draft AR-2/AR-3 covered prose vs structure but not the state-vs-structure split inside validation.json).
- AR-18 — MUST NOT add new top-level fields to `validation.json` via StateManager writes (unknown fields are **preserved**, not authored; authoring is hand-editing by Drew or a future PlanParser — D11).
- AR-19 — MUST NOT use StateManager's programmatic API from within the PlanGate hook's decision function (hook performs `readState` only; writes are never originated from a hook — design.md §7.1).
- AR-20 — MUST NOT install PlanGate as a PostToolUse hook (PreToolUse only — post-toolspends block too late; design.md §2.2, §7.1).

### Reworded (same intent, sharper language)

- BR-9 (fail-open-for-no-plan): clarified fail-open applies to pointer absence **only**, not to pointer present + state malformed. Cross-references AR-4.
- FR-3.4 (draft) was rewritten as FR-3.4a (ALLOW on unresolved validation_path) + FR-3.4b (emit `hook.error` event) — splitting fail-open from observability.
- FR-3.17 (draft: "BLOCKS when state malformed") reworded to the narrower graceful-failure case (fail-open on unexpected exceptions); the state-malformed case got a dedicated FR-3.22 that names `reason_code: "state_malformed"` explicitly.
- FR-3.18 (draft) was rewritten as TR-6.5 scope + left at FR-3.17 semantics.
- TR-10.12 (draft: "No Tier C") reworded: "No Tier C" is an anti-requirement; moved to AR-21 and TR-10.12 repurposed as the positive-framed coverage rule ("every FR and TR maps to ≥1 test").

### Renumbered

- Original FR-1.28 becomes FR-1.28a..k (see Split).
- Original FR-3.17 becomes FR-3.22 after exposing `state_malformed` reason_code.
- AR additions AR-13..AR-21 (draft ended at AR-12).

### Moved

- TR-10.12's negative assertion ("No Tier C") moved to AR-21. TR-10.12 repurposed to the positive coverage rule (every FR maps to ≥1 Tier A or Tier B test).

---

## Business Requirements

- BR-1: Enforce deterministic plan execution so an AI cannot claim a task PASS without the current task's every criterion being independently verified and persisted. (design.md §1; parent spec §Failure Mode Analysis)
- BR-2: Block file mutations via the `Bash` tool until the current task shows PASS. (design.md §1, §7.1, §7.4 step 3)
- BR-3: Block file mutations via the `Edit` tool until the current task shows PASS. (design.md §7.4 step 3)
- BR-4: Block file mutations via the `Write` tool until the current task shows PASS. (design.md §7.4 step 3)
- BR-5: Detect tampering of `validation.json`'s criteria structure via a plan checksum validated on every read. (D8; design.md §8)
- BR-6: Maintain `validation.json` as the single source of truth for plan state, writable only through StateManager. (D1; design.md §1)
- BR-7: Allow-list StateManager and CheckRunner so the enforcement system can make forward progress. (D2; design.md §7.4)
- BR-8: Block direct writes to `validation.json` regardless of current task status (sole-writer discipline). (design.md §7.4 step 2; §10 anti-pattern #1)
- BR-9: Emit a project-local, append-only event log at `<project-root>/.plan-executor/events.jsonl` so every execution run is post-mortem-reviewable. (D5 revised; design.md §9.3)
- BR-10: Ship no skill wrapper — the three artifacts are PAI tools and hooks, not a skill. (D1; TOOLS.md "Don't create a separate skill if the entire functionality is just a CLI command")
- BR-11: Apply enforcement session-wide (main agent and all subagents equally) via `settings.json` hook registration. (design.md §2.2; parent spec §Subagent coverage)
- BR-12: Fail open when no `validation.json` pointer is active — every tool call passes freely. (design.md §7.3, §10 anti-pattern #12)
- BR-13: Fail closed when an active-plan pointer is present but state is malformed — the hook BLOCKS, it does NOT silently allow. (design.md §10 anti-pattern #4)
- BR-14: Bootstrap via manual discipline — this project cannot enforce its own construction (chicken-and-egg); once deployed, every subsequent plan runs under hook enforcement. (implementation-plan.md "Task Validation Protocol"; README.md "Execution mode")
- BR-15: Preserve unknown fields on write so future plans that add fields (e.g., `iteration_count`) don't lose data when processed by the current StateManager. (D11; design.md §3.5)
- BR-16: Maintain strict separation between security-layer checks (SecurityValidator) and plan-execution-layer checks (PlanGate) — PlanGate adds to, never replaces, SecurityValidator. (D12; design.md §2.2, §7.7)
- BR-17: Support interactive manual-criterion workflows via the `stdin` prompt strategy. (D10; design.md §6.3)
- BR-18: Support delegated manual-criterion workflows via the `askuser` prompt strategy (exit-4 handoff). (D10; design.md §6.3)
- BR-19: Provide deterministic forward progress at sub-second latency — the hook adds no user-perceptible delay on allow decisions. (parent spec §Sub-10ms per check target; design.md §12.3)
- BR-20: Automate the active-plan pointer file's write-on-init and delete-on-plan-complete so operators do not manually `rm` the pointer after a plan finishes. (Scope change 2026-04-21 — pulled from deferred scope; rationale: manual-rm UX seam; FR-1.38, FR-1.39, FR-1.40)

---

## Functional Requirements

### FR-1: StateManager CLI (7 subcommands + programmatic API)

#### FR-1.1–1.3 `init`

- FR-1.1a: `init` computes the plan checksum over the current criteria projection. (design.md §4.1, §8.1)
- FR-1.1b: `init` stamps `initialized` with the current ISO-8601 UTC timestamp. (design.md §4.1)
- FR-1.1c: `init` writes `plan_checksum` and `initialized` in a single atomic rename (no partial-state visibility). (design.md §4.1; D9)
- FR-1.2a: `init` is idempotent — rerunning when `plan_checksum` is already set and the recomputed checksum matches exits 0 with success. (design.md §4.1)
- FR-1.2b: `init` performs no disk write when the recomputed checksum matches the stored one. (design.md §4.1 "no-op success")
- FR-1.3a: `init` errors with code `E_CHECKSUM_DRIFT` when rerun and the criteria structure has changed since first init. (design.md §4.1)
- FR-1.3b: The `E_CHECKSUM_DRIFT` error payload names both the stored checksum and the recomputed checksum. (design.md §8.3 fix-guidance pattern)

#### FR-1.4–1.8 `read`

- FR-1.4: `read` returns a read-only projection of the state file without mutation. (design.md §4.2)
- FR-1.5: `read --task <id>` returns the full Task object as JSON. (design.md §4.2)
- FR-1.6: `read --phase <id>` returns the full Phase object as JSON. (design.md §4.2)
- FR-1.7: `read --criterion <taskId:critId>` returns the Criterion object wrapped with its enclosing phase id and task id (`{"phase":"2","task":"2.1","criterion":"3","object":{...}}`). (design.md §4.2)
- FR-1.8a: `read` validates (recomputes and compares) `plan_checksum` on every invocation. (design.md §4.2, §8.2)
- FR-1.8b: `read` exits 3 when the recomputed and stored checksums differ. (design.md §4.2, §8.2, D7)
- FR-1.8c: `read` exits 1 when `--task` / `--phase` / `--criterion` target does not resolve. (design.md §4.2)

#### FR-1.9–1.14 `update-criterion`

- FR-1.9: `update-criterion --status PASS|FAIL` flips the target criterion's status. (design.md §4.3)
- FR-1.10a: `update-criterion` transitions the parent task from `PENDING` to `IN_PROGRESS` on first criterion update. (design.md §4.3)
- FR-1.10b: `update-criterion` does not re-transition a parent task whose status is already `IN_PROGRESS` or PASS. (design.md §4.3 implied by "PENDING →")
- FR-1.11: `update-criterion` increments `fix_attempts` on the parent task when `--status FAIL`. (design.md §4.3)
- FR-1.12a: `update-criterion --evidence -` reads evidence from stdin (supports multi-line capture). (design.md §4.3)
- FR-1.12b: `update-criterion` without `--evidence` flag sets evidence to the empty string. (design.md §4.3 by omission; schema §3.4 "Empty string until set")
- FR-1.13: `update-criterion` errors with `E_TARGET_NOT_FOUND` when the task id does not resolve. (design.md §4.3)
- FR-1.14a: `update-criterion` errors with `E_TARGET_NOT_FOUND` when the criterion id does not resolve within a valid task. (design.md §4.3)
- FR-1.14b: `update-criterion` errors with `E_INVALID_STATUS` when `--status` is not `PASS` or `FAIL`. (design.md §4.3)

#### FR-1.15–1.21 `advance-task`

- FR-1.15a: `advance-task` precondition — every criterion of the target task is `PASS`. (design.md §4.4)
- FR-1.15b: `advance-task` flips the target task's `status` to `PASS` only when FR-1.15a holds. (design.md §4.4)
- FR-1.16a: `advance-task` stamps `verified_at` on the task at the moment it flips to `PASS`. (design.md §4.4)
- FR-1.16b: `verified_at` is formatted as ISO-8601 UTC. (design.md §3.3 field spec)
- FR-1.17a: `advance-task` advances `current_task` to the next task in the phase in natural dotted-numeric order (`"2.1" < "2.2" < "2.10"`). (design.md §8.1 step 2 explicit ordering rule)
- FR-1.17b: `advance-task` ordering is deterministic and stable across re-invocations. (design.md §8.1 determinism property)
- FR-1.18a: When the advanced task was the last task in its phase, `advance-task` sets `current_task` to the first task of the next phase. (design.md §4.4)
- FR-1.18b: Phase-rollover uses lexicographic order on the `phases` map keys. (design.md §8.1 step 2)
- FR-1.19: `advance-task` increments `current_phase` on phase rollover. (design.md §4.4)
- FR-1.20a: `advance-task` flips top-level `status` to `COMPLETED` when the last phase's last task is advanced. (design.md §4.4)
- FR-1.20b: `advance-task`'s `--json` response sets `plan_complete: true` when FR-1.20a fires. (design.md §4.4 stdout example)
- FR-1.21a: `advance-task` exits 1 when precondition FR-1.15a fails. (design.md §4.4; D7)
- FR-1.21b: `advance-task` returns error code `E_CRITERIA_INCOMPLETE` under FR-1.21a. (design.md §4.4)
- FR-1.21c: The `E_CRITERIA_INCOMPLETE` payload enumerates the ids of the non-PASS criteria. (design.md §4.4)
- FR-1.21d: `advance-task` errors with `E_TARGET_NOT_FOUND` when the task id is invalid. (design.md §4.4)

#### FR-1.22–1.23 `show`

- FR-1.22: `show` renders a phase tree with `✓` / `✗` / `…` icons per criterion status. (design.md §4.5)
- FR-1.23: `show --phase <id>` renders a specific phase; without the flag it renders the phase at `current_phase`. (design.md §4.5)

#### FR-1.24 `validate`

- FR-1.24a: `validate` performs a non-mutating schema check. (design.md §4.6)
- FR-1.24b: `validate` verifies every required field is present at each level. (design.md §4.6)
- FR-1.24c: `validate` verifies enum values in `status` belong to the known set. (design.md §4.6)
- FR-1.24d: `validate` verifies `automated` criteria have `command` and `manual` criteria have `prompt`. (design.md §4.6)
- FR-1.24e: `validate` verifies `current_task` resolves within `phases[current_phase].tasks`. (design.md §4.6)
- FR-1.24f: `validate` does not read `plan_checksum` (schema-only; tamper detection is `read`/`checksum`). (design.md §4.6)

#### FR-1.25 `checksum`

- FR-1.25: `checksum` emits the recomputed plan checksum without writing to disk. (design.md §4.7)

#### FR-1.26–1.27 `--help`

- FR-1.26: Every StateManager subcommand supports `--help` that prints synopsis, flags, and purpose. (design.md §4.8; AR-11)
- FR-1.27: Top-level `StateManager --help` lists every subcommand. (design.md §4.8)

#### FR-1.28 Programmatic API (exports)

- FR-1.28a: StateManager exports `readState(path: string): ValidationState`. (design.md §5)
- FR-1.28b: StateManager exports `writeState(path: string, state: ValidationState): void`. (design.md §5)
- FR-1.28c: StateManager exports `initState(path: string): ValidationState`. (design.md §5)
- FR-1.28d: StateManager exports `computePlanChecksum(state: ValidationState): string`. (design.md §5)
- FR-1.28e: StateManager exports `updateCriterion(state, taskId, criterionId, status, evidence): ValidationState`. (design.md §5)
- FR-1.28f: StateManager exports `advanceTask(state, taskId): ValidationState`. (design.md §5)
- FR-1.28g: StateManager exports `findCurrentCriterion(state): {phaseId, taskId, criterion, criterionId}`. (design.md §5)
- FR-1.28h: StateManager exports error class `StateManagerError` (base). (design.md §5)
- FR-1.28i: StateManager exports error classes `SchemaError`, `ChecksumError`, `TargetNotFoundError`, `PreconditionError`, `IOError` — each extending `StateManagerError`. (design.md §5)
- FR-1.28j: StateManager exports TypeScript types `CriterionStatus`, `TaskStatus`, `PhaseStatus`, `Criterion`, `Task`, `Phase`, `ValidationState`. (design.md §5)
- FR-1.28k: `readState` throws `ChecksumError` when `plan_checksum` is set and the recomputed checksum differs. (design.md §5 "throws ChecksumError")

#### FR-1.29 Pure transforms

- FR-1.29a: `updateCriterion` does not read or write the filesystem. (design.md §5 "Contract notes")
- FR-1.29b: `advanceTask` does not read or write the filesystem. (design.md §5 "Contract notes")
- FR-1.29c: `updateCriterion` returns a new state value; the input `state` argument is not mutated. (design.md §5 "Contract notes")
- FR-1.29d: `advanceTask` returns a new state value; the input `state` argument is not mutated. (design.md §5 "Contract notes")

#### FR-1.30 Unknown-field preservation (D11)

- FR-1.30a: StateManager preserves top-level unknown fields across the read-merge-write cycle. (D11; design.md §3.5)
- FR-1.30b: StateManager preserves unknown fields nested inside phase, task, and criterion objects. (D11; design.md §3.5)
- FR-1.30c: StateManager preserves unknown enum values in `status` on read (does not coerce or drop). (design.md §3.5 "New enum values … preserved on read")
- FR-1.30d: `validate` reports unknown enum values as `unknown_enum` warnings (not errors). (design.md §3.5)

#### FR-1.31 Path flag

- FR-1.31: Every StateManager subcommand supports `--path <file>` defaulting to `./validation.json`. (design.md §4 preamble)

#### FR-1.32–1.37 Additional behaviors

- FR-1.32: `init`'s idempotent (no-op) path emits no `plan.*` events. (design.md §4.1; design.md §9.3 table by omission)
- FR-1.33: `validate` does not call `readState` (it parses the file directly so schema errors are reported without triggering `ChecksumError`). (design.md §4.6)
- FR-1.34: `advance-task` emits a `plan.task.advanced` event with `from_task` = the advanced task id and `to_task` = the new `current_task`. (design.md §9.3)
- FR-1.35: `plan.task.advanced` event sets `phase_rolled: true` when FR-1.18a fires; otherwise the field is absent or `false`. (design.md §9.3)
- FR-1.36: `plan.task.advanced` event sets `plan_completed: true` when FR-1.20a fires; otherwise the field is absent or `false`. (design.md §9.3)
- FR-1.37: `update-criterion` does NOT implicitly call `advance-task` — advancement is CheckRunner's responsibility after all criteria resolve. (design.md §4.3 "Does NOT advance the task"; §6.1)

#### FR-1.38–1.40 Active-plan pointer lifecycle (scope change 2026-04-21)

Scope note: design.md §7.3 originally deferred automatic pointer management ("In scope, the operator manually deletes the pointer when done"). Phase 2.3 review (2026-04-21) pulled these behaviors into MVP scope on Drew's decision — the manual-delete UX seam was judged unacceptable for the bootstrap period. Design.md §7.3 should be updated in a follow-up pass to remove the "deferred; not in scope" clause and cite FR-1.38 / FR-1.39 as the new authoritative source. No other design decision changes.

- FR-1.38a: `StateManager init` writes the active-plan pointer file at `~/.claude/MEMORY/STATE/plan-executor.active.json`. (design.md §7.3; scope change 2026-04-21)
- FR-1.38b: The pointer payload is a JSON object with keys `validation_path` (absolute path to the project's validation.json), `project` (slug string), `activated_at` (ISO-8601 UTC), `session_id` (from `CLAUDE_SESSION_ID` env var; `"unknown"` if unset). (design.md §7.3)
- FR-1.38c: `StateManager init` creates `~/.claude/MEMORY/STATE/` if the directory does not exist (mkdir -p semantics). (derived from FR-1.38a; operational completeness)
- FR-1.38d: Pointer write is atomic — temp-file + rename in the same directory (`plan-executor.active.json.tmp` → `plan-executor.active.json`). (D9 consistency with TR-5.1a/b/c)
- FR-1.39a: `StateManager advance-task` deletes the active-plan pointer when top-level `status` flips to `COMPLETED` (FR-1.20a trigger fires). (design.md §7.3 revised; scope change 2026-04-21)
- FR-1.39b: Pointer-delete failure (e.g., permission denied, file already removed) is non-fatal — `advance-task` still returns exit 0 and the state write still completes. (graceful-degradation; FR-5.10 emitter-error convention generalised)
- FR-1.39c: On pointer-delete failure, `advance-task` emits a `hook.error` event with a `reason` field naming the failure cause (e.g., `"pointer_already_absent"`, `"permission_denied"`). (derived from FR-1.39b; observability completeness)
- FR-1.40: `advance-task` does NOT delete the pointer when only a phase rolls over (FR-1.18a fires without FR-1.20a). The pointer persists across phase boundaries — it marks plan activity, not phase activity. (design.md §7.3 by scope; prevents false-negative enforcement mid-plan)

### FR-2: CheckRunner CLI (`run` subcommand)

#### FR-2.1–2.3 Target resolution

- FR-2.1: `run` without `--task` resolves the target task via `findCurrentCriterion` on the loaded state. (design.md §6.1)
- FR-2.2: `run --task <id>` targets an explicit task, overriding `current_task`. (design.md §6.1)
- FR-2.3: `run` iterates the target task's criteria in numeric-id order. (design.md §6.1)

#### FR-2.4–2.11 Automated-criterion flow

- FR-2.4: Automated criteria execute via `bash -c "<criterion.command>"`. (design.md §6.2 step 2)
- FR-2.5a: Automated-criterion default timeout is 30,000 ms (30 s). (design.md §6.2 step 2)
- FR-2.5b: Timeout units are milliseconds. (design.md §6.2 step 2 — env var suffix `_MS`)
- FR-2.6: The timeout override env var is named exactly `CHECKRUNNER_TIMEOUT_MS`. (design.md §6.2 step 2)
- FR-2.7a: Automated-criterion PASS requires the last non-empty stdout line to equal the literal string `PASS`. (design.md §6.2 step 4)
- FR-2.7b: Automated-criterion PASS requires exit code 0. (design.md §6.2 step 4)
- FR-2.7c: PASS is recorded only when FR-2.7a AND FR-2.7b both hold. (design.md §6.2 step 4)
- FR-2.8a: Automated-criterion FAIL is recorded when the last non-empty stdout line equals `FAIL` (sufficient condition). (design.md §6.2 step 4)
- FR-2.8b: Automated-criterion FAIL is recorded when the exit code is non-zero (sufficient condition). (design.md §6.2 step 4)
- FR-2.8c: Either FR-2.8a or FR-2.8b alone records FAIL (disjunction). (design.md §6.2 step 4)
- FR-2.9: Automated-criterion timeout records FAIL with evidence `TIMEOUT after Nms` (N = effective timeout). (design.md §6.2 step 4)
- FR-2.10: Automated-criterion PASS evidence is the captured stdout, whitespace-trimmed. (design.md §6.2 step 4)
- FR-2.11a: Automated-criterion FAIL evidence line 1 is `exit_code=N`. (design.md §6.2 step 4)
- FR-2.11b: Automated-criterion FAIL evidence line 2 is `stdout=...` (captured stdout). (design.md §6.2 step 4)
- FR-2.11c: Automated-criterion FAIL evidence line 3 is `stderr=...` (captured stderr). (design.md §6.2 step 4)

#### FR-2.12–2.18 Manual-criterion flow (D10)

- FR-2.12: The default manual-prompt strategy is `stdin` when `--manual-prompt-strategy` is not provided. (D10; design.md §6.3)
- FR-2.13: Under `stdin` strategy, CheckRunner prints `MANUAL: <prompt>` on its own line to stdout. (design.md §6.3 step 1)
- FR-2.14: Under `stdin` strategy, an empty answer line records FAIL with evidence `no answer provided`. (design.md §6.3 step 3)
- FR-2.15: Under `stdin` strategy, a non-empty answer line records PASS with the line (trimmed) as evidence. (design.md §6.3 step 3)
- FR-2.16: Under `askuser` strategy, the first pending manual criterion aborts the run with exit code 4. (design.md §6.3, §6.4)
- FR-2.17a: The `askuser` exit-4 payload is printed to stderr. (design.md §6.3)
- FR-2.17b: The exit-4 payload includes key `exit_reason` with value `"manual_criterion_needs_askuser"`. (design.md §6.3)
- FR-2.17c: The exit-4 payload includes key `task` with the current task id. (design.md §6.3)
- FR-2.17d: The exit-4 payload includes key `criterion` with the blocking criterion id. (design.md §6.3)
- FR-2.17e: The exit-4 payload includes key `prompt` with the criterion's prompt text. (design.md §6.3)
- FR-2.17f: The exit-4 payload includes key `resume_command` with a ready-to-run CheckRunner invocation. (design.md §6.3)
- FR-2.18: `--answer <response>` supplies the answer to the exact criterion that caused the prior exit-4, after which CheckRunner continues into remaining criteria. (design.md §6.3 step 3)

#### FR-2.19–2.21 Dry-run

- FR-2.19: `--dry-run` evaluates automated criteria without calling `updateCriterion`. (design.md §6.1, §6.6)
- FR-2.20: `--dry-run` does not call `advanceTask`. (design.md §6.1, §6.6)
- FR-2.21a: `--dry-run` reports manual criteria as `would prompt: <prompt>` without reading stdin. (design.md §6.1)
- FR-2.21b: `--dry-run` does not emit exit 4 on manual criteria. (design.md §6.1)
- FR-2.21c: `--dry-run` prefixes its default stdout with `[DRY RUN — state file not modified]`. (design.md §6.6)

#### FR-2.22–2.28 Control flow and exit codes

- FR-2.22: When every criterion of the target task ends `PASS`, CheckRunner calls `advanceTask` before exiting. (design.md §6.1)
- FR-2.23a: `run` exits 0 only when every criterion ends PASS. (D7; design.md §6.4)
- FR-2.23b: `run` exits 0 only when the task was advanced by CheckRunner in the same invocation. (D7; design.md §6.4)
- FR-2.24: `run` exits 1 when one or more criteria ended FAIL; stderr lists which. (D7; design.md §6.4)
- FR-2.25: `run` exits 2 on system error — criterion timeout bubble-up, StateManager write failure, malformed state. (D7; design.md §6.4)
- FR-2.26: `run` exits 3 on `plan_checksum` mismatch detected on read. (D7; design.md §6.4)
- FR-2.27a: `--json` emits a single JSON object to stdout. (design.md §6.5)
- FR-2.27b: The JSON object includes `task`, `results[]`, `summary: {passed, failed, manual}`, `advanced: boolean`. (design.md §6.5)
- FR-2.28: CheckRunner imports StateManager's programmatic API directly (no subprocess). (design.md §10 anti-pattern #6)

#### FR-2.29–2.35 Additional behaviors

- FR-2.29: On system error (exit 2), CheckRunner aborts criterion iteration; remaining pending criteria are not coerced to FAIL. (design.md §6.4)
- FR-2.30: Under `stdin` strategy, `--answer <response>` is accepted as a scripted shortcut (no stdin read). (design.md §6.1 flag description)
- FR-2.31: CheckRunner emits `plan.criterion.passed` on manual-criterion PASS (under `stdin` or after `askuser` resume). (design.md §6.3 step 5)
- FR-2.32: CheckRunner emits `plan.criterion.failed` on manual-criterion FAIL (empty answer). (design.md §6.3 step 5)
- FR-2.33: CheckRunner emits no `plan.*` events under `--dry-run`. (design.md §6.6)
- FR-2.34: On `plan_checksum` mismatch, CheckRunner exits 3 before any `updateCriterion` call. (design.md §6.4; D7)
- FR-2.35: `--json` prints no other stdout lines during a `run` (no interleaved prose). (design.md §6.5)

### FR-3: PlanGate PreToolUse hook

#### FR-3.1 Matcher registration

- FR-3.1a: PlanGate fires on the PreToolUse event for the `Bash` matcher. (D12; design.md §2.2)
- FR-3.1b: PlanGate fires on the PreToolUse event for the `Edit` matcher. (D12; design.md §2.2)
- FR-3.1c: PlanGate fires on the PreToolUse event for the `Write` matcher. (D12; design.md §2.2)

#### FR-3.2 Stdin parsing

- FR-3.2: PlanGate reads stdin via `readHookInput()` imported from `~/.claude/hooks/lib/hook-io.ts`. (D3; design.md §9.1)

#### FR-3.3–3.4 Active-plan discovery

- FR-3.3: When the active-plan pointer file (`~/.claude/MEMORY/STATE/plan-executor.active.json`) is absent, PlanGate returns ALLOW silently. (design.md §7.3)
- FR-3.4a: When the pointer exists but `validation_path` does not resolve on disk, PlanGate returns ALLOW. (design.md §7.3, fail-open for pointer staleness)
- FR-3.4b: Under FR-3.4a, PlanGate emits a `hook.error` event via `appendEvent`. (design.md §7.3)

#### FR-3.5 State-file write protection

- FR-3.5a: When `tool_name` is `Write` and `realpath(tool_input.file_path)` equals `realpath(pointer.validation_path)`, PlanGate BLOCKS with `reason_code: "state_file_write_attempt"`. (design.md §7.4 step 2)
- FR-3.5b: When `tool_name` is `Edit` and `realpath(tool_input.file_path)` equals `realpath(pointer.validation_path)`, PlanGate BLOCKS with `reason_code: "state_file_write_attempt"`. (design.md §7.4 step 2)
- FR-3.5c: State-file write protection applies regardless of current task status (even when task is PASS). (design.md §7.4 step 2 "applies BEFORE allow-list")

#### FR-3.6–3.7 Allow-list

- FR-3.6: When active plan exists and the Bash command's resolved token set includes `realpath(~/.claude/PAI/Tools/StateManager.ts)`, PlanGate ALLOWS. (D2; design.md §7.4 step 3)
- FR-3.7: When active plan exists and the Bash command's resolved token set includes `realpath(~/.claude/PAI/Tools/CheckRunner.ts)`, PlanGate ALLOWS. (D2; design.md §7.4 step 3)

#### FR-3.8–3.10 Task-status gating

- FR-3.8a: When active plan exists and `current_task.status` is not `PASS` and `tool_name` is `Bash` (and not allow-listed), PlanGate BLOCKS with `reason_code: "task_not_pass"`. (design.md §7.4 step 3)
- FR-3.9a: When active plan exists and `current_task.status` is not `PASS` and `tool_name` is `Edit`, PlanGate BLOCKS with `reason_code: "task_not_pass"`. (design.md §7.4 step 3)
- FR-3.9b: When active plan exists and `current_task.status` is not `PASS` and `tool_name` is `Write`, PlanGate BLOCKS with `reason_code: "task_not_pass"`. (design.md §7.4 step 3)
- FR-3.10a: When active plan exists and `current_task.status` is `PASS` and `tool_name` is `Bash`, PlanGate ALLOWS. (design.md §7.4 step 3)
- FR-3.10b: When active plan exists and `current_task.status` is `PASS` and `tool_name` is `Edit`, PlanGate ALLOWS. (design.md §7.4 step 3)
- FR-3.10c: When active plan exists and `current_task.status` is `PASS` and `tool_name` is `Write`, PlanGate ALLOWS. (design.md §7.4 step 3)

#### FR-3.11 Checksum drift

- FR-3.11: When `readState` throws `ChecksumError`, PlanGate BLOCKS with `reason_code: "checksum_drift"`. (design.md §7.4 step 1, §8.3)

#### FR-3.12 Block output envelope

- FR-3.12a: Block output's top-level object key is `hookSpecificOutput`. (design.md §7.5)
- FR-3.12b: `hookSpecificOutput.hookEventName` equals the string `"PreToolUse"`. (design.md §7.5)
- FR-3.12c: `hookSpecificOutput.permissionDecision` equals the string `"deny"`. (design.md §7.5)
- FR-3.12d: `hookSpecificOutput.permissionDecisionReason` is a non-empty string. (design.md §7.5)
- FR-3.12e: Block output is written to stdout (not stderr). (design.md §7.5)

#### FR-3.13 Allow output

- FR-3.13: Allow output produces no bytes on stdout. (design.md §7.5)

#### FR-3.14 Block reason content

- FR-3.14a: Block `permissionDecisionReason` names the failing task id. (design.md §7.5)
- FR-3.14b: Block `permissionDecisionReason` names the failing task's human name. (design.md §7.5)
- FR-3.14c: Block `permissionDecisionReason` contains the exact string `bun ~/.claude/PAI/Tools/CheckRunner.ts run --task <id>` with the real task id substituted. (design.md §7.5)

#### FR-3.15–3.16 Handler-delegate pattern (D3)

- FR-3.15: The hook wrapper (`PlanGate.hook.ts`) delegates all decision logic to a pure function `PlanGateHandler.decide(input)`. (D3; design.md §7.1)
- FR-3.16a: `PlanGateHandler.decide` performs no stdin reads. (D3; design.md §7.1)
- FR-3.16b: `PlanGateHandler.decide` does not call `process.exit`. (D3; design.md §7.1)
- FR-3.16c: `PlanGateHandler.decide`'s only permitted filesystem side effect is calling `appendEvent()`. (D3; design.md §7.1)

#### FR-3.17 Graceful failure

- FR-3.17: PlanGate fails open on unexpected (unanticipated) exceptions per hook graceful-failure convention — it prints no block envelope and exits 0. (design.md §7.1; THEHOOKSYSTEM.md §Graceful Failure)

#### FR-3.18 Event emission

- FR-3.18: PlanGate emits `plan.gate.allowed` on every ALLOW decision via `appendEvent`. (D5; design.md §7.6)
- FR-3.19: PlanGate emits `plan.gate.blocked` on every BLOCK decision via `appendEvent`. (D5; design.md §7.6)
- FR-3.20: The `reason_code` field on emitted `plan.gate.blocked` events is one of `{"task_not_pass", "state_file_write_attempt", "checksum_drift", "state_malformed"}`. (D5; design.md §7.6, §10 #4)

#### FR-3.21 Exit code

- FR-3.21: PlanGate exits 0 on every allow and block decision (block is signalled via `permissionDecision` content, never via exit code). (design.md §7.5 "Schema verified 2026-04-21")

#### FR-3.22–3.26 State-malformed and edge cases

- FR-3.22: When the active-plan pointer is present but state parsing fails (malformed JSON or schema violation), PlanGate BLOCKS with `reason_code: "state_malformed"`. (design.md §10 anti-pattern #4)
- FR-3.23: PlanGate's `readState` call uses `pointer.validation_path` as the sole source of the state file location (no hardcoded paths). (design.md §7.3, §7.4)
- FR-3.24: PlanGate BLOCK `permissionDecisionReason` includes a single CheckRunner command line the operator can copy-paste to resolve the block. (design.md §7.5 exemplar)
- FR-3.25: PlanGate's decision is a pure function of `{tool_name, tool_input, pointer, state}` — no dependency on session-scoped identifiers beyond `session_id` event injection. (D3; design.md §7.1)
- FR-3.26: When PlanGate is invoked with an unexpected `tool_name` (not in `{Bash, Edit, Write}`), it returns ALLOW. (design.md §7.2 shape; defensive — matcher registration should prevent this)

### FR-4: Plan checksum algorithm

#### FR-4.1 Hash and domain

- FR-4.1a: The hash function is SHA-256. (D8; design.md §8.1 step 4)
- FR-4.1b: Hash input is a canonical JSON string (UTF-8 bytes). (design.md §8.1 step 3, step 4)
- FR-4.1c: The canonical JSON string is the criteria projection, not the full validation.json. (design.md §8.1 step 2)

#### FR-4.2–4.3 Projection fields

- FR-4.2a: The projection retains `check` on each criterion. (design.md §8.1 step 2)
- FR-4.2b: The projection retains `type` on each criterion. (design.md §8.1 step 2)
- FR-4.2c: The projection retains `command` on automated criteria. (design.md §8.1 step 2)
- FR-4.2d: The projection retains `prompt` on manual criteria. (design.md §8.1 step 2)
- FR-4.3a: The projection drops criterion `status`. (design.md §8.1 step 2)
- FR-4.3b: The projection drops criterion `evidence`. (design.md §8.1 step 2)
- FR-4.3c: The projection drops criterion `fix_attempts` (task-level state). (design.md §8.1 step 2)

#### FR-4.4 Ordering rules

- FR-4.4a: Phase-ids are sorted lexicographically in the projection. (design.md §8.1 step 2)
- FR-4.4b: Task-ids are sorted in natural dotted-numeric order within each phase. (design.md §8.1 step 2)
- FR-4.4c: Criterion-ids are sorted numerically when every id parses as an integer; lexicographically otherwise. (design.md §8.1 step 2)

#### FR-4.5 Canonicalization

- FR-4.5: The canonical JSON contains no insignificant whitespace (no extra spaces, tabs, or newlines between tokens). (design.md §8.1 step 3)

#### FR-4.6 Output format

- FR-4.6a: The checksum output is prefixed with the literal string `sha256:`. (design.md §8.1 step 5)
- FR-4.6b: The hex digest portion is lowercase. (design.md §8.1 step 5)

#### FR-4.7–4.14 Algebraic properties

- FR-4.7: Reordering phases, tasks, or criteria in the source JSON does not change the checksum (ordering-stability). (design.md §8.1; §12.1 "determinism")
- FR-4.8: Changing a single character of any `command` changes the checksum (sensitivity). (design.md §12.1 "sensitivity")
- FR-4.9a: Changing a single character of any `prompt` changes the checksum (sensitivity — manual-criterion side). (design.md §12.1)
- FR-4.9b: Adding a criterion changes the checksum. (design.md §8.3 tamper-detection intent)
- FR-4.9c: Removing a criterion changes the checksum. (design.md §8.3)
- FR-4.10: The checksum is computed exactly once at `init` and recomputed on every `read`. (design.md §8.2)
- FR-4.11: The projection drops top-level state fields `status`, `current_task`, `current_phase`, `initialized`, `notes`. (design.md §8.1 step 2 — only phases/tasks/criteria contribute)
- FR-4.12: The projection drops `verified_at` on every task (state, not structure). (design.md §8.1 step 2)
- FR-4.13: Reordering keys within a criterion object (e.g. `{type, check}` vs `{check, type}`) does not change the checksum. (design.md §8.1 step 3 "stable sorted object keys")
- FR-4.14: Renaming a task id (e.g. `"2.1"` → `"2.1-old"`) changes the checksum (structural identity includes ids). (design.md §8.1 step 2 by construction)

### FR-5: Observability (event emitter)

#### FR-5.1–5.4 Log and envelope

- FR-5.1: Events are written to `<project-root>/.plan-executor/events.jsonl`. (D5 revised; design.md §9.3)
- FR-5.2: `<project-root>` is derived from the active-plan pointer's `validation_path` parent directory. (design.md §9.3)
- FR-5.3: `appendEvent(event)` auto-injects an ISO-8601 UTC `timestamp`. (design.md §9.3)
- FR-5.4a: `appendEvent(event)` auto-injects `session_id` from the `CLAUDE_SESSION_ID` env var. (design.md §9.3)
- FR-5.4b: `appendEvent(event)` sets `session_id` to the literal string `"unknown"` when `CLAUDE_SESSION_ID` is unset. (design.md §9.3)

#### FR-5.5 `plan.gate.blocked` event fields

- FR-5.5a: `plan.gate.blocked` includes `tool` (one of `Bash`, `Edit`, `Write`). (D5; design.md §9.3)
- FR-5.5b: `plan.gate.blocked` includes `task` (current task id). (design.md §9.3)
- FR-5.5c: `plan.gate.blocked` includes `reason_code` (one of the FR-3.20 enum). (design.md §9.3)
- FR-5.5d: `plan.gate.blocked` includes `target_path` only when `reason_code` is `state_file_write_attempt`. (design.md §9.3 "optional `target_path`")

#### FR-5.6 `plan.gate.allowed` event fields

- FR-5.6a: `plan.gate.allowed` includes `tool`. (design.md §9.3)
- FR-5.6b: `plan.gate.allowed` includes `task`. (design.md §9.3)

#### FR-5.7 `plan.task.advanced` event fields

- FR-5.7a: `plan.task.advanced` includes `from_task`. (design.md §9.3)
- FR-5.7b: `plan.task.advanced` includes `to_task`. (design.md §9.3)
- FR-5.7c: `plan.task.advanced` includes `phase_rolled` (boolean, only when true). (design.md §9.3)
- FR-5.7d: `plan.task.advanced` includes `plan_completed` (boolean, only when true). (design.md §9.3)

#### FR-5.8 `plan.criterion.passed` event fields

- FR-5.8a: `plan.criterion.passed` includes `task`. (design.md §9.3)
- FR-5.8b: `plan.criterion.passed` includes `criterion`. (design.md §9.3)
- FR-5.8c: `plan.criterion.passed` includes `evidence_len` (integer). (design.md §9.3)

#### FR-5.9 `plan.criterion.failed` event fields

- FR-5.9a: `plan.criterion.failed` includes `task`. (design.md §9.3)
- FR-5.9b: `plan.criterion.failed` includes `criterion`. (design.md §9.3)
- FR-5.9c: `plan.criterion.failed` includes `exit_code` when the criterion was automated; absent for manual criteria. (design.md §9.3)
- FR-5.9d: `plan.criterion.failed` includes `evidence_snippet` (first 240 characters of evidence). (design.md §9.3)

#### FR-5.10–5.17 Emitter behavior

- FR-5.10: `appendEvent` write errors are swallowed — observability never throws back to the host caller. (design.md §9.2 emitter row)
- FR-5.11: No events are written when no active-plan pointer is present. (design.md §9.3)
- FR-5.12: `appendEvent` creates the `<project-root>/.plan-executor/` directory if it does not exist before appending. (design.md §9.3 operational requirement)
- FR-5.13: Each event is written as one JSON object per line, UTF-8 encoded, terminated by `\n`. (design.md §9.3 "one JSON object per line")
- FR-5.14: Each event object includes a caller-supplied `source` field (e.g., `"PlanGate"`, `"StateManager"`, `"CheckRunner"`). (design.md §7.6 examples)
- FR-5.15: `plan.criterion.failed.exit_code` is absent (not set to `null` or `-1`) for manual criteria. (design.md §9.3 "optional")
- FR-5.16: `plan.task.advanced.phase_rolled` is absent or `false` when the advancement stayed within the same phase. (design.md §9.3)
- FR-5.17: `plan.gate.blocked.target_path` is absent on `reason_code`s other than `state_file_write_attempt`. (design.md §9.3)

---

## Technical Requirements

### TR-1: Deployment topology (D1; TOOLS.md "Adding New Tools")

- TR-1.1: `StateManager.ts` deploys to `~/.claude/PAI/Tools/StateManager.ts`. (design.md §2.1)
- TR-1.2: `CheckRunner.ts` deploys to `~/.claude/PAI/Tools/CheckRunner.ts`. (design.md §2.1)
- TR-1.3: `PlanGate.hook.ts` deploys to `~/.claude/hooks/PlanGate.hook.ts`. (design.md §2.1)
- TR-1.4a: The deployed StateManager filename is Title-Case `StateManager.ts` (not `state-manager.ts`). (design.md §2.1; TOOLS.md §Adding New Tools)
- TR-1.4b: The deployed CheckRunner filename is Title-Case `CheckRunner.ts`. (design.md §2.1)
- TR-1.4c: The deployed hook filename carries the `.hook.ts` double-suffix: `PlanGate.hook.ts`. (design.md §2.1; THEHOOKSYSTEM.md naming)
- TR-1.5: No subdirectories exist under `~/.claude/PAI/Tools/` at deploy time. (design.md §2.1; TOOLS.md)
- TR-1.6: `src/lib/*.ts` files are inlined into each consumer entry point at deploy (bundling). (D13; design.md §9.4)
- TR-1.7: `src/handlers/PlanGateHandler.ts` is inlined into `PlanGate.hook.ts` at deploy. (design.md §2.1, §9.4)
- TR-1.8a: Deployed `StateManager.ts` is executable (`chmod +x`). (design.md §2.3 step 1)
- TR-1.8b: Deployed `CheckRunner.ts` is executable. (design.md §2.3 step 1)
- TR-1.8c: Deployed `PlanGate.hook.ts` is executable. (design.md §2.3 step 1)
- TR-1.9a: Deployed `StateManager.ts` responds to `--help`. (design.md §2.3 step 4)
- TR-1.9b: Deployed `CheckRunner.ts` responds to `--help`. (design.md §2.3 step 4)
- TR-1.10: No separate `PlanGateHandler.ts` file exists under `~/.claude/hooks/` after deploy (inlined per D13/§9.4). (design.md §9.4; AR via negative assertion)
- TR-1.11: Each deployed executable begins with the shebang `#!/usr/bin/env bun` as its first line. (design.md §2.3; TOOLS.md Inference.ts precedent)
- TR-1.12: Claude Code restart is required after editing `settings.json`; the hook is loaded at startup. (design.md §2.3 trailing; THEHOOKSYSTEM.md §Creating Custom Hooks step 6)

### TR-2: `settings.json` registration (D12)

- TR-2.1: `PlanGate.hook.ts` appears as a PreToolUse hook on the `Bash` matcher. (design.md §2.2)
- TR-2.2: `PlanGate.hook.ts` appears as a PreToolUse hook on the `Edit` matcher. (design.md §2.2)
- TR-2.3: `PlanGate.hook.ts` appears as a PreToolUse hook on the `Write` matcher. (design.md §2.2)
- TR-2.4a: On the `Bash` matcher, `SecurityValidator.hook.ts` appears before `PlanGate.hook.ts` (sequential order). (D12; design.md §2.2)
- TR-2.4b: On the `Edit` matcher, `SecurityValidator.hook.ts` appears before `PlanGate.hook.ts`. (D12; design.md §2.2)
- TR-2.4c: On the `Write` matcher, `SecurityValidator.hook.ts` appears before `PlanGate.hook.ts`. (D12; design.md §2.2)
- TR-2.5: Existing `SecurityValidator.hook.ts` entries remain unchanged (PlanGate is added, not replacing). (D12; implementation-plan.md Task 8.3)
- TR-2.6: Registration uses the `${PAI_DIR}/hooks/PlanGate.hook.ts` command template. (design.md §2.2)
- TR-2.7: Unrelated PreToolUse matchers (`Read`, `AskUserQuestion`, `Task`, `Skill`) remain unchanged after registration. (design.md §2.2)
- TR-2.8: `settings.json` remains valid JSON (parsable by `jq`) after the edit. (implementation-plan.md Task 8.3 criterion 1)
- TR-2.9: `SecurityValidator.hook.ts` appears exactly once per matcher (no duplication introduced by the PlanGate edit). (implementation-plan.md Task 8.3 defensive)
- TR-2.10: `PlanGate.hook.ts` appears exactly once per matcher (idempotent registration — re-running the edit does not double-add). (implementation-plan.md Task 8.3 idempotency)

### TR-3: CLI conventions (D4, D6; CLIFIRSTARCHITECTURE.md)

- TR-3.1a: StateManager uses Tier 1 argv parsing (zero framework dependencies). (D4)
- TR-3.1b: CheckRunner uses Tier 1 argv parsing (zero framework dependencies). (D4)
- TR-3.2a: StateManager supports a top-level `--json` flag. (D6; design.md §4 preamble)
- TR-3.2b: CheckRunner supports a top-level `--json` flag. (D6; design.md §6 preamble)
- TR-3.3a: StateManager supports a top-level `--verbose` flag. (D6)
- TR-3.3b: CheckRunner supports a top-level `--verbose` flag. (D6)
- TR-3.4a: StateManager supports `--help` and `-h` at top level and per-subcommand. (design.md §4.8; AR-11)
- TR-3.4b: CheckRunner supports `--help` and `-h` at top level and per-subcommand. (design.md §6 preamble; AR-11)
- TR-3.5a: On error, both CLIs print `ERROR: <E_CODE>: <human message>` to stderr. (design.md §4.8)
- TR-3.5b: The error code prefix `E_` matches the set defined in design.md §4.1–4.4 and §6.4. (design.md §4.8)
- TR-3.6: With `--json`, errors also print a JSON object `{"ok":false,"error":"E_CODE","message":"..."}` to stdout. (design.md §4.8)

### TR-4: Exit codes (D7)

- TR-4.1: Exit code `0` signals success. (D7; design.md §4 preamble)
- TR-4.2: Exit code `1` signals user error or a check-FAIL result. (D7)
- TR-4.3: Exit code `2` signals system error (I/O, malformed JSON, timeout bubble-up). (D7)
- TR-4.4: Exit code `3` signals plan-checksum mismatch. (D7; design.md §8.3)
- TR-4.5: Exit code `4` is CheckRunner-only and signals a manual criterion needs `AskUserQuestion`. (D7; design.md §6.4)
- TR-4.6: Exit codes 5+ are unused and MUST NOT be assigned by these tools. (D7 implicit by enumeration)

### TR-5: Atomic write strategy (D9)

- TR-5.1a: State writes create a temp file adjacent to the target. (D9; design.md §5 `writeState`)
- TR-5.1b: The temp filename is `<target>.tmp` (exactly that suffix). (D9; design.md §5)
- TR-5.1c: The write is finalized via `fs.renameSync(temp, target)`. (D9; design.md §5)
- TR-5.2: The temp file is created in the same directory as the target (POSIX rename atomicity requires same filesystem). (D9; design.md §5)
- TR-5.3: State writes do not acquire file locks (`flock`, `fcntl`, or OS advisory locks). (D9)
- TR-5.4: `fsync` is called on the temp file's file descriptor before `rename`. (D9; design.md §5 `writeState`)
- TR-5.5: A partial write is never observable by a concurrent reader. (design.md §10 anti-pattern #7)
- TR-5.6: `fsync` is called on the file descriptor only (not on the containing directory — per D9). (D9)
- TR-5.7: No flavor of OS-level lock is acquired at any point during write. (D9 explicit)
- TR-5.8: Active-plan pointer writes use the same temp-file + rename pattern as state writes (`plan-executor.active.json.tmp` → `plan-executor.active.json`). (Scope change 2026-04-21; D9 generalisation; FR-1.38d)
- TR-5.9: Active-plan pointer deletes are a single `fs.unlinkSync` call — failures are caught, logged as `hook.error` events, and do NOT throw back to `advance-task`'s caller. (Scope change 2026-04-21; FR-1.39b, FR-1.39c)

### TR-6: Hook contract (D3; THEHOOKSYSTEM.md)

- TR-6.1: `PlanGate.hook.ts` imports `readHookInput` from `~/.claude/hooks/lib/hook-io.ts`. (D3; design.md §9.1)
- TR-6.2: `PlanGate.hook.ts` respects the 500 ms stdin-read timeout of `readHookInput`. (design.md §9.1; THEHOOKSYSTEM.md §Hook Input)
- TR-6.3: Block output is emitted as a single JSON object on stdout matching the `permissionDecision` schema. (design.md §7.5)
- TR-6.4: Allow output produces no stdout. (design.md §7.5)
- TR-6.5: The hook exits 0 regardless of allow/block decision (no exit-2-with-stderr pattern). (design.md §7.5)
- TR-6.6: The handler-delegate pattern matches PAI precedent (LastResponseCache, PRDSync, MdListGuard, VoiceCompletion, DocIntegrity). (D3; design.md §7.1)
- TR-6.7: `readHookInput`'s 500 ms timeout is used as shipped and is not extended, shortened, or bypassed. (D3; design.md §9.1)

### TR-7: Library layering (D13)

- TR-7.1: All four project-local library files live under `src/lib/` in the dev repo. (D13)
- TR-7.2: `src/lib/state-types.ts` contains only type definitions (zero runtime code). (D13; design.md §9.2)
- TR-7.3: `src/lib/event-types.ts` contains only type definitions (zero runtime code). (D13; design.md §9.2)
- TR-7.4: `src/lib/hook-types.ts` contains only type definitions (zero runtime code). (D13; design.md §9.2)
- TR-7.5: `src/lib/event-emitter.ts` contains the `appendEvent` runtime and imports types from `event-types.ts`. (D13; design.md §9.2)
- TR-7.6: `src/StateManager.ts` imports from `./lib/state-types`. (D13; implementation-plan.md Task 4.2 criterion 3)
- TR-7.7: `src/CheckRunner.ts` imports from `./lib/event-emitter`. (D13; implementation-plan.md Task 5.2 criterion 3)
- TR-7.8: `src/PlanGate.hook.ts` or `src/handlers/PlanGateHandler.ts` imports from `./lib/hook-types`. (D13; implementation-plan.md Task 6.2 criterion 4)
- TR-7.9: Library file base names carry no suffix (no `-mvp`, no `-local`). (D13)
- TR-7.10: `src/handlers/PlanGateHandler.ts` imports `appendEvent` from `../lib/event-emitter` (handler emits events, wrapper does not). (D3; D13; design.md §7.1)

### TR-8: Allow-list logic (D2)

- TR-8.1a: Bash allow-list match for StateManager is `realpath(token) == realpath(~/.claude/PAI/Tools/StateManager.ts)`. (D2; design.md §7.4)
- TR-8.1b: Bash allow-list match for CheckRunner is `realpath(token) == realpath(~/.claude/PAI/Tools/CheckRunner.ts)`. (D2; design.md §7.4)
- TR-8.2a: Realpath resolution resolves symlinks before comparison. (D2; design.md §7.4)
- TR-8.2b: Realpath resolution expands `$HOME` and `~` before comparison. (D2; design.md §7.4)
- TR-8.3: The resolved target file must exist on disk for the allow-list to match. (D2)
- TR-8.4: No environment-variable secrets are used for allow-list identification. (D2; design.md §10 anti-pattern #5)
- TR-8.5: Bash command tokenization handles quoted arguments and shell line-continuations (`\`-newline). (design.md §12.1 PlanGateHandler pure surface)
- TR-8.6: A path is "under the project root" iff `realpath(target)` starts with `realpath(project_root_from_pointer) + "/"`. (design.md §7.4)
- TR-8.7: Allow-list comparison is performed against `realpath(token)`, not against the raw token string. (D2; design.md §7.4)
- TR-8.8: Allow-list comparison does not use substring matching (e.g., `command.includes("StateManager")` is FORBIDDEN — a file named `malicious-StateManager.ts` must not match). (D2)

### TR-9: Documentation (TOOLS.md §Adding New Tools)

- TR-9.1: `~/.claude/PAI/TOOLS.md` receives a new section titled `## StateManager.ts - Plan-Execution State File Manager`. (design.md §11.1; implementation-plan.md Task 8.4)
- TR-9.2: `~/.claude/PAI/TOOLS.md` receives a new section titled `## CheckRunner.ts - Plan-Execution Check Runner`. (design.md §11.2; implementation-plan.md Task 8.4)
- TR-9.3a: The StateManager section contains a `Location:` line with the deployed absolute path. (TOOLS.md §Adding New Tools step 2)
- TR-9.3b: The StateManager section contains a `**Usage:**` subsection with runnable examples. (TOOLS.md step 2)
- TR-9.3c: The StateManager section contains a `**When to Use:**` subsection. (TOOLS.md step 2)
- TR-9.3d: The StateManager section contains a `**Technical Details:**` subsection. (TOOLS.md step 2)
- TR-9.3e: The CheckRunner section contains `Location:`, `**Usage:**`, `**When to Use:**`, `**Environment Variables:**` (lists `CHECKRUNNER_TIMEOUT_MS`), and `**Technical Details:**` subsections. (TOOLS.md step 2; design.md §11.2)
- TR-9.4: `~/.claude/PAI/SKILL.md` indexes `TOOLS.md` in its documentation list. (TOOLS.md §Adding New Tools step 3)
- TR-9.5a: The StateManager section cites `~/.claude/PAI/Tools/StateManager.ts` as the deployed absolute path. (design.md §11.1)
- TR-9.5b: The CheckRunner section cites `~/.claude/PAI/Tools/CheckRunner.ts` as the deployed absolute path. (design.md §11.2)

### TR-10: Testing scope (no Tier C — design.md §12.3)

- TR-10.1: Tier A unit tests cover every exported function in design.md §5 (StateManager API). (design.md §12.1)
- TR-10.2a: Tier A unit tests cover CheckRunner stdout classification (PASS / FAIL / timeout / no-marker). (design.md §12.1)
- TR-10.2b: Tier A unit tests cover CheckRunner evidence extraction (multi-line, trim rules). (design.md §12.1)
- TR-10.2c: Tier A unit tests cover CheckRunner manual-prompt stdin path (empty vs non-empty answer). (design.md §12.1)
- TR-10.2d: Tier A unit tests cover CheckRunner `--dry-run` non-mutation property. (design.md §12.1)
- TR-10.2e: Tier A unit tests cover CheckRunner exit-4 payload shape under `askuser` strategy. (design.md §12.1)
- TR-10.3a: Tier A unit tests exercise `PlanGateHandler.decide` for every combination of `{tool ∈ {Bash, Edit, Write}} × {task.status ∈ {PENDING, IN_PROGRESS, PASS}} × {target_path ∈ {validation.json, other-in-project, out-of-project, StateManager.ts, CheckRunner.ts}}`. (design.md §12.1)
- TR-10.3b: Tier A unit tests verify the `reason_code` assignment matrix per FR-3.20. (design.md §12.1)
- TR-10.4: Tier A unit tests include unknown-field preservation across read-merge-write (D11). (design.md §12.1; D11)
- TR-10.5: Tier B integration tests cover happy-path multi-task phase advancement. (design.md §12.2 Flow 1)
- TR-10.6: Tier B integration tests cover red-then-green fix cycle. (design.md §12.2 Flow 2)
- TR-10.7: Tier B integration tests cover PlanGate block/allow decisions in-band (state-file write attempt, allow-list, task-PASS). (design.md §12.2 Flow 3)
- TR-10.8: Tier B integration tests cover manual criterion under `stdin` strategy. (design.md §12.2 Flow 4)
- TR-10.9: Tier B integration tests cover manual criterion under `askuser` strategy (exit-4 + `--answer` resume). (design.md §12.2 Flow 5)
- TR-10.10: Tier B integration tests cover `plan_checksum` drift detection across StateManager, CheckRunner, and PlanGate. (design.md §12.2 Flow 6)
- TR-10.11: Tier B integration tests cover atomic-write crash simulation (fault injection between temp-write and rename). (design.md §12.2 Flow 7)
- TR-10.12: Every FR and TR in this document maps to ≥1 test entry in the Phase 3 `docs/test-plan.md`. (implementation-plan.md Task 3.1 briefing)
- TR-10.13: Every AR in this document maps to ≥1 negative test in the Phase 3 `docs/test-plan.md`. (implementation-plan.md Task 3.1 criterion 4)

### TR-11: Runtime & tooling

- TR-11.1: Both CLIs and the hook run under Bun (TypeScript) with a `#!/usr/bin/env bun` shebang when executable. (design.md §2.3; TOOLS.md Inference.ts precedent)
- TR-11.2: `tsconfig.json` uses `strict: true`. (validation.json Task 1.1 criterion 3; scaffold confirmation)
- TR-11.3: `tsconfig.json` includes `bun-types`. (validation.json Task 1.1 criterion 3; scaffold confirmation)
- TR-11.4: Test runner is `bun test`. (README.md §Development Workflow; implementation-plan.md Phase 4+)
- TR-11.5: Deployed files are valid TypeScript that Bun can execute directly (no prior compile step). (design.md §2.3 step 4 — `bun <file> --help` must return synchronously)

---

## Anti-Requirements

- AR-1: MUST NOT allow the AI to edit `validation.json` directly — PlanGate BLOCKs writes whose target resolves to `validation_path`. (design.md §10 anti-pattern #1; FR-3.5a/b)
- AR-2: MUST NOT compute `plan_checksum` over the prose `implementation-plan.md`. (design.md §10 anti-pattern #2; D8)
- AR-3: MUST NOT skip `plan_checksum` validation on any `readState` call. (design.md §10 anti-pattern #3; FR-4.10)
- AR-4: MUST NOT fail-open on malformed state when an active-plan pointer is present (fail-open applies only to the absent-pointer case). (design.md §10 anti-pattern #4; FR-3.22)
- AR-5: MUST NOT use environment-variable secrets for the allow-list (D2 threat model). (design.md §10 anti-pattern #5; TR-8.4)
- AR-6: MUST NOT call StateManager CLI from CheckRunner via subprocess — same-process programmatic API is required. (design.md §10 anti-pattern #6; FR-2.28)
- AR-7: MUST NOT write state without atomic rename — temp-file + fsync + rename is required. (design.md §10 anti-pattern #7; TR-5.*)
- AR-8: MUST NOT let `PlanGate.hook.ts` implement its own stdin parsing — must use `readHookInput()` from `hook-io.ts`. (design.md §10 anti-pattern #8; D3)
- AR-9: MUST NOT place manual-criterion prompt logic in StateManager — UX lives entirely in CheckRunner. (design.md §10 anti-pattern #9)
- AR-10: MUST NOT use exit code `0` for a FAIL result in CheckRunner — exit 0 is reserved for "all PASS AND task advanced". (design.md §10 anti-pattern #10; FR-2.23a/b)
- AR-11: MUST NOT ship any CLI without a working `--help` at top level and per-subcommand. (design.md §10 anti-pattern #11; FR-1.26, TR-3.4a/b)
- AR-12: MUST NOT gate normal skill invocations — when no `validation.json` pointer is active, every tool call passes freely. (design.md §10 anti-pattern #12; BR-12)
- AR-13: MUST NOT emit PlanGate's block output on stderr — stdout is the only correct channel per the current Claude Code hook schema. (design.md §7.5; FR-3.12e)
- AR-14: MUST NOT return a non-zero exit code from `PlanGate.hook.ts` — block is signalled via `permissionDecision: "deny"`, not via exit code. (design.md §7.5; FR-3.21)
- AR-15: MUST NOT invoke `AskUserQuestion` from within CheckRunner's process — askuser strategy exits 4 and hands off to the orchestrator. (design.md §6.3; D10)
- AR-16: MUST NOT emit events when no active-plan pointer is present (events are per-plan artifacts, not session artifacts). (design.md §9.3; FR-5.11)
- AR-17: MUST NOT include state data (`status`, `evidence`, `verified_at`, `fix_attempts`) in the plan checksum — the checksum is structural only. (design.md §8.1 step 2; FR-4.3a/b/c, FR-4.12)
- AR-18: MUST NOT add new top-level fields to `validation.json` via StateManager writes — unknown fields are preserved, not authored. Authoring is hand-editing or a future PlanParser. (D11; FR-1.30a/b)
- AR-19: MUST NOT call StateManager write operations from within PlanGate's decision function — the hook is read-only. (design.md §7.1; FR-3.16c)
- AR-20: MUST NOT install PlanGate as a PostToolUse hook — PreToolUse is required because blocking a completed write is too late. (design.md §2.2; FR-3.1a/b/c)
- AR-21: MUST NOT author Tier C (LLM-behavior) tests for this project — all tests are Tier A (unit) or Tier B (integration). (design.md §12.3; implementation-plan.md §Delegation Reference note)

---

## Requirements coverage table (by artifact)

| Artifact | BR | FR | TR | AR |
|---|---|---|---|---|
| StateManager.ts (CLI + API) | BR-1, BR-5, BR-6, BR-15 | FR-1.* (FR-1.1a..FR-1.37), FR-4.*, FR-5.7a–d | TR-1.1, TR-1.4a, TR-1.5, TR-1.6, TR-1.8a, TR-1.9a, TR-1.11, TR-3.1a, TR-3.2a, TR-3.3a, TR-3.4a, TR-3.5a, TR-3.5b, TR-3.6, TR-4.1–4.4, TR-5.*, TR-7.1, TR-7.2, TR-7.6, TR-7.9, TR-11.1, TR-11.5 | AR-1, AR-2, AR-3, AR-7, AR-11, AR-17, AR-18 |
| CheckRunner.ts (CLI) | BR-1, BR-17, BR-18 | FR-2.*, FR-5.8a–c, FR-5.9a–d | TR-1.2, TR-1.4b, TR-1.5, TR-1.6, TR-1.8b, TR-1.9b, TR-1.11, TR-3.1b, TR-3.2b, TR-3.3b, TR-3.4b, TR-3.5a/b, TR-3.6, TR-4.*, TR-7.1, TR-7.3, TR-7.5, TR-7.7, TR-7.9, TR-11.1, TR-11.5 | AR-6, AR-9, AR-10, AR-11, AR-15 |
| PlanGate.hook.ts + PlanGateHandler.ts | BR-2, BR-3, BR-4, BR-7, BR-8, BR-11, BR-12, BR-13, BR-16, BR-19 | FR-3.*, FR-5.5a–d, FR-5.6a–b | TR-1.3, TR-1.4c, TR-1.7, TR-1.8c, TR-1.10, TR-1.11, TR-1.12, TR-2.*, TR-6.*, TR-7.1, TR-7.4, TR-7.8, TR-7.9, TR-7.10, TR-8.*, TR-11.1, TR-11.5 | AR-1, AR-4, AR-5, AR-8, AR-12, AR-13, AR-14, AR-19, AR-20 |
| Plan checksum (FR-4) | BR-5 | FR-4.* | — | AR-2, AR-3, AR-17 |
| Event emitter (FR-5) | BR-9 | FR-5.* | TR-7.1, TR-7.3, TR-7.5, TR-7.9 | AR-16 |
| Deploy + docs | BR-10 | — | TR-1.*, TR-2.*, TR-9.* | — |
| Test coverage | BR-14 | — | TR-10.*, TR-11.4 | AR-21 |

---

## Summary of hardening (by the numbers)

| Section | Draft count | Hardened count | Delta |
|---|---|---|---|
| Business Requirements (BR) | 13 | 19 | +6 |
| Functional Requirements (FR) | 100 | 224 | +124 |
| Technical Requirements (TR) | 77 | 115 | +38 |
| Anti-Requirements (AR) | 12 | 21 | +9 |
| **Total** | **202** | **379** | **+177** |

The net increase is driven by (1) splits of compound requirements into atomic independently-testable assertions (primary), and (2) coverage-gap additions for design.md sections and decision rationales that the draft under-specified (secondary).

---
