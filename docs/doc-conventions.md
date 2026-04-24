---
status: v1
updated: 2026-04-23
---

# Documentation Conventions

Project-wide conventions for markdown documentation. Minimal on purpose — if the rule set grows past one page, it's drifted.

## Frontmatter — every doc, two fields

Every markdown file in `docs/`, `projects/**/*.md`, and the project root (`README.md`) opens with YAML frontmatter:

```yaml
---
status: <short descriptor>
updated: YYYY-MM-DD
---
```

**Exactly those two fields.** No `created`, no `owner`, no `related`, no `supersedes`. Extra context belongs in the body.

### Why so minimal

Richer frontmatter was tried (decisions.md, implementation-plan.md) and didn't pay off: `created` dates drift toward becoming liars when files are renamed, `owner` is always Drew, `related` lists go stale every time a file moves, and `updated` was never populated at all across eleven docs. Two fields we can actually maintain beats five fields we can't.

### `status` — short human-readable descriptor

Whatever's meaningful for the doc. No fixed vocabulary. Common values that have emerged:

| Value | Typical use |
|---|---|
| `current` | Describes the live system and evolves with it (READMEs, reference docs, specs that move with the code) |
| `locked` | Binding until explicitly superseded (decisions) |
| `v1`, `v2-draft`, … | Explicitly versioned conventions |
| `draft` | Not yet stabilised |
| `complete` | Lifecycle ended (archived plans) |
| `superseded` | Replaced by another doc — cite the successor in the body |

Pick what fits. When a new kind of lifecycle appears, introduce a new value. Don't retrofit a vocabulary across unrelated docs.

### `updated` — ISO date, YYYY-MM-DD

Bumped whenever content changes in a meaningful way. Typo fixes and minor edits don't require a bump; behavior changes, new sections, status transitions, and any addition/removal of material facts do.

## Exclusions

- `CLAUDE.md` — a pure pointer file with its own don't-touch convention. No frontmatter.
- `package.json`, `tsconfig.json`, `.gitignore`, and other non-markdown config files — obviously no frontmatter.

## When to add frontmatter to a new doc

At creation. Every new markdown file in the project is born with the two-field block. If you find yourself tempted to skip it because "this doc doesn't really have a status," the doc probably either (a) shouldn't exist separately, or (b) does have a status and you haven't named it yet.

## Open questions

Things that may shake out as the project grows and will prompt updates here:

- Should `status` have a closed vocabulary enforced by a pre-commit check? Probably not until we have 50+ docs.
- Should `updated` be auto-bumped by a git hook? Tempting, but noisy — humans should notice when a doc changes meaningfully enough to warrant a bump.
- Do `~/.claude/PAI/…` docs (TOOLS.md, skill docs) need the same convention? Out of scope for *this* project; revisit when we have more projects under the same conventions.
