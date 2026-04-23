---
status: locked
updated: 2026-04-23
---

# Plan Executor Tools — Decision Log

Binding architectural decisions for the Plan Executor Tools build. Authored during the 2026-04-21 Algorithm run for design-doc research (PRD: `20260421-mvp-design-doc-research`). Every `D#` reference in `docs/design.md` and `implementation-plan.md` resolves to an entry below.

D1, D2, and D3 were pressure-tested via the Thinking skill's FirstPrinciples mode before being locked. The remaining decisions are direct consequences of the six PAI reference docs read during OBSERVE phase (CLI.md, CLIFIRSTARCHITECTURE.md, TOOLS.md, THEHOOKSYSTEM.md, CreateCLI SKILL.md, CreateSkill SKILL.md).

---

## D1 — Deployment location

**Decision:** `StateManager.ts` and `CheckRunner.ts` deploy to `~/.claude/PAI/Tools/`. `PlanGate.hook.ts` deploys to `~/.claude/hooks/`. **No skill wrapper.**

**Rationale:** A skill orchestrates (workflows, routing, USE WHEN activation); a tool executes (deterministic CLI). This project has no workflows, no routing, no USE WHEN surface — nothing routes to these components via skill activation. Matches the existing PAI/Tools/ precedent (Inference.ts, RemoveBg.ts, GetTranscript.ts). PAI/TOOLS.md explicitly says: *"Don't create a separate skill if the entire functionality is just a CLI command with parameters."*

**Unmitigated risk:** When full Architecture A workflows (Create/Execute/Fix/Status) are added later, we retrofit a `_PLANEXECUTOR` skill and migrate — forward refactor cost roughly one hour. Acceptable.

**FirstPrinciples decomposition:** captured in PRD THINK-phase output.

---

## D2 — Allow-list mechanism (PlanGate → CheckRunner)

**Decision:** B4 hybrid — PlanGate's allow-list check is `realpath` the Bash command's executable + match against `~/.claude/PAI/Tools/CheckRunner.ts` literal + verify file exists at that exact resolved path. Resolve symlinks and `$HOME` via `realpath` before match. **No env-var secrets** (they leak across processes).

**Rationale:** Drew's threat model is "my own AI acting under context pressure," not an adversarial attacker. Unambiguous identity needs either a shared secret, an input structure only the real tool produces, or a stable pre-agreed invocation shape that's mechanically awkward to fake. The realpath+exists check is friction — to bypass, the AI would have to construct a command that IS CheckRunner, in which case it's legitimate use. Compliance via friction.

**Unmitigated risk:** A motivated bypass could shim CheckRunner with a wrapper at the same resolved path (requires write access to `~/.claude/PAI/Tools/`). Defense-in-depth deferrable: add a signature file later if needed.

**FirstPrinciples decomposition:** captured in PRD THINK-phase output.

---

## D3 — Hook structure pattern

**Decision:** Handler-delegate pattern. `src/PlanGate.hook.ts` is a thin wrapper that reads stdin via `hooks/lib/hook-io.ts` and calls `PlanGateHandler.decide(input)`. `src/handlers/PlanGateHandler.ts` contains all decision logic as a pure function — unit-testable without process spawning.

**Rationale:** The handler pattern buys testability (handler callable with mock input, no stdin ceremony) and separation of concerns (I/O vs logic). For TDD-first development, testability isn't optional. Matches PAI's own convention per THEHOOKSYSTEM.md — existing Stop hooks (LastResponseCache, VoiceCompletion, DocIntegrity) all follow this pattern. Extra-file cost is trivial.

**Unmitigated risk:** Pattern creep — future contributors might split into handlers things that don't need the separation. Convention pressure, not an engineering risk for this scope.

**FirstPrinciples decomposition:** captured in PRD THINK-phase output.

---

## D4 — CLI tier selection

**Decision:** Tier 1 (manual argv parsing, zero framework dependencies) per the CreateCLI skill's three-tier system.

**Rationale:** StateManager exposes 7 commands; CheckRunner exposes 1 primary command with flags. Both fall within Tier 1's "2-10 commands, simple arguments" sweet spot. Matches Inference.ts precedent. Keeps binary size minimal and startup time fast (important — CheckRunner runs frequently during a build session).

