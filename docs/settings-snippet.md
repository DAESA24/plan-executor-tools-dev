# settings.json — PlanGate.hook Registration Snippet

Captured **2026-05-07** from `~/.claude/settings.json` against PAI **v4.0.3**.

## Why this file exists

The Plan Executor's `PlanGate.hook.ts` is a Claude Code PreToolUse hook. Its registration lives in the **global** `~/.claude/settings.json`, NOT in this project's source tree. A fresh install of PAI v5.0.0 (or any equivalent operation that rewrites `settings.json`) will erase the registration even though `PlanGate.hook.ts` itself can be redeployed from `src/`.

This file captures the exact JSON to re-paste into the new `settings.json` after a redeploy. **Verify the matcher list and hook ordering against the v5.0.0 settings schema before pasting** — v5 may add or remove matchers, and the order relative to other PreToolUse hooks (`SecurityValidator`, `CommitGuard`, etc.) can affect behavior.

## Registration shape (v4.0.3 captured state)

PlanGate fires on **three** PreToolUse matchers — `Bash`, `Edit`, `Write` — and is positioned **after** `SecurityValidator.hook.ts` on each.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "${PAI_DIR}/hooks/CommitGuard.hook.ts" },
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

> Only the three matchers shown above carry PlanGate. The `Read` matcher (and the `AskUserQuestion`, `Task`, `Skill` matchers in the surrounding settings) are intentionally NOT gated — PlanGate's purpose is to gate **mutating** tool calls when a plan is active. Do not extend the registration to `Read` on redeploy.

## Variables

- `${PAI_DIR}` resolves to `~/.claude` in v4.0.3. If v5.0.0 changes the convention, update accordingly.

## Redeploy checklist

After a `~/.claude/` overwrite, restoring Plan Executor requires:

1. Copy `src/StateManager.ts` → `~/.claude/PAI/Tools/StateManager.ts`
2. Copy `src/CheckRunner.ts` → `~/.claude/PAI/Tools/CheckRunner.ts`
3. Copy `src/PlanGate.hook.ts` → `~/.claude/hooks/PlanGate.hook.ts`
4. Merge the registration above into the new `~/.claude/settings.json` — preserving any v5-introduced hooks, matchers, or ordering rules
5. Append catalog entries for `StateManager.ts` and `CheckRunner.ts` to `~/.claude/PAI/TOOLS.md` (see existing v4.0.3 sections in `~/.claude.backup-{TIMESTAMP}/PAI/TOOLS.md` for verbatim copy)
6. Smoke test: `bun ~/.claude/PAI/Tools/StateManager.ts --help` exits 0 and shows usage; PlanGate fires correctly on a test pointer file at `~/.claude/MEMORY/STATE/plan-executor.active.json`.

## Reassessment before pasting

Per [issue #3](https://github.com/DAESA24/plan-executor-tools-dev/issues/3) (PAI v5.0.0 upgrade: assess keep / redeploy / retire), redeployment is **NOT** the default decision. v5.0.0 ships hooks that may overlap with PlanGate's behavior (`CheckpointPerISC.hook.ts`, `ISASync.hook.ts`, `ContainmentGuard.hook.ts`). Run the v5-compatibility assessment first; only paste this snippet if the decision is to keep Plan Executor.
