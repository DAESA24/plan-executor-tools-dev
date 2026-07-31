---
status: v1
updated: 2026-04-23
---

# Project Workflow — Convention Note

This is the working convention for where implementation plans, `validation.json` state files, and per-build artifacts live across the arc of a project — during an active build, and after it ships. Evolve as we run more builds; update this file as practice sharpens.

Terminology note: the files that declare what a build will do (`implementation-plan.md`, `validation.json`) are still called **plans**. They are plans for **projects** — the `projects/` directory name reflects the container shape (initiatives we've run), not a rename of the artifacts themselves.

## Two kinds of artifact

A long-lived codebase has two categorically different kinds of planning document:

| Kind | Examples | Lifespan | Lives in |
|---|---|---|---|
| **Timeless design** | `design.md`, `decisions.md`, `test-plan.md`, `requirements-hardened.md` | Outlives any single build; evolves as the architecture evolves | `docs/` |
| **Per-build state** | `implementation-plan.md`, `validation.json`, `postmortem.md` | Bound to one specific initiative; becomes a historical snapshot once that initiative ships | `projects/` |

Keeping them in separate directory trees is the core of this convention. `docs/` answers "how is this system designed?"; `projects/` answers "what initiatives have been executed against it, and what did each one leave behind?"

## Directory layout

```
<project-root>/
├── docs/
│   ├── README.md               index
│   ├── design.md               architecture (timeless)
│   ├── decisions.md            binding decisions (timeless)
│   ├── test-plan.md            test strategy (timeless)
│   └── ...
├── projects/
│   ├── project-workflow.md     THIS FILE
│   ├── active/                 ← current build's plan lives here
│   │   ├── implementation-plan.md
│   │   └── validation.json
│   └── archive/                ← completed builds, one dir per initiative
│       └── YYYY-MM-DD-<slug>-vX.Y/
│           ├── implementation-plan.md
│           ├── validation.json
│           └── postmortem.md   (optional — if a postmortem was written)
├── src/, __tests__/, …
```

`projects/active/` is where the **next** build's plan will be authored and executed. `projects/archive/` is a read-only history.

## Archive-dir naming

`YYYY-MM-DD-<slug>[-vX.Y]`

- **Date** — the day the build completed (not started). Use the completion date so chronological sort reflects delivery order.
- **Slug** — names the *initiative*, not the component. Examples: `initial`, `observability-refactor`, `bugfix-login-race`, `presentations-skill`. Keep it 2-4 words, kebab-case.
- **Version** — optional. Use it when the build corresponds to a meaningful version boundary (`-v0.1`, `-v1.0`). Skip when the initiative isn't versioned (bug fixes, refactors).

Examples:
- `2026-04-23-plan-executor-tools-v0.1/`
- `2026-05-02-observability-refactor/`
- `2026-05-14-bugfix-checksum-race/`

## Lifecycle

### 1. Author

Write the prose plan in `projects/active/implementation-plan.md`. Hand-author the initial `projects/active/validation.json` with phases, tasks, and criteria (see [state-manager.md](../docs/state-manager.md#validationjson-schema) for schema). Timeless design docs under `docs/` should already exist or get authored in parallel.

### 2. Initialise

```bash
bun ~/.claude/PAI/Tools/StateManager.ts init --path projects/active/validation.json
```

This computes `plan_checksum`, stamps `initialized`, and writes the active-plan pointer at `$HOME/.claude/MEMORY/STATE/plan-executor.active.json`. The PlanGate hook begins enforcing on Bash/Edit/Write tool calls from this moment until the plan completes.

### 3. Execute

Work the plan. CheckRunner evaluates the current task's criteria; StateManager advances `current_task` when all criteria PASS. The project's git history and `<project>/.plan-executor/events.jsonl` jointly record what happened.

### 4. Complete

The final `advance-task` (last task of last phase) flips top-level `status: "COMPLETED"` and deletes the pointer. PlanGate goes silent. The build is functionally done.

### 5. Archive

```bash
# 1. Pick a slug reflecting the initiative.
SLUG=2026-04-23-plan-executor-tools-v0.1

# 2. Create the archive directory.
mkdir -p projects/archive/$SLUG

# 3. Move (git-tracked rename preserves history).
git mv projects/active/implementation-plan.md projects/archive/$SLUG/
git mv projects/active/validation.json        projects/archive/$SLUG/

# 4. (Optional) If a postmortem was written for this build, move it in too.
#    Postmortems belong to the specific initiative, not the timeless docs.
git mv docs/postmortem.md projects/archive/$SLUG/   # if one exists

# 5. Commit.
git commit -m "chore(projects): archive $SLUG build"
```

`projects/active/` is now empty, ready for the next initiative.

### 6. Start the next build

Go back to step 1. Author the new build's plan in `projects/active/`. Run `init` against the new `validation.json`. The pointer now points at the new active plan. PlanGate enforces again.

## Edge cases

### Concurrent plans

Only one plan can be active at a time — the pointer file holds a single path (D9). If you need to run a bug-fix plan while a feature plan is in flight:

- **Serial handling** — pause the feature plan by deleting the pointer (or equivalently, letting it sit without a pointer), init the bug-fix plan, complete + archive it, then re-init the feature plan to restore the pointer.
- Re-init is idempotent as long as `plan_checksum` still matches, which it will if the feature plan's criteria structure hasn't drifted.

If you foresee this becoming common, `projects/active/` can also hold subdirectories (`projects/active/feature-X/`, `projects/active/bugfix-Y/`) — the convention is just about directory shape; the pointer's `validation_path` can target any absolute location.

### The `plan` field in validation.json

The top-level `"plan"` field currently carries a relative path like `"implementation-plan.md"`. Once archived, that relative path is technically stale. The Plan Executor Tools never resolve this field programmatically — it's purely a human-readable reference — so it's safe to leave as a historical oddity. If it bothers you, update it at archive time to reflect the new location, but don't re-run `init` (that would recompute the checksum against a state that already includes state-only fields like completion timestamps).

### Aborted plans

If an initiative is abandoned mid-way, flip top-level `status: "ABANDONED"` via a direct StateManager call *before* archiving (so the archived snapshot honestly reflects outcome), then archive under a slug like `2026-05-10-feature-X-abandoned/`.

### Interrupting a build to edit timeless docs

`docs/` files (design.md, decisions.md, etc.) are never blocked by PlanGate — edits to them don't touch `validation.json` and aren't "work-item" outputs. If a mid-build realisation requires a design-doc revision, edit freely. Note the change in the commit message so the plan's git history reflects the architectural shift.

### Postmortems

A postmortem is a per-build artifact: it captures what a specific initiative taught us. It belongs inside the archive directory of the initiative it post-mortems (`projects/archive/<slug>/postmortem.md`), not under `docs/`. If a postmortem is started mid-build, author it at `docs/postmortem.md` for convenience and move it into the archive at step 5 above.

## Why this shape

- **Self-contained.** A future reader cloning the repo sees the full planning history — both architecture (`docs/`) and execution (`projects/archive/`) — without needing access to any external archive.
- **Matches the mental model.** Design is a noun that evolves; projects are verbs that execute once and are done. Separate trees make that distinction manifest.
- **Pointer-transparent.** PlanGate's pointer holds absolute paths, so moving `validation.json` out of the project root is a zero-code-change migration. Only the `--path` argument to `init` changes.
- **Git-native.** `git mv` preserves file history across the archive step. `git log projects/archive/*/implementation-plan.md` tells the story of every build the project has run.
- **PAI-wide standard.** Nested projects inside a product or tools container use `projects/` as their container for initiative-bound artifacts. Consistent directory shape across every PAI project makes context-switching cheap.

## Open questions

Things that may shake out as we run more builds and will prompt updates to this file:

- Should `projects/archive/` carry a top-level `README.md` indexing builds with one-line descriptions? (Probably yes once there's more than one archived build.)
- Is there value in a `projects/active/<slug>/` subdir even for a single-plan build, for symmetry with the archive shape?
- What's the right cadence for pruning very old archives — never, or at major-version boundaries?

Update this doc when we decide.
