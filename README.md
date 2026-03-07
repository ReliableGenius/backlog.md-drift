# backlog-drift

AI-powered drift detection for [Backlog.md](https://github.com/MrLesk/Backlog.md). Detects when code changes make your backlog tasks stale, inaccurate, or silently resolved.

## The Problem

Backlog.md keeps issues alongside your code, but it doesn't detect when tasks become outdated as code evolves:

- A task references `src/auth/oauth.ts` but that file was deleted in a refactor
- Acceptance criteria say "implement rate limiting" but it already exists
- A completed task's referenced files have been modified since completion
- All of a task's referenced files are gone, but the task is still open

For AI agents consuming the backlog as context, stale tasks produce stale plans.

## How It Works

**Layer 1 — Structural Drift (deterministic, fast, zero false positives)**

| Check | What it detects |
|-------|----------------|
| Dead references | A `ref` file has been deleted or renamed |
| Dependency state | A dependency task has been completed or archived |
| Stale completion | A Done task's ref was modified after completion |
| Orphaned task | All ref files deleted, task still active |

**Layer 2 — Semantic Drift (AI-powered, opt-in)**

Uses an LLM to analyze whether task descriptions and acceptance criteria still match the referenced code. Supports Anthropic, OpenAI, and Ollama (local models).

## Quick Start

```bash
# Install
bun add -g backlog-drift       # or: npm i -g backlog-drift

# Initialize (creates config + installs pre-commit hook)
backlog-drift init

# Discover file references for existing tasks
backlog-drift scan --apply

# Run drift checks
backlog-drift check
```

## Commands

```
backlog-drift check [options]     Run drift checks on backlog tasks
  -t, --task <id>                 Check a specific task
  -s, --since <ref>               Only check changes since a git ref
  --semantic                      Also run AI-powered semantic checks
  --json                          Output as JSON

backlog-drift fix [options]       Auto-fix structural drift issues
  -t, --task <id>                 Fix a specific task
  --dry-run                       Show proposed changes without applying
  --semantic                      Also apply AI-suggested updates
  -y, --yes                       Apply without confirmation

backlog-drift scan [options]      Discover file refs from descriptions & git history
  -t, --task <id>                 Scan a specific task
  --apply                         Auto-add discovered refs to tasks
  --json                          Output as JSON

backlog-drift report [--json]     Generate a drift health report
backlog-drift init                Create config and install pre-commit hook
backlog-drift config              Show current configuration
backlog-drift hook install        Install pre-commit hook
backlog-drift hook remove         Remove pre-commit hook
backlog-drift hook status         Show hook installation status
```

## Pre-Commit Hook

When installed (automatically via `backlog-drift init`), the pre-commit hook runs on every commit:

1. Checks staged files against task refs for structural drift
2. Discovers untracked refs from staged files mentioned in task descriptions
3. Reports findings based on `hook.mode`:
   - **warn** (default): print warnings, allow commit
   - **block**: print warnings, abort commit if drift detected
   - **silent**: log only

Example output:

```
⚠ backlog-drift: 2 tasks affected by this commit

  DRIFT-42 "Add rate limiting"
    ⚠ ref src/middleware/rateLimit.ts was modified

  DRIFT-19 "OAuth integration"  [Done]
    ✗ ref src/auth/oauth.ts no longer exists

ℹ backlog-drift: discovered new refs from staged files

  DRIFT-31 "Add social login"
    + src/auth/jwt.ts (not yet tracked)

  Run `backlog-drift scan --apply` to add these references.
```

## Configuration

`backlog-drift init` creates `.backlog-drift.yml`:

```yaml
structural:
  enabled: true
  check_dead_refs: true
  check_dependency_state: true
  check_stale_completions: true
  check_orphaned_tasks: true
  stale_completion_days: 14

semantic:
  enabled: false
  provider: anthropic          # anthropic | openai | ollama
  model: claude-sonnet-4-20250514
  # API key via BACKLOG_DRIFT_API_KEY env var

hook:
  mode: warn                   # warn | block | silent
  structural_only: true

scope:
  statuses:
    - To Do
    - In Progress
    - Review
  check_completed: true
  check_archived: false
  ignore_tasks: []
  ignore_refs: []              # e.g., "*.test.ts"
```

## How Tasks Get File References

backlog-drift uses Backlog.md's existing `--ref` field to know which files each task cares about:

```bash
backlog task create "Add auth" --ref src/auth.ts --ref src/middleware.ts
```

For tasks without refs, `backlog-drift scan` discovers them:
- Parses task descriptions for file paths
- Searches git history for commits mentioning the task ID
- Suggests adding them: `backlog-drift scan --apply`

## Upstream Contribution Path

backlog-drift is designed to eventually merge into Backlog.md as a native `backlog drift` subcommand:

- Same stack: Bun + TypeScript + Commander.js + gray-matter + Biome
- Same code conventions and formatting
- Additive-only changes to task frontmatter (`drift_status`, `drift_checked`, `drift_log`)
- No new dependencies beyond what Backlog.md already uses

## Development

```bash
# Install dependencies
bun install

# Run tests (121 tests, ~99% coverage)
bun test

# Type check
bun run check:types

# Lint & format
bun run check
bun run check:fix

# Run CLI locally
bun run src/index.ts check
```

## License

[MIT](LICENSE)
