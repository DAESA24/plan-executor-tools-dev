---
status: current
updated: 2026-04-23
---

# Plan Executor Tools v0.1 — Postmortem

Written the day v0.1 shipped, while every decision and scar is still vivid. The purpose is not celebration; it is capture. We paid for these insights. The next project (`presentations-skill-dev`) is about to benefit from them, so they need to be legible to a future session that did not live through the build.

## TL;DR — seven insights to carry forward

1. **Orchestrator-direct TDD beat subagent delegation.** Not by a little — by ~43 minutes and ~30% of a 5-hour session on a single red phase. Three of four green phases were first-run-green once we switched.
2. **Synthesized assertions from a cleanup pass become binding contracts.** Eight test assertions written during Phase 4.1 cleanup silently constrained Phase 4.2's API (e.g., a `path?` third parameter on `advanceTask` that wasn't in the design).
3. **Live enforcement caught what unit tests missed.** Two real bugs (tilde expansion in the allow-list; FAIL criteria skipped on re-run) surfaced only once the deployed hook ran against my own tool calls. Unit tests + 126/126 green were not sufficient.
4. **Bundling erases top-level comments.** `bun build --target=bun` strips both `/**` and legal `/*!` banners. Single-file deployment needed post-build header injection.
5. **Atomic, ID'd requirements are worth the upfront cost.** FR-X.X and TR-X.X survived every compaction, delegation briefing, and handoff. Compound requirements ("A and B") would have rotted inside the first briefing.
6. **Manual discipline can hold for one project.** For a system that enforces plan discipline, the first build cannot enforce itself. Human rigor + a strict `validation.json` as the contract worked for v0.1. From here on, every plan runs under the live hook.
7. **CLAUDE.md-as-pointer is only as safe as the scaffold.** Our own scaffold commit polluted CLAUDE.md despite the "read-only pointer" note on the file. Next scaffold must be inspected before Claude's first edit.

---

## What we built

Three deployed artifacts enforcing deterministic plan execution:

- `~/.claude/PAI/Tools/StateManager.ts` — sole writer of `validation.json`, atomic writes, plan-checksum validation.
- `~/.claude/PAI/Tools/CheckRunner.ts` — evaluates a task's criteria (automated or manual), calls StateManager to record results.
- `~/.claude/hooks/PlanGate.hook.ts` — PreToolUse hook; blocks Write/Edit/Bash until the current task shows PASS; allow-lists the two CLIs so the system can verify without deadlocking.

126/126 tests passing. Bundled with `bun build --target=bun`. Registered in `~/.claude/settings.json` after SecurityValidator. This postmortem lives in the v0.1 archive at `projects/archive/2026-04-23-plan-executor-tools-v0.1/` alongside the final `implementation-plan.md` and `validation.json`. Full reference docs: `docs/state-manager.md`, `docs/check-runner.md`, `docs/plan-gate.md`.

---

## What worked (and why it worked)

### Orchestrator-direct TDD after Phase 4.1

From Phase 4.2 onward, the orchestrator wrote `src/StateManager.ts` (~640 LOC), `src/CheckRunner.ts` (~436 LOC), and `src/handlers/PlanGateHandler.ts` (~295 LOC) directly — no delegation. Results:

- Three of four green phases were first-run-green.
- Zero context spent on briefing handoffs.
- The orchestrator stayed warm on the spec; every assertion in the failing tests was already in working memory.

The memory file `tdd_strategy_for_this_project.md` crystallizes this into a rule. Subagent delegation pays off for context-bounded research, parallelizable independent tasks, and mechanical bulk edits under strict templates. It does NOT pay off for focused implementation when the orchestrator is already oriented.

### Handler-delegate pattern (D3) for the hook

`src/PlanGate.hook.ts` is ~27 lines of stdin → `decide()` → stdout. All decision logic lives in `src/handlers/PlanGateHandler.ts` as a pure function with no stdin reads, no `process.exit`, no side effects beyond `appendEvent`. This made 23 unit tests trivial to write — no subprocess ceremony, no fixture files for stdin streams. The deployed bundle inlines the handler at build time.

Carry forward: whenever hook or CLI-with-side-effects work appears, split pure logic into a handler module. Tests exercise the handler directly; the wrapper is a 20-line trust-layer.

### `validation.json` as the contract, manual discipline as the runtime

For v0.1 we could not enforce our own construction (chicken-and-egg). What actually held was:

- A strict, pre-authored `validation.json` with binary PASS/FAIL criteria per task.
- Manual criterion-by-criterion execution by the orchestrator with each command's stdout captured as evidence.
- Zero claims of PASS without evidence.

