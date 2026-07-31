---
title: Synthesis — three projects with Plan Executor Tool added
parent_isa: ~/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/ISA.md
sources:
  - synthesis-projects-root-reorg-vs-pai-5.0.0-upgrade.md (this dir, written 2026-05-20)
  - projects-root-reorg-2026-03-lessons.md (this dir, written 2026-05-20)
  - pai-5.0.0-upgrade-lessons.md (this dir, written 2026-05-20)
  - ~/projects/dev/dev-tools/tools-dev/plan-executor-tools-dev/README.md
  - ~/projects/dev/dev-tools/tools-dev/plan-executor-tools-dev/docs/design.md
  - ~/projects/dev/dev-tools/tools-dev/plan-executor-tools-dev/docs/decisions.md
  - ~/projects/dev/dev-tools/tools-dev/plan-executor-tools-dev/projects/archive/2026-04-23-plan-executor-tools-v0.1/postmortem.md
  - GitHub issues #1, #2, #3 at DAESA24/plan-executor-tools-dev
  - ~/projects/personal/dev-folder-flatten-2026-05/retrospective.md
read_date: 2026-05-22
purpose: Extend the original two-project synthesis to a three-project synthesis by adding Plan Executor Tool, framing it as the substrate the other two would have consumed (but did not), and catalog candidate enhancements to Plan Executor Tool drawn from what the three projects actually needed in practice. The artifact is intended as Drew's working reference for considering architectural / functional / requirements changes to Plan Executor Tool.
---

# Synthesis — Three Projects on the Same Underlying Question

## The three projects in one sentence each

- **`projects-root-reorg-2026-03`** — a 17-task, single-session, single-actor filesystem reorg with a master plan + 2 HIGH-tier sub-plans + a 575-line bash verification script producing a 108-record JSON audit trail. **Consumer of the substrate.**
- **`pai-5.0.0-upgrade`** — a 117-task, 10-phase, multi-session, multi-actor in-place system upgrade with a separate prose-canonical execution guide, a JSON state-of-record ledger with schema-validated criterion writes, compaction-resilient per-phase anchors, an auto-derived state-snapshot view, and an evolving decision graph that gained four D-IDs (D42, D43, D44, …) mid-execution. **Consumer of the substrate — at the largest scale.**
- **`plan-executor-tools-dev`** — a three-component enforcement kernel (PlanGate PreToolUse hook + StateManager sole-writer CLI + CheckRunner criteria-execution CLI) operating on a hand-authored `validation.json` state file. v0.1 shipped 2026-04-23 with 126/126 tests green; production deployment sacrificed during the PAI v5.0.0 upgrade per decisions D8 / D16 / D23. **The would-be substrate** the other two would have consumed.

The original synthesis at [`~/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/synthesis-projects-root-reorg-vs-pai-5.0.0-upgrade.md`](/Users/drewarnold/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/synthesis-projects-root-reorg-vs-pai-5.0.0-upgrade.md) compared the first two and produced a Tier 1 / 2 / 3 framework, since validated by the [`dev-folder-flatten-2026-05` retrospective](/Users/drewarnold/projects/personal/dev-folder-flatten-2026-05/retrospective.md). This synthesis adds the third project and re-runs the analysis.

---

## Why the comparison is asymmetric (read this first)

Plan Executor Tool is **not a peer project of March and v5** in the way March and v5 are peers of each other. March and v5 are both *consumers* of implementation-planning discipline — they used hand-managed `validation.json`-style mechanisms to drive their own execution. Plan Executor Tool was built to be the *substrate* those consumers could call: a deployed hook + two CLIs that any future project could rely on instead of re-deriving the pattern.

The empirical reality:

- **v5 could not consume Plan Executor Tool** — v5 was the upgrade that sacrificed Plan Executor Tool's production deployment per D8/D16/D23. v5's planning predated Plan Executor Tool's redeploy; Plan Executor Tool was rendered-only and got wiped.
- **March did not consume Plan Executor Tool** — March happened 2026-03-30, *before* Plan Executor Tool existed (Plan Executor Tool v0.1 shipped 2026-04-23). March implemented its discipline via 575 lines of bash in `verify-plan.sh`.
- **`dev-folder-flatten-2026-05` did not consume Plan Executor Tool** — the flatten executed 2026-05-20, *after* Plan Executor Tool had been sacrificed. Per its retrospective, the flatten built a 47-probe `verify.sh` from scratch — the same pattern Plan Executor Tool formalizes, hand-rolled for the project.

So the three-way comparison is:

```
                      ┌─────────────────────┐
                      │ implementation-      │
                      │ planning discipline  │  ← the substrate everyone needs
                      └──────────┬──────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
   March (consumer)        v5 (consumer)             Plan Executor Tool (would-be
   uses bash + json        invents richer            substrate provider)
   ad-hoc                  parallel machinery        never used in anger
```

