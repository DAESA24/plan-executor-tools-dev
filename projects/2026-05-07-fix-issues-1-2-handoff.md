---
status: ready-to-execute
created: 2026-05-07
updated: 2026-05-07
session_target: design and ship fixes for issues #1 and #2 in plan-executor-tools-dev
---

# Prompt (paste verbatim)

````
# Plan Executor Tools — pending fixes from first real-world consumer test

You're being asked to drive the design and implementation of two fixes
in this repo (plan-executor-tools-dev). Both were surfaced when I tried
to use plan-executor for the first time, against a real consumer
project (skill-validator-tool-dev). Two GitHub issues are already
filed — read them first, they contain full diagnoses with line refs,
reproduction steps, and proposed designs:

  gh issue view 1   # PlanGate Catch-22 (gate logic over-blocks work)
  gh issue view 2   # Active-pointer is global + PAI-coupled

Both issues live at github.com/DAESA24/plan-executor-tools-dev.

## Repo state to verify before doing anything

- Working tree should be clean. HEAD should be `d7b4de2 feat(event-emitter): self-ignore .plan-executor/ ...` unless work has continued since.
- The deployed bundles at `~/.claude/PAI/Tools/{StateManager,CheckRunner}.ts` and `~/.claude/hooks/PlanGate.hook.ts` were built from this source tree as of d7b4de2.
- The active-pointer file at `~/.claude/MEMORY/STATE/plan-executor.active.json` is currently renamed to `.bak` (Drew moved it aside so PlanGate would go silent during this work). Do NOT restore it as part of fixing #2 — once project-local pointer ships, the global one is obsolete and the .bak file is just a relic. Confirm before deleting though.

## What's already settled (don't relitigate)

These design decisions came out of the discussion that produced the issues. Don't reopen them unless you have a real reason:

1. **The two issues are independent and should be fixed in separate PRs.** Issue #1 first (small, surgical, low-risk diff). Issue #2 second (contract change, higher-risk, needs more care).

2. **Issue #1 fix shape:** drop the `task.status === "PASS"` gate from the Bash and Write/Edit branches in `decide()`. Keep:
   - validation.json direct-write block (the real enforcement)
   - pointer-absent → silent ALLOW
   - checksum drift → BLOCK
   - state malformed → BLOCK
   - StateManager/CheckRunner Bash allow-listing (preserved for telemetry differentiation in events.jsonl, even though functionally redundant after the fix)

3. **Issue #2 design direction:**
   - Active-pointer moves to `<project-root>/.plan-executor/active.json` (or a touch-file — open sub-decision)
   - PlanGate discovers it by walking up from `tool_input.file_path` (Edit/Write) or from cwd derived from `input.transcript_path` (Bash). NOT process.cwd() — that's hook-process-inheritance roulette.
   - First match (closest `.plan-executor/` to the file_path/cwd) wins, for nested-project safety
   - validation.json ALSO moves into `.plan-executor/`. It's machine-managed (StateManager is sole writer; PlanGate blocks user writes) so it's not "user-curated state" — it belongs in the subsystem-owned dir.
   - implementation-plan.md STAYS in `projects/`. Different authorship model: human-authored prose vs machine-managed state.
   - No back-compat shim. There's exactly one consumer right now (skill-validator-tool-dev) with one validation.json. Single move; hard cut.

4. **Both bugs are entirely contained in this repo.** No changes to skill-validator-tool-dev are needed for the fix itself. That repo is the consumer that surfaced the bugs, not part of the fix surface.

## What's open — ask Drew before coding

### Portability scope (blocks #2 design finalization, NOT #1)

Drew flagged "portable" as a business requirement and we agreed to define it before designing. Three questions are still unanswered:

**Q1: PAI-independence — hard requirement or nice-to-have?**
A "hard" answer means: tool runs without PAI installed; deploy paths
shouldn't assume `~/.claude/PAI/Tools/`; hook registration shouldn't
assume PAI's settings.json conventions. A "nice-to-have" answer means:
keep PAI deploy as the default, but don't bake PAI-specific paths into
runtime logic.

**Q2: Audience for "distributable" — Drew on another machine, another developer with PAI, or a stranger on the internet using Claude Code?**
Affects polish bar significantly. "Stranger" = real install ergonomics,
docs, hook-registration helpers. "Drew on another machine" = a working
install.ts is enough.

**Q3: Cross-platform — macOS only, macOS+Linux, or all three?**
Affects atomic-rename behavior, path separators, shell assumptions in
the event-emitter, and CI test surface.

These shape #2's runtime contract (where pointer lives, how it's discovered, what install does). Don't start coding #2 without answers — you'll redo work.

#1 doesn't depend on these answers. You can start #1 immediately.

### Issue #2 sub-decisions (also blocks #2 coding)

After Q1/Q2/Q3 are answered, these still need explicit calls:

a. **Pointer payload:** full JSON `{ validation_path: "..." }` vs. touch-file at `.plan-executor/active`? Touch-file is simpler if validation.json's relative location is fixed convention (i.e., always `.plan-executor/validation.json`). JSON is more flexible if you might want multiple validation files per project (current/archive).

b. **.gitignore strategy inside `.plan-executor/`:** single .gitignore with whitelist exceptions (`*\n!.gitignore\n!validation.json`) vs. split `runtime/` subdir (tracked stuff at `.plan-executor/`, untracked stuff at `.plan-executor/runtime/`)? Split is more readable; whitelist is more compact.

c. **StateManager `--path` default:** change from `./validation.json` to `./.plan-executor/validation.json`? Keeping the flag preserves explicit override capability either way.

d. **Path-resolution helper:** today the pointer path is duplicated as a literal in PlanGateHandler.ts (reader) and StateManager.ts (writer). Should the fix introduce a shared helper in `src/lib/` so writer and reader can't drift? Recommend yes; cheap consistency.

e. **Hook discovery exact algorithm:**
  - For Edit/Write: take `input.tool_input.file_path`, walk up looking for `.plan-executor/`. Stop at first match. If hit filesystem root, no match → silent ALLOW.
  - For Bash: parse cwd out of `input.transcript_path` (Claude Code embeds the encoded session cwd as the parent dir of the session-id dir — verify this by reading any path in `~/.claude/projects/` and decoding). Walk up from there.
  - Fallback for either: `process.cwd()` is brittle (hook process inherits whatever Claude Code passes), but worth keeping as last resort.

  Verify the transcript_path encoding before relying on it — read a real PreToolUse hook input payload from this repo's events.jsonl if any exist, or write a smoke-test hook that logs `input` to confirm.

### Sequencing question

Do both PRs from this session, or split — one PR now, the other later? Recommendation: do both in this session if you have time, but as separate branches/PRs against main. Don't mix the diffs.

## What NOT to do

- Don't try to fix anything in skill-validator-tool-dev. That repo is downstream.
- Don't restore the active-pointer (`~/.claude/MEMORY/STATE/plan-executor.active.json.bak`) until you've shipped #2. Once #2 ships, the global pointer is dead and the .bak is deletable. Restoring it during work would re-trigger the Catch-22 you're fixing.
- Don't bundle/redeploy until both PRs are merged. Partial deploys (new bundle, old hook registration) will be confusing.
- Don't add a backward-compat shim for the pointer location. Drew explicitly opted for hard-cut.
- Don't add an env-var bypass to PlanGate. The fix is to make the gate logic correct, not to give yourself an escape hatch.

## When you're done

After both PRs merge:
1. Bundle/build to produce updated single-file deploys for `PlanGate.hook.ts`, `StateManager.ts`, `CheckRunner.ts`.
2. Redeploy them to `~/.claude/PAI/Tools/` and `~/.claude/hooks/`.
3. Migrate skill-validator-tool-dev's existing `validation.json` to `.plan-executor/validation.json` (single `mv` + run StateManager `init` once to write the project-local pointer).
4. Delete the `.bak` global pointer.
5. Hand back to the skill-validator-tool-dev session — it's blocked at Phase 1 task 1.2 ("Create __tests__ directory structure") and will resume once the gate works correctly against project-local state.

## Quick orientation if you've never seen this repo

- Source layout: `src/StateManager.ts`, `src/CheckRunner.ts`, `src/PlanGate.hook.ts` (thin wrapper), `src/handlers/PlanGateHandler.ts` (the real decision logic).
- Build inlines handler into the single-file deployed hook bundle. Look at the build script (likely `bun build` or similar) before assuming anything about how the bundle is produced.
- Tests: should be `bun test`. Verify before adding new tests.
- Commits: conventional commits (`fix:`, `feat:`, `test:`, `chore:`, `docs:`). CommitGuard hook may be active — keep concern groups small (max 2 per commit).
````

---

## Context for the human reading this file

This handoff was authored at the end of a working session focused on
skill-validator-tool-dev, where plan-executor-tools was first used
against a real consumer. Two bugs surfaced and were filed as GitHub
issues #1 and #2 against this repo. The session diagnosed both, got
agreement on fix direction, and stopped before coding so the work
could happen here in plan-executor-tools-dev with full context.

Key state at handoff time:
- Issues #1 and #2 filed at github.com/DAESA24/plan-executor-tools-dev
- HEAD at d7b4de2 (working tree clean)
- Active-pointer at `~/.claude/MEMORY/STATE/plan-executor.active.json`
  renamed to `.bak` so PlanGate is currently silent
- skill-validator-tool-dev is paused at Phase 1 task 1.2, waiting for
  these fixes to land

If significant time has passed between this handoff and the next
session, verify before starting:
- Issues #1 and #2 are still open and unchanged
- HEAD hasn't moved (or if it has, that the changes don't conflict
  with the planned fix direction)
- The .bak pointer is still in place
- skill-validator-tool-dev's validation.json hasn't been mutated