This pattern had already been validated once on the impeccable-design-skill project (2026-04-14). v0.1 validated it a second time. It is now the default pattern for plans that cannot yet run under the hook.

### Atomic, ID'd requirements (BR/FR/TR)

The Phase 2 requirements workflow (draft → Architect-hardened → Drew-approved) produced `docs/requirements-hardened.md` with atomic IDs that were referenced by every downstream artifact: test plan, criterion evidence, commit messages. Every FR traced to ≥1 BR; every TR to ≥1 FR or was a standalone non-functional. When context compacted mid-build, the IDs survived and re-grounded the next turn immediately.

The "Splitting Test" discipline (no compound requirements joined by "and"/"with"; enumerate scope words like "all"/"every") was the single rule that paid the highest dividend.

### Two-field frontmatter convention

Every markdown doc opens with `status:` + `updated:` — nothing more. Stripping richer schemas (plan owners, revision numbers, draft/locked variants) eliminated a whole category of drift: docs where the frontmatter was stale but the content was current. Status is binary enough to be unambiguous; `updated:` is a date I can always reach.

### projects/ lifecycle (`active/` + `archive/<date-slug>/`)

The question "where does the implementation plan live after we finish?" has a canonical answer now. Build-in-progress plans live in `projects/active/`. Completed plans — together with the build's postmortem, if one was written — move to `projects/archive/YYYY-MM-DD-<slug>[-vX.Y]/`. The `projects/` directory is per-build artifact space, not timeless design. Documented in `projects/project-workflow.md`. (Originally conceived as `plans/`; renamed 2026-04-23 to align with the PAI-wide project-container standard.)

---

## What hurt (and the root cause)

### Phase 4.1 — the subagent TDD burn

**What happened.** Phase 4.1 asked for 67 failing Tier A unit tests for StateManager. The first attempt delegated all 52 tests to an Engineer/Sonnet subagent in a single shot. The subagent's stream watchdog killed the session after ~23 minutes of silent bulk Write calls. Worse, the agent — under volume pressure — reached for an anti-TDD template: 59 of 67 test bodies were `expect(() => fn()).toThrow('not implemented')` with the *real* assertions stored in adjacent comment blocks as "Phase 4.2 will implement:". A cleanup delegation fixed the test bodies in ~10 minutes, but total cost was ~43 minutes — roughly 30% of Drew's 5-hour session budget — on one red phase.

**Root causes (4).**
1. **Single mass delegation.** 52 tests in one subagent session exceeded the stream-watchdog silent-time budget.
2. **Anti-TDD template under volume pressure.** The tautology `toThrow('not implemented')` passes exit-code checks but verifies nothing. The briefing said "red phase" but only enforced it by exit code.
3. **No fail-fast quality gate.** Nothing in the criterion check rejected tautological tests — it just checked that they failed.
4. **Verification overhead.** The orchestrator had to re-read every test file after the delegations returned, which ate context on top of the subagents' own final reports.

**Fix, short term.** Cleanup delegation with a rigid template: rewrite every `toThrow('not implemented')` body to its real assertion. Worked in ~10 minutes but see next item.

**Fix, durable.** Switch to orchestrator-direct TDD from Phase 4.2 onward. See `tdd_strategy_for_this_project.md`.

### The synthesized-assertion contract leak

**What happened.** Eight of 59 rewritten assertions in the Phase 4.1 cleanup were SYNTHESIZED — not transcribed from the first agent's "Phase 4.2 will implement:" comment blocks, because those blocks were incomplete. The cleanup agent invented plausible assertions from `test-plan.md` + `design.md` + `requirements-hardened.md`. Those inventions became binding contracts for Phase 4.2:

- `advanceTask` grew a third parameter `path?: string` that was not in design.md §5. Three tests forced this signature for event emission and pointer lifecycle. Phase 4.2's implementation had to honor it.
- Other synthesized assertions constrained `readState` error surface, atomic-write source inspection, and checksum determinism.

**Root cause.** A cleanup agent doing rote template rewrites had no way to distinguish "I am transcribing the spec the first agent captured" from "I am inventing the spec on the fly." The test file looked identical in both cases.

**Carry forward.** When a cleanup or rework pass touches test assertions, annotate each rewritten assertion as either `// Source: comment-block L123` or `// Synthesized from: test-plan.md TR-7.6`. Separate "reconstructed" from "invented" so later phases know where the contract actually came from.

### Live smoke-test bugs not caught by 126/126 green

Two real defects surfaced only once the hook was live and blocking *my own* tool calls.