**Unmitigated risk:** If command count grows significantly (e.g., adding Architecture A's PlanParser/CheckGenerator later), migration to Tier 2 (Commander.js) may be warranted. Migration path is documented in CreateCLI's `Workflows/UpgradeTier.md`.

---

## D5 — Observability strategy (revised 2026-04-21)

**Decision:** MVP writes structured events to a **project-local** JSONL log at `<project-root>/.plan-executor/events.jsonl`, co-located with that project's `validation.json`. Direct `fs.appendFileSync`. The MVP implements its own emitter at `src/lib/event-emitter.ts` (exports `appendEvent`) and types at `src/lib/event-types.ts` — no dependency on PAI's (aspirational, never-shipped) unified event system. Event types: `plan.gate.blocked`, `plan.gate.allowed`, `plan.task.advanced`, `plan.criterion.passed`, `plan.criterion.failed`. Defer standalone `PlanRecorder.hook.ts` (from architecture-a full spec) as out-of-MVP.

**Rationale — why project-local, not user-global:** Events for a given plan's execution belong with that plan. The `validation.json` already lives at the project root; co-locating events under `<project-root>/.plan-executor/` keeps all execution state for one plan in one place. Matches architecture-a-gate-keeper.md's original intent (where the forensic log was specified as `<project>/.plan-executor/flight-recorder.jsonl`). Makes debugging natural — investigating "what happened during the Presentations build" means opening that one project's directory. Prevents cross-plan contamination in the log.

**Rationale — why MVP-local emitter, not PAI's `appendEvent()`:** Verified 2026-04-21 via `gh api` against `danielmiessler/Personal_AI_Infrastructure` main branch. Searches for `event-emitter` and `appendEvent` in the repo's source code returned 0 TypeScript matches — all 12 matches are in documentation files only (THEHOOKSYSTEM.md, MEMORYSYSTEM.md, THENOTIFICATIONSYSTEM.md) across versions v4.0.0 through v4.0.3. Upstream `hooks/lib/` contents at v4.0.3 exactly match Drew's local install (no `event-emitter.ts`, no `event-types.ts`). The unified event system documented in THEHOOKSYSTEM.md is **aspirational and unimplemented**. MVP cannot depend on phantom infrastructure.

**Rationale — why no suffix on file and function names:** See D13.

**Migration path if PAI eventually ships `event-emitter.ts`:** One-line change per import site. Replace `import { appendEvent } from './lib/event-emitter'` with `import { appendEvent } from '~/.claude/hooks/lib/event-emitter'`, delete the local `src/lib/event-emitter.ts` and `src/lib/event-types.ts` (types will then come from the upstream equivalents). Event structure was designed to mirror what THEHOOKSYSTEM.md describes, so the payload shape is already migration-ready. Function signatures are identical — no call-site changes beyond the import path.

**Unmitigated risk:** Per-project logs are not aggregated for cross-plan observability. Mitigation (future, if needed): a small aggregation CLI that finds every `<project>/.plan-executor/events.jsonl` under `~/projects/` and streams them. Not a current concern.

---

## D6 — CLI configuration flags

**Decision:** Every CLI supports `--json` (machine output), `--verbose` (debug logging), `--help` / `-h` (usage). CheckRunner adds `--task <id>` (task selector), `--dry-run` (show commands without executing), `--manual-prompt-strategy stdin|askuser` (see D10), `--answer <response>` (for askuser strategy round-trip).

**Rationale:** Matches CLIFIRSTARCHITECTURE.md §Configuration Flags pattern (mode flags, output flags, resource selection flags, post-processing flags). Natural language maps to flags (e.g., "run this quiet" → `--json`, "what would this do" → `--dry-run`).

**Unmitigated risk:** Flag creep over time. Mitigation: keep flag set minimal; require a justification comment in the CLI source when adding new flags.

---

## D7 — Exit code conventions

**Decision:**
- `0` — success
- `1` — user error (bad args, missing file) OR a check returned FAIL (CheckRunner)
- `2` — system error (malformed validation.json, lock conflict, unexpected exception)
- `3` — gate violation (PlanGate only — emitted when the hook blocks a tool call)
- `4` — manual criterion needs AskUserQuestion (CheckRunner only — askuser strategy handoff, see D10)

**Rationale:** Matches CLIFIRSTARCHITECTURE.md §Error Handling conventions (0 success, 1 user error, 2 system error) and adds two domain-specific codes. Orchestrator scripts can distinguish "check failed because criterion was genuinely not met" (1) from "system broke" (2) from "plan blocked me" (3) from "I need to call AskUserQuestion" (4).

**Unmitigated risk:** Exit code 4 is non-standard; callers must know to handle it. Mitigation: document in PAI/TOOLS.md entry and in CheckRunner `--help`.

---

## D8 — Plan checksum

**Decision:** Plan checksum is SHA256 of the `validation.json` criteria structure — specifically `JSON.stringify(deepSort({phases, tasks, criteria}))` — **not** the prose `implementation-plan.md`.

**Rationale:** The prose plan can be reformatted, typo-fixed, or rewritten without changing intent. What actually matters for enforcement is the criteria structure (phase IDs, task IDs, criterion IDs, criterion types, commands, prompts). Checksumming that catches tampering with the agreed contract while tolerating prose edits.

**Unmitigated risk:** An adversary could add new criteria to validation.json via StateManager (the sole writer), which would change the checksum. Mitigation: checksum is computed once at init, stored in `validation.json.plan_checksum`, and validated on every read. Any change invalidates prior evidence — intentional.

---

## D9 — Atomicity strategy

**Decision:** StateManager writes validation.json via temp-file-plus-rename pattern: write to `validation.json.tmp`, then `fs.renameSync` atomically. **No file locking** (`flock` or similar). Single-writer discipline is assumed — writes to a single plan's validation.json are serialized by the current single-`current_task` design.

**Rationale:** POSIX rename is atomic. Temp-file-plus-rename is the standard safe-write idiom. File locking adds complexity and cross-platform portability concerns that aren't justified for single-user solo work AND aren't needed under the current sequential-execution model (see "What the current design IS safe for" below).

### What the current design IS safe for (no D9 risk)

| Scenario | Why safe |
|---|---|
| Sequential task execution — one `current_task` at a time, one CheckRunner invocation at a time | Writes are serialized by design. No concurrency surface. |
| Orchestrator invokes CheckRunner while a subagent is mid-work on the current task's artifacts | Subagents don't write validation.json (PlanGate blocks direct writes; the orchestrator calls CheckRunner only after subagent(s) report back). |
| Multiple subagents emitting events to the same project-local `events.jsonl` concurrently | `fs.appendFileSync` uses `O_APPEND`; OS serializes small appends atomically. Events are tiny JSON lines well under the ~4 KB single-write atomicity boundary on macOS/Linux. |
| Multiple Claude Code sessions running plans in DIFFERENT projects simultaneously | Each project has its own `<project>/validation.json`. No shared file. |

### What the current design is NOT safe for (unmitigated D9 risk)

**The specific scenario that breaks D9: multiple subagents invoking CheckRunner for DIFFERENT tasks of the same plan concurrently.** Both read validation.json, both merge their criterion updates into the in-memory state, both write back. Last-write-wins. Earlier writer's updates silently lost.

This scenario cannot arise in the current design — `current_task` is a single value, and CheckRunner accepts operations only against `current_task`. Even if four subagents are working in parallel on sub-parts of one task, only a single CheckRunner invocation happens after they all report back. **The current design architecturally forces serialization.**

Where this project is vulnerable: if a future version supports "multiple current tasks" (genuinely parallel task advancement — e.g., task 6.2a and task 6.2b independently executable at the same time), the current D9 breaks. Sibling scenario: multiple Claude Code sessions editing the same project's validation.json simultaneously. Same race, same silent data loss.

### Mitigation paths if we later support parallel task execution

In increasing robustness:

1. **Optimistic concurrency check** — StateManager remembers validation.json's mtime on read; on write, checks mtime hasn't changed; if it has, retries with fresh read + re-merge. Easy to add. Doesn't prevent races, detects them and retries.
2. **File locking** (`flock` via `fcntl`) — CheckRunner takes an exclusive lock on validation.json for the read-merge-write sequence. Blocks other writers. Cross-platform-portable with a small library.
3. **SQLite backend** — replace validation.json with SQLite; get ACID transactions for free. Largest change; overkill unless scaling to genuinely parallel orchestration.

**None of these are current scope.** This section exists so future-us knows exactly what assumption D9 rests on and which future design change forces a revisit.

---

## D10 — Manual criterion UX

**Decision:** CheckRunner's manual-criterion handling has two strategies selected via `--manual-prompt-strategy`:
- **`stdin` (default):** CheckRunner prints the criterion's `prompt` to stdout, reads response from stdin, records as evidence via StateManager. Works in interactive terminal contexts.
- **`askuser`:** CheckRunner exits with code 4 and structured stderr (JSON: `{prompt, taskId, criterionId}`). The orchestrating agent reads the structured stderr, invokes `AskUserQuestion`, captures Drew's response, and re-invokes CheckRunner with `--answer <response>`. Works in subagent and background contexts where stdin isn't attached.

**Rationale:** CheckRunner runs in varied contexts — sometimes with a live TTY, sometimes spawned by a subagent, sometimes backgrounded by a loop. No single prompting mechanism works everywhere. Exit-code handoff decouples CheckRunner from the prompting UX, letting the caller pick the right strategy per context.

**Unmitigated risk:** If the orchestrator forgets to re-invoke with `--answer`, the criterion stays PENDING and the plan stalls. Mitigation: PlanGate continues to block tool calls, forcing the orchestrator to resolve the pending criterion before progressing.

---

## D11 — Schema evolution

**Decision:** StateManager preserves unknown fields on write. The write cycle is read → deep-merge updates → write back. Future plans that add fields (e.g., `iteration_count`, `cost_tracking`) don't lose data when processed by the current StateManager.

**Rationale:** Forward compatibility at minimal cost. The alternative (normalizing to a strict schema) breaks future plans silently.

**Unmitigated risk:** A bug in the merge logic could corrupt unknown fields. Mitigation: StateManager's `read` → `merge` → `write` sequence has unit test coverage explicitly for unknown-field preservation (Tier A test requirement).

---

## D12 — Settings.json hook registration

**Decision:** PlanGate registers as an ADDITIONAL hook on the `Write|Edit|Bash` matchers alongside the existing `SecurityValidator` hook. PAI runs hooks sequentially on the same matcher; SecurityValidator fires first, PlanGate fires second. If SecurityValidator blocks (dangerous command), PlanGate never runs — short-circuit by design.

**Rationale:** Matches THEHOOKSYSTEM.md §Multi-Hook Execution Order pattern. Security-layer checks belong ahead of plan-execution-layer checks — dangerous commands should be blocked regardless of plan state. Registration block is appended to the existing `PreToolUse` array in settings.json, not replacing SecurityValidator.

**Unmitigated risk:** If SecurityValidator's execution becomes slow, PlanGate's response is delayed. Not a current concern (current SecurityValidator is sub-100ms per THEHOOKSYSTEM.md best practices).

---

## D13 — Library layering: types separate from runtime, no suffix disambiguation

**Decision:** Every TypeScript file in `src/lib/` carries NO suffix. Clean base names. Types separated from runtime into distinct files.

**Files:**
- `src/lib/event-types.ts` — event type definitions (PAI upstream docs an `event-types.ts` that doesn't ship; this project's file has the same base name but lives in project-scoped `src/lib/`, not PAI's `hooks/lib/` — no collision).
- `src/lib/event-emitter.ts` — exports `appendEvent()` (PAI upstream docs an `event-emitter.ts` with `appendEvent()` that doesn't ship; same non-collision reasoning).
- `src/lib/state-types.ts` — `validation.json` schema types: `ValidationState`, `Phase`, `Task`, `Criterion`, status enums (no PAI upstream equivalent).
- `src/lib/hook-types.ts` — `PreToolUseHookInput` type (extends what PAI's shipped `hook-io.ts HookInput` covers — hook-io's type is Stop-hook-shaped with `session_id`, `transcript_path`, `hook_event_name`, `last_assistant_message`; PreToolUse adds `tool_name` and `tool_input` which this project needs).

**Rationale — why no suffix disambiguation:** An earlier version of this decision added an `-mvp` suffix to every file for fear of naming collisions with PAI's documented-but-unshipped files. Inspected closely, that collision risk doesn't exist at any point in the artifact lifecycle:

1. **In source** — these files live in this project's `src/lib/`, not in `~/.claude/hooks/lib/`. Different absolute paths. No filesystem collision.
2. **At deploy** — files are bundled into single-file CLIs (per design.md §9.4 — `bun build --compile` or equivalent inlines them). No residual `lib/` directory at the deploy location. No collision at `~/.claude/PAI/Tools/` or `~/.claude/hooks/`.
3. **At import** — relative imports (`./lib/event-emitter`) and absolute imports (`~/.claude/hooks/lib/event-emitter`) are unambiguously distinct. TypeScript resolves each on its own module path.
4. **At future migration** — if PAI eventually ships `appendEvent()`, migration is an import-path rename with identical function signatures. No benefit to distinct function names; the rename is trivially mechanical.

The `-mvp` suffix was adding noise without preventing any real problem. Dropping it produces cleaner filenames, idiomatic function names (`appendEvent` not `appendEventMvp`), and lowers cognitive load for future readers.

**Rationale — why types-vs-runtime separation IS kept:** This is the decision's genuinely valuable content. Each concern gets its own file: `event-types.ts` contains only type definitions (zero runtime code); `event-emitter.ts` contains the runtime function and imports from the types file. Same split for state: `state-types.ts` for schema interfaces; the operations logic stays in `StateManager.ts`. This is standard TypeScript best practice — change rates differ (types change rarely, runtime logic evolves), and types need no unit tests (compiler enforces them). Keeping this pattern explicit here so future contributors don't collapse types and runtime into shared files.

**Reuse of existing PAI shared libs:** Where this project imports from PAI's existing (shipped) `hooks/lib/` modules — `readHookInput()` from `hook-io.ts`, timestamp helpers from `time.ts`, identity from `identity.ts` — those imports use their original names as shipped by PAI. No rename, no suffix.

**Revision history:** An earlier version of D13 (2026-04-21 morning) required an `-mvp` suffix on every file in `src/lib/`. That version was rewritten the same day after the project was renamed from "Plan Executor MVP" to "Plan Executor Tools" and the suffix's supposed collision-prevention role was re-examined and found to be redundant with directory-level disambiguation (`~/projects/dev/dev-tools/agentics-dev/tools-dev/plan-executor-tools-dev/src/lib/`). This current version is the locked decision.

**Unmitigated risk:** If a future contributor creates a new file in `src/lib/` with a name that DOES collide with a PAI upstream file at `~/.claude/hooks/lib/` AND both are imported into the same TypeScript file via conflicting paths, TypeScript's module resolution would still distinguish them by path — but the reader might be momentarily confused. Mitigation: this is a read-time confusion risk, not a correctness risk; it can be addressed with a brief comment in the file when such a conflict arises in practice.

---

## Revision notes

- **2026-04-21 (morning):** Initial D1–D12 locked during Algorithm run `20260421-mvp-design-doc-research` (OBSERVE phase grounded in 6 PAI reference docs; THINK phase pressure-tested D1/D2/D3 via FirstPrinciples). D13 added later the same day to lock the library naming convention.
- **2026-04-21 (afternoon):** Project renamed from "Plan Executor MVP" to "Plan Executor Tools" and relocated from `skills-dev/plan-executor-mvp-skill-dev/` to `tools-dev/plan-executor-tools-dev/`. D13 rewritten at the same time — original `-mvp` suffix rule dropped in favor of clean filenames (the collision risk D13 originally prevented was found to be redundant with directory-level disambiguation). D1, D5, D9 prose references to "MVP" updated to "Plan Executor Tools" or "this project." Decision identities and numbering unchanged — only the rename-related prose was updated.

Future sessions may add decisions (D13+) for scope that emerges during implementation. Use the same structure: decision, rationale, unmitigated risk. Keep the locked decisions immutable — amend via new decision entries that supersede, don't edit in place.