**The interesting question this enables:** the consumers converged independently on patterns Plan Executor Tool formalizes (binary tool probes, JSON state, runnable verification, sole-writer discipline). That's strong evidence Plan Executor Tool is targeting the right substrate. But the consumers also needed patterns Plan Executor Tool *doesn't* have (v5's append-only evidence, schema validation, per-phase anchors; March's task-template "Do not" sections; the flatten's `≤N` threshold support). That's the candidate-enhancement surface this synthesis catalogs in §7.

---

## §1 — Comparative strengths

### March (`projects-root-reorg-2026-03`) — strengths

Carried forward from the original synthesis §1. Highlights:

1. **Compact, end-to-end.** Six files. One reorg. Total artifact size in dozens of kB.
2. **Tight Task Template** — Objective / Steps / Done-when / Do-not / If-blocked. "Do not" sections codify what's *tempting* but *wrong*.
3. **Verification-as-code from the outset** — `verify-plan.sh` (575 lines) → `verification-results.json` (108 records).
4. **Cumulative checkpoint verification** — not just per-task probes; state across ALL tasks at each CHECKPOINT.
5. **Complexity-tier framework** — HIGH / MEDIUM / LOW drove sub-plan, worktree, test-strategy decisions.
6. **15-category risk inventory** as reusable doctrine.
7. **STOP-IMMEDIATELY semantics** on the critical gate (op-env's `--version` probe).
8. **Cross-directory reference rule** ("path only, never the tree") as universal doctrine.

Full enumeration: original synthesis §1.

### v5 (`pai-5.0.0-upgrade`) — strengths

Carried forward from the original synthesis §1. Highlights:

1. **Two-canonical-doc split** — canonical-for-prose vs canonical-for-execution.
2. **State-of-record as a JSON ledger** (`validation.json`, 548k, 6384 lines).
3. **Schema-validated criterion writes** (`criteria-schema.json` + `validate-criteria.py`).
4. **Append-only evidence arrays** — status transitions append; history preserved.
5. **FAIL → DIAGNOSIS → retry protocol** with required `recovery_excerpt`; auto-escalate to BLOCKED-RESEARCH after 3 high-confidence FAILs.
6. **Compaction-resilient per-phase anchors** — re-read at every task step.
7. **Auto-derived state snapshot with validation gate** — render refuses on invariant failures.
8. **Actor field encoding execution responsibility** — multi-actor coordination as data.
9. **Restructure-before-BUILD pattern** — D-ID cascade commits mid-execution.
10. **Cross-doc stable IDs** (D-IDs, F-IDs, B-L1..B-L4).
11. **Recovery pointer per task.**
12. **Discovery-gap framing** — anything not in the inventory is a gap that blocks until classified.
13. **Post-hoc class addition** — system learns by adding discovery procedures.
14. **Methodology meta-doc lifted out** (`templates/pai-upgrade-methodology.md`).
15. **/prime slash command** for deterministic session-start orientation.

Full enumeration: original synthesis §1.

### Plan Executor Tool (`plan-executor-tools-dev`) — strengths

The substrate's own design strengths, drawn from Plan Executor Tool's `docs/decisions.md` (D1–D13), `docs/design.md`, and the v0.1 postmortem.

1. **State-based, not action-based enforcement.** The PreToolUse hook checks persistent state (`validation.json` says current task is PASS — or it doesn't). Unlike action-checks (CommitGuard-style), the AI cannot restructure its actions to defeat a state-check. This is the load-bearing structural insight of the whole project.
2. **Sole-writer discipline for the state file (D9).** StateManager is the only legitimate writer of `validation.json`. Atomic temp-file-plus-rename. PlanGate guards the path against direct AI writes. The AI cannot mutate state without going through the verifier.
3. **Plan checksum over criteria-structure projection (D8).** SHA-256 over the canonical JSON of the criteria projection — not the prose plan. Tolerates prose edits (typo fixes, rationale elaboration); catches tampering with the agreed contract. Validated on every read.
4. **Allow-list pattern that breaks the verification deadlock (D2).** Without the StateManager/CheckRunner allow-list, the AI can't run the verification that would make the task PASS — because the verification tool call itself is blocked. Plan Executor Tool's allow-list resolves this with `realpath` + file-exists match (no env-var secrets; threat model is "my own AI under context pressure," not adversarial).
5. **Handler-delegate pattern for testability (D3).** `PlanGate.hook.ts` is a ~27-line wrapper; all decision logic lives in `PlanGateHandler.decide()` as a pure function. 23 PlanGate unit tests trivial to write without subprocess ceremony.
6. **TDD-driven build with 126/126 green at v0.1.** Phase 4–6 red-green-refactor against pre-authored failing tests. Phase 7 integration. Phase 8 deploy + smoke + Drew sign-off.
7. **Manual-discipline bootstrap pattern, twice validated.** Plan Executor Tool v0.1 could not enforce its own construction (chicken-and-egg). The bootstrap pattern (hand-authored validation.json + orchestrator-honest execution + Drew spot-checks) was previously validated on the impeccable-design-skill project (2026-04-14) and validated again on Plan Executor Tool v0.1. This is now a portable doctrine for any project that must build its own enforcement.
8. **Orchestrator-direct TDD as carry-forward lesson.** Postmortem §7.1: delegating Phase 4.1's 67 failing tests to a subagent cost ~43 min (~30% of session budget) and produced an anti-TDD template (`toThrow('not implemented')`); orchestrator-direct from Phase 4.2 produced 3-of-4 first-run-green phases.
9. **Programmatic API + CLI in the same module.** CheckRunner imports StateManager's exported functions directly — no subprocess overhead, full TypeScript exception types propagate.
10. **Project-local event log** (`<project-root>/.plan-executor/events.jsonl`). Per-plan observability rather than user-global; debugging stays in one project directory.

---

## §2 — Comparative weaknesses

### March — at scale

Carried forward from original synthesis §2:

1. Single-session assumption; no cursor / compaction anchors.
2. Markdown checkboxes mutate prior state; no append-only history.
3. No structured failure-capture protocol.
4. No schema validating plan against verify script.
5. No cross-doc stable IDs.
6. No methodology lift.

### v5 — for small work

Carried forward from original synthesis §2: ceremony per criterion; JSON ledger overhead; multi-session machinery for single-session work; schema authoring sunk cost; D-IDs need critical mass; cognitive load of doc roles; restructure-before-BUILD investigation rigor.

### Plan Executor Tool — the substrate's own gaps

The Plan Executor Tool-specific gaps, drawn from open GitHub issues, postmortem, and the `package.json` TODO.

1. **Issue #1 — PlanGate Catch-22.** As shipped, the `task.status === "PASS"` gate in `decide()`'s Bash/Edit/Write branches blocks the very work the task description tells the AI to do. `IN_PROGRESS`, `PENDING`, and `FAIL` are blocked equally. Fix direction agreed; never landed (the v5 sacrifice intervened before the fix session).
2. **Issue #2 — Active-pointer is global + PAI-coupled.** Pointer at `~/.claude/MEMORY/STATE/plan-executor.active.json` (PAI overlay path, not Claude Code primitive). Global singleton — second `init` clobbers first. Cross-session interference. Path duplicated as literal between reader and writer. No discovery from project context. Generic-named tool with hardcoded dependency on one specific user's overlay. Fix direction agreed; same fate.
3. **`package.json scripts.deploy` is `echo TODO`, not a real installer.** Manual redeploy is a 6-step checklist in `docs/settings-snippet.md`. Promoting to atomic mktemp+mv `deploy.ts` is Issue #3's D3 — relevant if KEEP, irrelevant if RETIRE.
4. **No schema validation of criteria.** `validation.json` is flat JSON; criterion text and verification probes can drift without anything catching it. v5 ships `criteria-schema.json` + `validate-criteria.py` for exactly this contract enforcement.
5. **No append-only evidence per criterion.** Plan Executor Tool's evidence field is a string overwritten on each update. v5's evidence is an array of timestamped entries. Plan Executor Tool loses FAIL→PASS history per criterion.
6. **Binary status (PENDING/PASS/FAIL) — no DIAGNOSIS interstitial.** When a criterion fails, the system has no first-class way to capture the diagnosis hypothesis + recovery hint before retry. v5's DIAGNOSIS status is the structured equivalent.
7. **No compaction-resilient anchors.** Plan Executor Tool is built for single-session use cases. Multi-session projects have to re-orient from scratch.
8. **No multi-actor support.** No `actor` field per task. Plan Executor Tool assumes the orchestrator does everything.
9. **No recovery_pointer field per task.** "If blocked" recovery is implicit narrative, not a structured link.
10. **No `≤N` threshold criteria.** Every criterion is binary; can't express "≤1 with the 1 intentional ref being [structural noun in PROJECTS.md row]" (the dev-folder-flatten D7 case).
11. **Never used in production at scale.** Plan Executor Tool v0.1 ran briefly until the v5 sacrifice; the first real-world consumer (`skill-validator-tool-dev`) immediately surfaced Issues #1 + #2 and never made it past Phase 1.2. The 126/126 tests passed; the smoke test passed; the field test exposed two structural bugs in the first 20 minutes.

---

## §3 — Universal-good patterns (extended to three projects)

The original synthesis identified 9 patterns appearing in BOTH March and v5 and therefore likely universal-good. Adding Plan Executor Tool evidence (and the dev-folder-flatten retrospective's validation) extends and confirms the list.

| Pattern | March form | v5 form | Plan Executor Tool form |
|---|---|---|---|
| **Every criterion is a single binary tool probe** | `test -d`, `grep -c`, `wc -l` | `check` field + `command` | Criterion `command` returning `PASS`/`FAIL` last stdout line |
| **Verification is runnable, not narrative** | `verify-plan.sh` → JSON | tool invocations populating evidence array | CheckRunner CLI evaluates per task |
| **Plan separates strategic context from operational tasks** | `project-brief.md` + `plans/*` | `README.md` + `docs/execution-plan/` | `README.md` + `docs/design.md` + `validation.json` |
| **Risk inventory front-loaded as a checklist** | 15-category in project-brief | Fragility map with F-IDs + 4-layer hazard model | Anti-pattern list in `design.md §10` (12 anti-patterns) |
| **Critical gates have STOP-IMMEDIATELY semantics** | op-env `--version` probe | Pre-Upgrade Checklist exit | `state_file_write_attempt` → BLOCK regardless of task status |
| **Recovery procedure for every named failure mode** | "If blocked" per task | recovery_pointer + §A.11 protocol | Block `permissionDecisionReason` includes exact CheckRunner command |
| **Cross-task dependencies explicit** | Dependency graph in master plan | `requires_tasks` array per task | `current_task` cursor + ordered iteration |
| **Artifact set itself IS the workflow** | 6 files w/ defined jobs | 10+ files w/ defined jobs | 3 deployed artifacts + ~13 dev-tree docs |
| **Cross-directory reference rule (path only, never the tree)** | Stated as universal in brief | Implied via pointer-pattern READMEs | Inherent — single state file at fixed path |

### Patterns added by Plan Executor Tool's evidence (and confirmed by the dev-folder-flatten retro)

| Pattern | Evidence |
|---|---|
| **Chicken-and-egg manual discipline for bootstrap projects** | Plan Executor Tool v0.1 built this way (couldn't enforce own construction); impeccable-design-skill (2026-04-14) first; dev-folder-flatten implicitly used same pattern (hand-running verify.sh until it passed) |
| **Orchestrator-direct TDD when the orchestrator is oriented** | Plan Executor Tool postmortem §7.1 — Phase 4.1 burn (~43 min) then pivot; 3 of 4 green phases first-run-green after pivot |
| **Project-local event log over user-global** | Plan Executor Tool D5 (project-local `events.jsonl`); v5's per-phase anchor + evidence files also per-project |
| **Handler-delegate split (pure function + thin wrapper) for testability** | Plan Executor Tool D3; matches PAI's other hook conventions (LastResponseCache, VoiceCompletion, DocIntegrity) |

That's **9 + 4 = 13 patterns** universal-good across the three projects.

---

## §4 — Where the projects differ (and why)

Original synthesis §4 framed differences as "calibrated for different blast radii, session counts, and failure modes." Adding Plan Executor Tool reveals an additional axis: **position in the dependency graph (consumer vs substrate provider).**

| Axis | March | v5 | Plan Executor Tool |
|---|---|---|---|
| **Position in dependency graph** | Consumer | Consumer | Would-be provider |
| **Session count** | 1 | many (9+) | 3 (TDD phases) |
| **Blast radius** | Filesystem moves; git backups | Catastrophic (loss = entire AI workflow stops) | Limited (Plan Executor Tool dev tree only; production deploys sacrificed cleanly) |
| **Number of actors** | 1 | 3 (daesa / drew-terminal / drew-no-claude-session) | 1 (orchestrator) |
| **Decision evolution** | Decisions resolved before execution | Decisions evolve mid-execution (D42–D44) | Decisions locked 2026-04-23 (D1–D13); no D14+ added |
| **State representation** | Markdown checkboxes + completion JSON | JSON ledger with append-only evidence | Flat JSON state file (validation.json) |
| **Failure protocol** | "If blocked: stop, report, wait" | Structured §A.11 with DIAGNOSIS interstitial | Binary PENDING/PASS/FAIL; FAIL evidence is a single string |
| **Doc role count** | 3 doc roles | 7+ doc roles | 4 doc roles (README + design + decisions + per-component refs) |
| **Schema enforcement** | None | JSON Schema + manual validator | None |
| **Methodology promotion** | Not done | Explicit (`templates/pai-upgrade-methodology.md`) | Not done (sui generis: Plan Executor Tool *is* the methodology, codified as deployable tools) |
| **Real-world use** | Once, end-to-end PASS | In flight at the time of original synthesis writing | Production deployed v0.1 briefly; 1 real consumer ever; sacrificed before issues fixed |

The original synthesis line — **"don't ask which approach is better; ask which patterns earn their keep at this project's scale and blast radius"** — still holds. Adding Plan Executor Tool extends the question: **"and what would Plan Executor Tool need to provide as a substrate to earn its keep across that range?"**

---

## §5 — Where the differences are complementary

The original synthesis identified what March could borrow from v5 and vice-versa. With Plan Executor Tool added, three new directions appear:

### 5.A — What Plan Executor Tool should adopt from v5

These are patterns Plan Executor Tool demonstrably lacks that v5's machinery proves are valuable at scale. They become **candidate enhancements** (catalogued by E# in §7).

1. **Append-only evidence arrays.** Plan Executor Tool's evidence field is overwritten; v5's is appended. The cost of changing this is small (Criterion.evidence becomes `string[]`), the value is real (FAIL→PASS history per criterion, mechanical audit trail).
2. **DIAGNOSIS interstitial status.** v5 uses DIAGNOSIS between FAIL and re-try. Plan Executor Tool could add it cheaply (one enum value + CheckRunner stays in DIAGNOSIS state until next probe).
3. **Schema-validated criterion writes.** v5's `criteria-schema.json` + `validate-criteria.py` (and the rule that schema mutation requires a D-ID) makes the contract durable. Plan Executor Tool has type definitions in `state-types.ts` but no runtime schema check.
4. **`recovery_pointer` field per task.** Cheap; replaces narrative recovery instruction with structured link.
5. **Auto-derived state snapshot with validation gate.** v5's `refresh-state-snapshot.py` refuses to render if cursor freshness, predecessor check, etc. fail. Plan Executor Tool could provide an equivalent `StateManager show --snapshot` mode that gates on integrity.
6. **`actor` field per task.** Encodes multi-actor coordination as data. Plan Executor Tool currently assumes single-orchestrator execution.
7. **Compaction-resilient per-phase anchors.** Built-in for multi-session use cases. Out of scope for v0.1's single-session focus; necessary for any consumer with v5-scale work.

### 5.B — What Plan Executor Tool should adopt from March and the dev-folder-flatten retro

Patterns Plan Executor Tool could provide that the consumers built ad-hoc.

8. **Five-field Task Template** (Objective / Steps / Done-when / Do-not / If-blocked). Plan Executor Tool currently assumes the consumer hand-authors validation.json criteria; could ship a `Task.md` template that produces criteria + bash probes from a single source.
9. **STOP-IMMEDIATELY language for critical gates.** Plan Executor Tool's BLOCK reason currently includes the next-step command but lacks the "halt and report — do NOT attempt heroic in-context recovery" framing March used for op-env.
10. **`≤N` threshold criteria — not just binary PASS/FAIL.** The dev-folder-flatten D7 case (`grep -c agentics-dev` returns 0 across PROJECTS.md, except the row that legitimately names the project that's flattening agentics-dev) is impossible to express in Plan Executor Tool's current criterion model. A `threshold` field (default `eq 0`, supports `le N`) covers this.
11. **Verify-script self-test during scaffold.** Flatten retro L3 — verify.sh had 2 bugs that would have surfaced if scaffold included a "run against pre-state, confirm FAIL records make sense" task. Plan Executor Tool could ship this as a `CheckRunner run --self-test` mode.
12. **Pattern-based anti-rules** (directory pattern, not file list). Flatten retro L8 — `Plans/` and `archive/` directories handled late discoveries gracefully without a new D-ID. Plan Executor Tool could express criterion exclusions by glob pattern, not enumerated path.
13. **Pre-execute clean-tree gate as Task 0 standard.** Flatten retro §What went well — caught 2 dirty repos before any moves. Plan Executor Tool could provide a `CheckRunner preflight --clean-tree` mode.

### 5.C — What Plan Executor Tool could provide that all three projects built ad-hoc

Patterns no one currently shares but all three reimplemented.

14. **Shared `verify-lib.sh` primitives** (`check_count`, `check_no_matches`, `check_exit_code`, `check_empty_output`, `check_contains`). March's 575-line verify-plan.sh and the flatten's verify.sh each rolled these. A shared library at `~/.claude/PAI/Tools/lib/verify-primitives.sh` would amortize the authoring across projects.
15. **Atomic-write helper.** March, v5, and Plan Executor Tool each rolled their own temp-file+rename pattern. Plan Executor Tool's `writeState()` in StateManager is the cleanest implementation; promoting it to a shared utility is cheap.
16. **Active-pointer discovery from project context.** Per Issue #2 — walk up from `tool_input.file_path` (Edit/Write) or `transcript_path`-derived cwd (Bash). Generic primitive useful beyond Plan Executor Tool.

### 5.D — The methodology meta-doc question revisited

Original synthesis §5 named **methodology meta-doc lift, applied retroactively to March** as the single highest-leverage combination both projects would benefit from. The dev-folder-flatten retrospective's closing paragraph **explicitly rejected this at Tier 1 scale:**

> *"The next directory-reorg project should start with the 8 lessons above pre-loaded as part of the scaffold workflow, not surfaced as discoveries. That's how Tier 1 substrates mature into reusable patterns — not by writing methodology meta-docs (still Tier 3 overkill), but by encoding lessons into the next project's task list directly."*

Adding Plan Executor Tool to the picture sharpens this disagreement. Three observations:

- The flatten retro itself produced ~50 lines of meta-doc-quality content (the `mv` vs `git mv` deep dive + 4 generalized patterns) while denying meta-docs deserve to exist at Tier 1. **It produced what it denied.**
- v5's `templates/pai-upgrade-methodology.md` exists and the next PAI upgrade will inherit from it. The lift happened.
- Plan Executor Tool is **itself the methodology codified as deployable code.** The 13 universal-good patterns in §3 are not "documented in a meta-doc that future projects re-read" — they're encoded in StateManager + CheckRunner + PlanGate behavior. The meta-doc question for Plan Executor Tool is: **do we lift its methodology to a portable installer (so any project gets `bun install plan-executor-tools` and the substrate appears), or do we keep treating each project's verify.sh as a one-off?**

Drew has implicitly taken three different positions in three different contexts (synthesis: lift; flatten retro: don't lift at Tier 1; Plan Executor Tool: lift as code). Worth adjudicating.

---

## §6 — The tiered workflow framework, restated with Plan Executor Tool's substrate role

The Tier 1 / 2 / 3 framework from the original synthesis §6 carries forward. The new column: **what does each tier consume from Plan Executor Tool if it's available?**

| Tier | When | Artifact set | What it consumes from Plan Executor Tool (if Plan Executor Tool resumes) |
|------|------|--------------|---------------------------------------------|
| **1 Lightweight** | ≤10 tasks, single session, low blast radius | README + plan.md + verify.sh + verification-results.json | Optional: `verify-lib.sh` primitives. Mostly self-contained. |
| **2 Medium** | 10–30 tasks, single or ≤2 sessions, medium blast radius | + project-brief + sub-plans + decisions.md | Could use Plan Executor Tool for state-of-record (validation.json) instead of markdown checkboxes; gains audit trail. Could use CheckRunner for criteria execution. |
| **3 Heavyweight** | ≥30 tasks, multi-session, catastrophic blast radius | + JSON ledger + schema + anchors + tools/ + evidence/ + decisions + fragility map + methodology meta-doc | Plan Executor Tool as currently shipped is **insufficient** — needs append-only evidence (5.A.1), schema validation (5.A.3), per-phase anchors (5.A.7), actor field (5.A.6). v5 built these in-project; Plan Executor Tool could lift them. |

**Key insight:** Plan Executor Tool in its current shape (v0.1) targets Tier 2 — too heavy for Tier 1 (where markdown + bash suffices), too light for Tier 3 (where v5 had to invent richer machinery). If Plan Executor Tool resumes, the strategic question is whether it stays Tier-2-shaped, narrows to Tier 1, or broadens to handle Tier 3.

---

## §7 — Candidate enhancements for the Plan Executor Tool project

This is the working catalog Drew's stated objective calls for. Each enhancement (E#) names its evidence source. Grouped by the §5 subsections.

### Group A — From v5's machinery (Tier 3 readiness)

| # | Enhancement | Evidence | Cost / Notes |
|---|---|---|---|
| **E1** | **Schema-validated criterion writes.** Add `criteria-schema.json` + a `StateManager validate-schema` subcommand that runs on every write. Schema mutation requires a D-ID. | v5 `docs/execution-plan/criteria-schema.json` + `validate-criteria.py` | Medium — schema authoring + runtime check. |
| **E2** | **Append-only evidence arrays per criterion.** Change `Criterion.evidence: string` to `evidence: EvidenceEntry[]`; each entry has `timestamp, status, output, interpretation, recovery_excerpt?`. Status transitions append. | v5 evidence array shape; Plan Executor Tool postmortem §What hurt (live bugs surfaced only at deploy — having attempt history per criterion would have helped diagnose) | Medium — schema change ripples through StateManager + CheckRunner. |
| **E3** | **DIAGNOSIS interstitial status.** Add `DIAGNOSIS` to the status enum (between FAIL and re-PASS). CheckRunner records DIAGNOSIS when a FAIL has a captured hypothesis; PlanGate treats DIAGNOSIS as a non-terminal blocked state. | v5 §A.11 FAIL→DIAGNOSIS→retry protocol | Low — one enum value + UX in CheckRunner. |
| **E4** | **`recovery_pointer` field per task.** Replace narrative "If blocked" with structured link to `docs/<recovery>.md` section. | v5 task shape | Low — schema addition. |
| **E5** | **Auto-derived state snapshot with validation gate.** New `StateManager snapshot` subcommand emits a rendered state block, refuses to render on cursor-freshness / predecessor / phase-alignment failures. | v5 `refresh-state-snapshot.py` | Medium — render logic + integrity probes. |
| **E6** | **`actor` field per task.** Encode multi-actor coordination as data. PlanGate's decision could consult the actor field if needed. | v5 `actor` field (daesa / drew-terminal / drew-no-claude-session) | Low — schema + StateManager pass-through. |
| **E7** | **Compaction-resilient per-phase anchors.** New `<project>/.plan-executor/anchors/phase-N.md` files; CheckRunner re-reads the relevant anchor at every task step. Anchors are append-only carry-forward exemplars. | v5 `.anchors/phase-N-anchor.md` | High — significant architecture change; only worth it if Tier 3 use cases are real. |

### Group B — From March + dev-folder-flatten retro (Tier 1/2 sharpening)

| # | Enhancement | Evidence | Cost / Notes |
|---|---|---|---|
| **E8** | **Five-field Task Template scaffold** (Objective / Steps / Done-when / Do-not / If-blocked). Ship a `StateManager scaffold-task` subcommand that produces both the markdown task entry and the `validation.json` criteria from a single template. | March Task Template doctrine; flatten plan.md uses the same template | Medium — template authoring + dual-output generation. |
| **E9** | **STOP-IMMEDIATELY language for critical gates.** Add a `critical: true` field per criterion; PlanGate's block message uses sharper language ("HALT — do NOT attempt heroic recovery; report to operator") for critical-flagged failures. | March op-env critical gate doctrine | Low — schema addition + message variant. |
| **E10** | **`≤N` threshold support.** Criterion `command` returns a count; criterion gains a `threshold` field (`{op: "eq" | "le" | "ge", value: N}`). Enumerate intentional non-zero matches explicitly. | dev-folder-flatten D7 (PROJECTS.md structural noun vs zero-grep) + retro L2 | Low — schema + CheckRunner threshold check. |
| **E11** | **Verify-script self-test mode.** New `CheckRunner run --self-test` runs every probe against a deliberately-failing fixture state, confirms FAIL records are well-formed, then against a mock-passed state. Catches verify-script bugs at scaffold time. | flatten retro L3 (`grep -c \|\| echo 0` footgun + summary count bug both would have surfaced) | Low — fixture + flag handling. |
| **E12** | **Pattern-based anti-rules.** Criterion `excludes` field accepts globs (`Plans/**`, `archive/**`); CheckRunner skips matching paths automatically. | flatten retro L8 (`Plans/` anti-rule handled late discoveries) | Low — glob match in CheckRunner. |
| **E13** | **Pre-execute clean-tree gate as `CheckRunner preflight --clean-tree`.** Halt-and-report if any git repo under the project root has uncommitted changes. | flatten retro §What went well (Task 0 gate caught 2 dirty repos) | Low — `git status --porcelain` walk. |
| **E14** | **Lifecycle-aware criteria.** Criterion gains `phase: "pre-execute" | "post-execute" | "invariant"`; CheckRunner respects lifecycle when re-running. | flatten retro L5 (C0.1 lifecycle awareness — pre-execute gate, not invariant) | Low — schema + scheduling logic. |

### Group C — Already on Plan Executor Tool's roadmap (post-v5 redeploy must-haves)

| # | Enhancement | Evidence | Cost / Notes |
|---|---|---|---|
| **E15** | **Fix Issue #1 (PlanGate Catch-22).** Drop the `task.status === "PASS"` gate from the Bash/Edit/Write branches. Keep `validation.json` direct-write block, pointer-absent ALLOW, checksum drift BLOCK, state malformed BLOCK, StateManager/CheckRunner allow-listing. | GitHub Issue #1; agreed fix direction in 2026-05-07 handoff | Low — surgical removal of one condition + 6 regression tests. |
| **E16** | **Fix Issue #2 (project-local active pointer).** Move pointer to `<project-root>/.plan-executor/active.json` (or touch-file at `active`). PlanGate discovers via walk-up from `tool_input.file_path` (Edit/Write) or `transcript_path`-derived cwd (Bash). Shared path-resolution helper between StateManager and PlanGate. `validation.json` also moves into `.plan-executor/`. | GitHub Issue #2; agreed design in 2026-05-07 handoff | Medium — contract change; ~6 new tests; migration script. |
| **E17** | **Promote `package.json scripts.deploy` to real `deploy.ts`.** Atomic mktemp + mv pattern (mirror of `skill-validator-tool-dev`'s install.ts). | GitHub Issue #3 D3 | Low — single TypeScript file replacing 6-step manual procedure. |

### Group D — Genuinely new architectural questions (haven't been asked)

| # | Question / Enhancement | Evidence | Notes |
|---|---|---|---|
| **E18** | **Should Plan Executor Tool ship a unified scaffolder?** A `StateManager scaffold-project --tier 1|2|3` subcommand that produces the full artifact set per tier (README + plan + verify.sh + validation.json + decisions.md as appropriate) from a single invocation. Bridges the "where do project artifacts live" + "what does each tier consume" gaps. | This synthesis §6; flatten + March + v5 all built artifact sets ad-hoc | Strategic question — does Plan Executor Tool's scope expand from "enforcement kernel" to "project scaffolder + enforcement kernel"? |
| **E19** | **Should Plan Executor Tool become tier-aware?** Tier 1 mode = lightweight (single validation.json, no anchors, no schema, simple state). Tier 3 mode = v5-shape (append-only evidence, schema validation, per-phase anchors, actor field, recovery_pointer). A single tool that scales rather than a v0.1-shape that's wrong for Tier 1 and Tier 3. | This synthesis §6 — Plan Executor Tool in current shape is Tier-2-only | Strategic question — affects every E# above. Some E#s become optional-by-tier instead of always-on. |
| **E20** | **Should Plan Executor Tool provide an explicit "manual-discipline checker" mode?** Acknowledging that the chicken-and-egg bootstrap pattern is the default for many small projects — Plan Executor Tool could run as a non-blocking observer that records the same events.jsonl + validation.json updates without gating any tool calls. The discipline becomes opt-in. | Plan Executor Tool's own v0.1 bootstrap (couldn't enforce its own construction); flatten's hand-run verify.sh; impeccable-design-skill's hand-managed pattern | Strategic question — changes Plan Executor Tool's fundamental shape from "gate" to "gate-OR-observer." Could be the right move if Issue #1's fix doesn't fully resolve the Catch-22 in practice. |
| **E21** | **Should the §3 universal-good patterns be lifted to a single doctrine doc?** With three projects' evidence (March + v5 + Plan Executor Tool v0.1 + flatten), the 13-pattern catalog has critical mass. A `~/.claude/PAI/DOCUMENTATION/ImplementationPlanningSubstrate.md` would serve as the cold-start orientation for any future implementation-planning project — answering the flatten retro vs original synthesis disagreement in §5.D by **doing the lift, but at a higher level than any individual project**. | All three projects' evidence convergence; the flatten retro's denial of meta-docs while producing meta-doc content | Strategic question — does this synthesis itself become that doc, or is a separate higher-level promotion warranted? |

**Total: 21 catalogued enhancement candidates (E1–E21).** Groups A–C are 17 concrete; Group D is 4 strategic questions. Not all should be done; some may be in tension (E18 + E19 + E20 are different futures for Plan Executor Tool's shape).

---

## §8 — Open questions

### Carried forward from original synthesis §8 (status update)

| # | Original question | Status as of 2026-05-22 |
|---|---|---|
| Q1 | Where do project artifacts live? | **Partially answered.** Both `dev-folder-flatten-2026-05` and the `pai-5.0.0-upgrade` use `~/projects/personal/<slug>/`. Convention emerging but not codified. Plan Executor Tool artifacts live in the dev tree (`~/projects/dev/dev-tools/tools-dev/plan-executor-tools-dev/`) per CLI-First architecture. |
| Q2 | How does the tier classifier become a skill? | **Still open.** The classifier is mechanical (§6 cheat sheet) but no skill embeds it yet. |
| Q3 | Should `verify.sh` have a standard scaffold? | **Answered.** Flatten retro L3: yes, with self-test built in. → E11 above. |
| Q4 | Tier 1 → Tier 2 migration mid-project? | **Still open.** Flatten stayed Tier 1; no real-world data on mid-project tier escalation. |
| Q5 | When does a project need a project-brief? | **Still open.** The flatten didn't use one; v5 effectively had one (the prose guide). |
| Q6 | Where does the methodology meta-doc live? | **Reframed.** Flatten retro rejected at Tier 1; v5 located at `templates/pai-upgrade-methodology.md`. This synthesis raises **E21**: should the universal-pattern substrate be lifted to PAI doctrine? |

### New questions raised by adding Plan Executor Tool

| # | New question |
|---|---|
| **Q7** | **Should Plan Executor Tool resume?** D8 (DEFERRED — post-v5) — the central strategic question. This synthesis informs but does not answer. The decisive question per Issue #3: *does v5.0.0 ship any hook that denies PreToolUse on Bash/Edit/Write when current-task criteria aren't all PASS?* Until that's source-read, D8 cannot land. Issue #4 (portability scope: PAI-independence / audience / cross-platform) is upstream of this — Q7 cannot land cleanly until #4's three Q's are answered. |
| **Q8** | **If Plan Executor Tool resumes, does it adopt v5's richer machinery?** E1–E7 are the Group-A candidate enhancements. Adopting all of them puts Plan Executor Tool at Tier 3 readiness; adopting none keeps it at v0.1's enforcement-kernel scope. |
| **Q9** | **Does Plan Executor Tool become tier-aware (E19), tier-narrow (commit to one tier), or shape-flexible (E20 observer mode)?** Three different futures for Plan Executor Tool's fundamental design. |
| **Q10** | **The methodology-meta-doc question, now triple-evidenced.** Flatten retro denies the lift at Tier 1; v5 did the lift at Tier 3; Plan Executor Tool *is* the lift in code form. With three positions on the table, does Drew adjudicate explicitly, or leave it case-by-case? **E21 proposes one possible adjudication: lift to PAI doctrine.** |
| **Q11** | **Should Plan Executor Tool's design.md anti-patterns list (§10) be promoted to PAI doctrine?** The 12 anti-patterns ("NOT This:" rules) are domain-portable — they apply to any state-machine-driven enforcement system, not just plan execution. Could feed E21's doctrine doc. |
| **Q12** | **What is Plan Executor Tool's evidence model when both observer mode (E20) AND gate mode coexist?** Observer mode records without blocking; gate mode blocks on un-PASS. If both modes write to the same `events.jsonl`, how does the consumer distinguish them at audit time? |

---

## §9 — One-paragraph synthesis (three projects)

**The three projects answer the same fundamental question — *"how do we make implementation work deterministic enough that the AI doesn't wing it, the principal can audit it, and the artifact survives across sessions?"* — at different scales AND from different positions in the dependency graph.** March and v5 are consumers of implementation-planning discipline that built their own machinery; Plan Executor Tool was built to be the substrate those consumers could call. The empirical reality: **none of the three actually consumed Plan Executor Tool.** v5 couldn't (Plan Executor Tool was sacrificed in v5's own upgrade per D8/D16/D23); March predated Plan Executor Tool; dev-folder-flatten executed after Plan Executor Tool was sacrificed. Yet all three converged independently on patterns Plan Executor Tool formalizes — binary tool probes, runnable verification, JSON state-of-record, sole-writer discipline — confirming Plan Executor Tool targets the right substrate. They also each needed patterns Plan Executor Tool *doesn't* have: v5 invented append-only evidence + schema validation + per-phase anchors + actor coordination; March + flatten relied on the 5-field Task Template + `≤N` thresholds + critical-gate STOP-IMMEDIATELY language + verify-script self-tests. The candidate-enhancement catalog (§7, E1–E21) groups these as: **Group A** = v5's Tier-3-readiness patterns, **Group B** = March/flatten's Tier-1/2-sharpening patterns, **Group C** = Plan Executor Tool's own roadmap items (Issue #1, #2, the deploy.ts TODO), and **Group D** = genuinely new architectural questions (Tier-awareness, observer mode, scaffolder scope, doctrine lift). The strategic question Drew now holds: **does Plan Executor Tool resume as v0.1 + roadmap (E15–E17), broaden to a Tier-aware substrate (E18 + E19), pivot to observer-or-gate mode (E20), or stay sacrificed while the next consumer rebuilds the substrate from scratch a fourth time?** This synthesis is the artifact for considering that question with three projects' worth of empirical evidence.

---

## References

### Source documents (in this synthesis's order of reliance)

| Path | Role |
|---|---|
| [`~/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/synthesis-projects-root-reorg-vs-pai-5.0.0-upgrade.md`](/Users/drewarnold/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/synthesis-projects-root-reorg-vs-pai-5.0.0-upgrade.md) | The original two-project synthesis (canonical) |
| [`~/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/projects-root-reorg-2026-03-lessons.md`](/Users/drewarnold/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/projects-root-reorg-2026-03-lessons.md) | March source patterns + lessons |
| [`~/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/pai-5.0.0-upgrade-lessons.md`](/Users/drewarnold/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/research/pai-5.0.0-upgrade-lessons.md) | v5 source patterns + lessons |
| [`README.md`](../../README.md) | Plan Executor Tool README (current — reflects v5 sacrifice) |
| [`docs/design.md`](../../docs/design.md) | Plan Executor Tool detailed design (1029 lines) |
| [`docs/decisions.md`](../../docs/decisions.md) | Plan Executor Tool D1–D13 architectural decisions |
| [`projects/archive/2026-04-23-plan-executor-tools-v0.1/postmortem.md`](../archive/2026-04-23-plan-executor-tools-v0.1/postmortem.md) | Plan Executor Tool v0.1 postmortem (canonical lessons source) |
| [`projects/assessments/plan-execution-meta-skill-2026-03/`](./plan-execution-meta-skill-2026-03/) | Architectural fork — A/B/C options; sibling assessment (Architecture A is the parent spec of Plan Executor Tool) |
| `github.com/DAESA24/plan-executor-tools-dev/issues/{1,2,3,4}` | Open issues — #1 Catch-22, #2 active-pointer, #3 resume-vs-retire, #4 portability scope (Q1/Q2/Q3 — gates #2 design + #3 resume call) |
| [`~/projects/personal/dev-folder-flatten-2026-05/retrospective.md`](/Users/drewarnold/projects/personal/dev-folder-flatten-2026-05/retrospective.md) | First real-world validation of the original synthesis's Tier 1 framework |
| [`~/projects/personal/dev-folder-flatten-2026-05/decisions.md`](/Users/drewarnold/projects/personal/dev-folder-flatten-2026-05/decisions.md) | Decisions log including D6 (forward-looking READMEs) + D7 (≤N threshold) |
| [`~/projects/personal/pai-upgrades/5.0.0-upgrade/docs/decisions.md`](/Users/drewarnold/projects/personal/pai-upgrades/5.0.0-upgrade/docs/decisions.md) | v5 D8 / D16 / D23 — the Plan Executor Tool sacrifice decisions |

### Related working artifacts

- This synthesis's ISA: `~/.claude/PAI/MEMORY/WORK/2026-05-22T135427_three-project-synthesis-with-plan-executor/ISA.md`
- The post-v5-sacrifice Plan Executor Tool summary report: `~/.claude/PAI/MEMORY/WORK/2026-05-22T122154_plan-executor-summary-report/plan-executor-tools-project-summary-2026-05-22.md`
- Parent ISA for the dev-folder-reorg-design work: `~/.claude/PAI/MEMORY/WORK/dev-folder-reorg-design/ISA.md`