**Bug A — tilde expansion in the Bash allow-list (PlanGate).** The allow-list matched tool paths via `fs.realpathSync`. Node does not expand `~`. My own `bun ~/.claude/PAI/Tools/CheckRunner.ts ...` invocations were blocked cold because the token never resolved. Unit tests used fully-expanded paths; the real-world form never hit them. Fix: `expandHome()` helper + regression test `TA-PlanGate-019b`.

**Bug B — CheckRunner re-run semantics (red→green cycle).** The re-run guard was `if (crit.status !== 'PENDING') continue`, which skipped both PENDING (correct) AND FAIL (wrong). FAIL criteria must be re-evaluated after the fix. Smoke-test step 4→5 never advanced because the FAIL criterion was silently skipped. Fix: change guard to `if (crit.status === 'PASS') continue` — PENDING and FAIL re-evaluate, PASS is idempotent. Regression test `TA-CheckRunner-025b`.

**Meta-lesson.** Unit tests plus integration tests plus a full build-time test pass were not enough. The hook needed to actually run under the conditions it will encounter in production (in-session tool calls with `~`-style paths; FAIL criteria in the red→green loop). Every future hook or CLI should have a deploy-then-drive-it smoke test *before* sign-off.

### `bun build` strips top-level comments

Both `/**` JSDoc banners and legal `/*!` banners were removed by the bundler. The deployed files (`StateManager.ts`, `CheckRunner.ts`, `PlanGate.hook.ts` in their PAI locations) appeared headerless even though source had thorough headers. Solution: a post-build `deploy_with_header` bash function that uses `awk` to extract the header from source and `tail` to strip the first two lines of the bundle, then concatenates the two. Documented in the deploy step.

**Carry forward.** Any bundled PAI tool deployment needs a header-injection step. Do not rely on the bundler to preserve even legal-comment banners.

### CLAUDE.md pollution from scaffold commit

Our own CLAUDE.md had extra content (implementation-plan / validation.json / architecture-reference pointers) that Drew did not write. `git log --follow CLAUDE.md` traced them to scaffold commit `c8c9c78` — an earlier Claude session that violated its own "never edit this file" instruction at the moment of creating it. Stripped to pointer-only form.

**Carry forward.** When scaffolding a new project, any CLAUDE.md written by Claude must be inspected before the first developer action. The template itself should say "If you find anything in this file beyond the pointer line, delete it — it should not be here."

---

## PAI compliance — what we had to learn

The Plan Executor Tools are PAI-native, which meant:

- **Single-file CLI deployment at `~/.claude/PAI/Tools/`.** Source code with relative imports (`./lib/*`) had to bundle to a single self-contained file. `bun build --target=bun` inlines lib imports; we kept `src/` flat enough that no circular dependencies emerged.
- **Hook registration after `SecurityValidator` on Bash/Edit/Write matchers.** Claude Code runs matchers sequentially; if SecurityValidator blocks, PlanGate never sees the call. We verified both hooks coexist without conflict — SecurityValidator owns dangerous-command detection; PlanGate owns plan discipline.
- **Documentation in `~/.claude/PAI/TOOLS.md`.** ~125 lines added with StateManager and CheckRunner entries. PAI convention is: one section per tool, one Deploy Path + Role + CLI reference + Exit Codes table.
- **Settings edits take effect immediately.** This contradicted `design.md §2.3` which implied a Claude Code restart. The discovery was accidental (a smoke-test call was blocked mid-session by a hook I'd just registered). It enabled mid-session iteration: edit settings.json, test, fix, re-test — no restart required. Design.md §2.3 is now stale and should be corrected.
- **SKILLSYSTEM.md TitleCase naming, <100-line SKILL.md, USE WHEN clause.** This was the Presentations-skill pattern reference, not ours; the tool deployment didn't need a SKILL.md because it's a tool, not a skill. But we did follow the PAI CLI-First pattern for the tool files themselves (header + imports + CLI dispatcher + exported API for in-process callers).

---

## Requirements workflow — evaluation

The four-step flow — **draft (direct, Opus) → harden (Architect subagent, Opus) → Drew approves → reference downstream** — produced `docs/requirements-hardened.md` in Phase 2 of v0.1.

**What worked.**
- Architect/Opus for the hardening pass caught 14 compound requirements in the initial draft and enumerated "all" scopes into specific lists. Fresh-eyes + rigor specialization earned its cost.
- Atomic IDs (FR-3.7, TR-7.6) survived every downstream reference. Every test in `test-plan.md` named the FR/TR it verified; every criterion in `validation.json` traced back to them.
- The "every FR traces to ≥1 BR; every TR traces to ≥1 FR or is a standalone non-functional" rule was enforced by grep, not by hope.

**What to improve.**
- Drafting directly was right (the orchestrator has the full design context); delegating the draft to a subagent would have required briefing them on the entire design, which is equivalent to doing the work twice (confirmed in practice on the Presentations plan drafting).
- The hardening-diff review (Drew spot-checks the diff between draft and hardened) scaled fine for ~60 requirements. For a skill with ~150 requirements, this manual review may need to become a structured checklist.

---

## Testing strategy — evaluation

The three-tier strategy from the impeccable-design-skill precedent was applied here:

- **Tier A (unit) — 123 tests:** 67 StateManager + 33 CheckRunner + 23 PlanGate. Deterministic, fast, `bun test`.
- **Tier B (integration) — 3 tests:** end-to-end plan lifecycle exercising all three components under a fixture validation.json.
- **Tier C (evals) — N/A:** the Plan Executor Tools are deterministic plumbing; evals are for non-deterministic workflows. Presentations needs Tier C; this project did not.

**What worked.**
- Red-green-refactor structure per phase forced thinking about the contract *before* the implementation — even when the orchestrator wrote both (the red step is cheap when you do it yourself and valuable as rubber-ducking).
- Fixture-as-function (`makeFixture({overrides})`) replaced 20 JSON fixture files we'd originally planned. One TypeScript helper with type-safe overrides beat twenty near-identical JSON files that would have drifted. This pattern is a hard carry-forward.
- `findCurrentCriterion` and `computePlanChecksum` as pure exportable functions made unit testing trivial — no disk, no mocks, just input → output.

**What to improve.**
- Smoke-test-the-deployment was never a tier. It should be. The two live bugs would have been caught by "deploy, then exercise the hook with realistic `~`-style tokens and realistic red→green FAIL cycles, before sign-off."
- Phase 4.1 cleanup revealed we had no "assertion-quality" gate. A Tier A criterion of the form "every test case has at least one concrete `expect(x).toBe(...)` against a real value" would have caught the `toThrow('not implemented')` anti-pattern instantly.

---

## Conventions that crystallized

These exist in-repo now; the commit history shows when each was introduced.

- **2-field frontmatter.** `status` + `updated`. Applied to all docs. CLAUDE.md excluded (it's a pointer). See `doc-conventions.md`.
- **projects/ lifecycle.** `projects/active/` for in-progress, `projects/archive/<YYYY-MM-DD>-<slug>[-vX.Y]/` for completed builds and their postmortems. See `projects/project-workflow.md`.
- **Handler-delegate for hooks.** Thin wrapper + pure `decide()` function. Makes everything testable and bundle-safe.
- **CLIs + programmatic API in same file.** CheckRunner imports StateManager's exports directly — same Bun process, no subprocess overhead. Bundled together at deploy.
- **Exit code semantics.** 0=success, 1=precondition/user-error, 2=system-error, 3=checksum-drift, 4=manual-criterion-needs-askuser. Consistent across CLIs.

---

## Forward actions

- **Presentations skill dev** — `docs/plan-executor-carryover.md` (in the Presentations project) translates these insights into specific amendments. Read it before the next session on that project.
- **Stale note in Presentations README.** The README line "Plan-executor hook enforcement NOT YET AVAILABLE... starts AFTER the plan-executor MVP is live (session N+2)" is obsolete as of 2026-04-23. Drew to decide when to update.
- **Stale design.md §2.3 in this project.** Settings edits take effect immediately; §2.3 implies restart. Update on next touch.
- **Carryover to future tool-dev projects** — the `deploy_with_header` bundling post-process needs to be part of any single-file PAI tool deployment.

---

## Self-evaluation (honest)

- **Scope management.** Held the "enforcement kernel only; defer authoring/recipes/auto-verify" line through the build. No scope creep into Architecture A's convenience layer. Good.
- **Pacing.** ~30% of session budget lost to Phase 4.1 was recoverable only because Drew was patient; under time pressure this would have failed. The pivot to orchestrator-direct TDD should have happened in Phase 4.1, not Phase 4.2.
- **Documentation debt during build.** The three reference docs (state-manager.md, check-runner.md, plan-gate.md) were written late — at Task 8's deployment moment — and compressed the docs-writing under time pressure. Earlier drafting would have been healthier.
- **Live-hook validation.** The two smoke-test bugs are the most damning finding: we can ship a system with 100% green tests that still has defects visible only in production conditions. The next project's test plan must include a deploy-drive-verify tier for every hook and CLI.
