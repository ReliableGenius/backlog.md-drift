# Product Requirements Document: backlog-drift

**AI-Powered Drift Detection for Backlog.md**

*Version 1.0 — March 2026*

---

## 1. Executive Summary

backlog-drift is a companion CLI tool that adds AI-powered drift detection to Backlog.md. It monitors whether code changes have made tasks stale, inaccurate, or silently resolved, then flags or auto-updates affected tasks. The tool reads and writes Backlog.md's native file format, integrates via git hooks, and is designed to eventually be contributed upstream as a PR to the Backlog.md project.

---

## 2. Delivery Strategy: Why Companion-First, Then PR

### The Three Options Evaluated

**Option A — Direct PR to Backlog.md**

The Backlog.md repo is actively maintained by MrLesk with 25 contributors and 179 releases. It's built on Bun + TypeScript with Commander.js, and uses gray-matter for YAML frontmatter parsing. The codebase is a monolithic CLI — there is no plugin architecture. A feature of this scope (new CLI subcommands, git hook modifications, LLM integration, new frontmatter fields) would be a very large PR touching many files across the project. The maintainer would need to accept responsibility for an LLM integration dependency and ongoing maintenance of a complex subsystem. Without a proven track record of the feature working well, this is a hard sell.

*Verdict: Too risky as a first move. High chance of rejection or indefinite review.*

**Option B — Plugin**

Backlog.md has no plugin system, hook mechanism, or extension API. Building a plugin would first require proposing and building the plugin architecture itself — a much larger undertaking that changes the project's fundamental design.

*Verdict: Not feasible. No plugin system exists to target.*

**Option C — Companion Tool (Recommended)**

Build a standalone CLI (`backlog-drift`) that reads Backlog.md's file format natively, installs alongside it, and operates on the same `backlog/tasks/` directory. This approach lets us prove value independently, iterate fast without maintainer bottleneck, ship immediately to users, and then use the working tool as the basis for an upstream PR once the feature is battle-tested and the community has validated it.

*Verdict: Best path. De-risks for both parties. Creates a working reference implementation for eventual upstream contribution.*

### The Handoff Path

The companion tool is explicitly designed to make upstream contribution easy:

1. **Phase 1 (Companion):** Ship `backlog-drift` as a standalone npm package. Users install it alongside `backlog.md`. Build community traction and prove value.
2. **Phase 2 (Integration Proposal):** Open a GitHub issue on Backlog.md proposing drift detection as a native feature, linking to `backlog-drift` as the reference implementation with real user feedback.
3. **Phase 3 (PR):** Submit a PR that ports the drift engine into Backlog.md's codebase as a new `backlog drift` subcommand. The companion tool's code, written in the same stack (Bun + TypeScript), maps directly into Backlog.md's source structure.
4. **Phase 4 (Deprecation):** Once merged upstream, `backlog-drift` publishes a final version that tells users to use the native `backlog drift` command instead.

### Design Decisions That Enable the Handoff

To make the eventual PR as painless as possible, backlog-drift will:

- Use **Bun + TypeScript**, matching Backlog.md's stack exactly
- Use **gray-matter** for frontmatter parsing, matching Backlog.md's parser
- Follow Backlog.md's code conventions (Biome for linting/formatting)
- **Never modify Backlog.md's existing frontmatter fields** — all drift metadata uses new, non-conflicting fields
- Structure the drift engine as a single importable module with clean boundaries, so porting to Backlog.md is a copy-and-wire operation
- Use Backlog.md's existing `--ref` (file references) field as the primary input for drift analysis, so no schema changes are needed

---

## 3. Problem Statement

Backlog.md solves the "issues should live with the code" problem, but it doesn't solve the "issues should stay accurate as the code changes" problem. Tasks reference files via `--ref`, describe behavior that evolves, and define acceptance criteria that may be silently satisfied or invalidated by ongoing development. Over time, the backlog accumulates drift:

- A task references `src/auth/oauth.ts` but that file was deleted in a refactor two weeks ago
- A task's acceptance criteria say "implement rate limiting middleware" but that middleware already exists, merged in a different task's PR
- A task describes an approach using library X, but the project switched to library Y
- A completed task's description no longer matches how the feature actually works, making it misleading as a historical record

For solo developers using AI agents, this drift is especially damaging. The agent consumes the backlog as context, and stale tasks produce stale plans.

---

## 4. Backlog.md Integration Points

### Existing Task Format (No Changes Required)

Backlog.md tasks already have everything drift detection needs. The existing YAML frontmatter includes:

```yaml
---
id: task-178
title: Enhance backlog init with configuration support
status: Done
assignee:
  - '@claude'
created_date: '2025-07-12'
updated_date: '2025-07-13'
labels: []
dependencies: []
priority: high
---
```

And the CLI already supports file references:

```bash
backlog task create "Feature" --ref src/api.ts --ref src/middleware.ts
```

These `--ref` values become part of the task metadata. backlog-drift uses these as its primary signal for which tasks are affected by a given code change.

### New Frontmatter Fields (Additive Only)

backlog-drift adds optional fields that Backlog.md will simply ignore (gray-matter passes through unknown fields):

```yaml
---
# ... existing Backlog.md fields unchanged ...
drift_status: clean          # clean | flagged | auto-updated
drift_checked: '2026-03-01'  # last drift check timestamp
drift_log:                   # append-only history of drift events
  - date: '2026-03-01'
    type: ref-deleted
    detail: 'src/auth/oauth.ts no longer exists'
    resolution: flagged
---
```

### CLI Interaction

backlog-drift reads from and writes to the same `backlog/tasks/` directory. It shells out to `backlog task edit` for modifications when possible (to maintain metadata consistency via Backlog.md's own parser), falling back to direct file writes only when necessary.

### Git Hook Coordination

Backlog.md uses `.husky` for git hooks and has a `bypassGitHooks` config option. backlog-drift installs its own hook logic by appending to the existing `.husky/pre-commit` file (or creating one), respecting Backlog.md's `bypassGitHooks` setting by reading `backlog/config.yml`.

---

## 5. Feature Specification

### 5.1 Drift Detection Layers

**Layer 1 — Structural Drift (Deterministic, No AI Required)**

These checks run fast, require no external services, and have zero false positives:

| Check | Signal | Action |
|-------|--------|--------|
| **Dead references** | A file in the task's `ref` list has been deleted or renamed | Flag task with `ref-deleted` |
| **Dependency state change** | A task in `dependencies` has moved to Done or was archived | Flag task with `dep-resolved` |
| **Stale completion** | Task is Done, but a `ref` file has been modified since `updated_date` | Flag task with `post-complete-change` |
| **Orphaned task** | Task is in To Do or In Progress but all `ref` files were deleted | Flag task with `refs-orphaned` |

**Layer 2 — Semantic Drift (AI-Powered, Opt-In)**

These checks use an LLM to analyze whether task content still matches the referenced code:

| Check | Signal | Action |
|-------|--------|--------|
| **Description drift** | Task description references behavior/architecture that has changed | Suggest updated description |
| **Criteria completion** | Acceptance criteria describe work that has been done (based on diff + current code) | Suggest checking off criteria |
| **Criteria invalidation** | Acceptance criteria reference patterns or approaches no longer in use | Suggest updated criteria |
| **Redundancy detection** | Task describes work that another completed task has already covered | Flag as potentially redundant |

### 5.2 CLI Commands

```bash
# Core commands
backlog-drift check                    # Run structural drift checks on all active tasks
backlog-drift check --semantic         # Also run AI-powered semantic checks
backlog-drift check --task task-42     # Check a specific task only
backlog-drift check --since HEAD~5     # Only check against recent commits

# Resolution
backlog-drift fix                      # Auto-fix structural issues (update refs, flag tasks)
backlog-drift fix --semantic           # Also apply AI-suggested updates
backlog-drift review                   # Interactive TUI to review and accept/reject suggestions

# Hook management
backlog-drift hook install             # Add drift check to .husky/pre-commit
backlog-drift hook remove              # Remove drift check from pre-commit hook
backlog-drift hook status              # Show current hook configuration

# Configuration
backlog-drift init                     # Create .backlog-drift.yml config
backlog-drift config                   # Interactive configuration wizard

# Reporting
backlog-drift report                   # Generate a drift health report
backlog-drift report --json            # Machine-readable output for CI
```

### 5.3 Configuration

Configuration lives in `.backlog-drift.yml` at the project root (separate from Backlog.md's config to avoid polluting it):

```yaml
# Drift detection settings
structural:
  enabled: true
  check_dead_refs: true
  check_dependency_state: true
  check_stale_completions: true
  stale_completion_days: 14        # only flag if ref changed within N days of completion

semantic:
  enabled: false
  provider: anthropic               # anthropic | openai | ollama
  model: claude-sonnet-4-20250514
  # API key from BACKLOG_DRIFT_API_KEY env var

# Hook behavior
hook:
  mode: warn                        # warn | block | silent
  structural_only: true             # only run structural checks in hooks (fast)
  semantic_on_commit: false          # semantic checks are slow; run manually

# What to check
scope:
  statuses:                          # only check tasks in these statuses
    - To Do
    - In Progress
    - Review
  check_completed: true              # also check Done tasks for post-complete drift
  check_archived: false
  ignore_tasks: []                   # task IDs to exclude from drift checks
  ignore_refs: []                    # file patterns to exclude (e.g., "*.test.ts")
```

### 5.4 Pre-Commit Hook Behavior

When installed, the pre-commit hook runs on every commit:

1. Parse the staged diff to get the list of changed files
2. Load all active tasks from `backlog/tasks/`
3. Cross-reference changed files against each task's `ref` list
4. Run structural drift checks on affected tasks only (fast — typically <1s)
5. Based on `hook.mode`:
   - **warn**: Print drift warnings to stderr, allow commit to proceed
   - **block**: Print warnings, abort commit if drift detected
   - **silent**: Log to `.backlog-drift-log.json`, don't print anything

Example output:

```
⚠ backlog-drift: 2 tasks affected by this commit

  task-42 "Add rate limiting"
    ⚠ ref src/middleware/rateLimit.ts was modified
    → Description may need updating. Run `backlog-drift check --task task-42 --semantic`

  task-19 "OAuth integration"  [Done]
    ✗ ref src/auth/oauth.ts no longer exists
    → Task references a deleted file. Run `backlog-drift fix --task task-19`
```

### 5.5 Interactive Review TUI

`backlog-drift review` launches a terminal UI (built with Ink or similar) that:

- Lists all tasks with flagged drift, grouped by severity
- Shows the task content alongside the relevant code diff
- For semantic suggestions, shows the proposed change with a diff view
- Allows accept/reject/skip for each suggestion
- Applies accepted changes via `backlog task edit` where possible

### 5.6 MCP Server (Future Phase)

An MCP server exposing drift tools to AI agents:

- `drift_check` — Run drift analysis on a task
- `drift_fix` — Apply suggested fixes
- `drift_report` — Get project-wide drift summary

This enables AI agents to self-heal the backlog during their work sessions.

---

## 6. Architecture

### 6.1 Module Structure

```
backlog-drift/
├── src/
│   ├── index.ts                    # CLI entry point (Commander.js)
│   ├── engine/
│   │   ├── structural.ts           # Layer 1 drift detection
│   │   ├── semantic.ts             # Layer 2 drift detection (LLM)
│   │   └── resolver.ts             # Applies fixes to task files
│   ├── integrations/
│   │   ├── backlog-reader.ts       # Reads Backlog.md task files (gray-matter)
│   │   ├── backlog-writer.ts       # Writes changes (via CLI or direct)
│   │   ├── git.ts                  # Git diff analysis, staging, history
│   │   └── llm/
│   │       ├── adapter.ts          # Provider abstraction
│   │       ├── anthropic.ts        # Anthropic API client
│   │       ├── openai.ts           # OpenAI API client
│   │       └── ollama.ts           # Ollama local model client
│   ├── hooks/
│   │   ├── installer.ts            # Hook installation/removal
│   │   └── runner.ts               # Hook execution logic
│   ├── tui/
│   │   └── review.ts               # Interactive review interface
│   ├── config.ts                   # Config loading and validation
│   └── types.ts                    # Shared TypeScript types
├── .backlog-drift.yml.example
├── package.json
├── tsconfig.json
└── biome.json                       # Matching Backlog.md's linter
```

### 6.2 Key Design Principles

**Read Backlog.md's format, don't reinvent it.** The reader module uses gray-matter to parse task files identically to how Backlog.md does. Any field Backlog.md writes, backlog-drift reads correctly.

**Write through Backlog.md's CLI when possible.** For operations like changing task status or editing descriptions, shell out to `backlog task edit` to ensure Backlog.md's own validation and formatting logic is applied. Only write directly for adding new drift-specific fields that Backlog.md's CLI doesn't know about.

**Structural checks are sacred.** They must be fast (<1s for a typical project), deterministic, and produce zero false positives. They should never require network access. This is the baseline that runs in every commit hook.

**Semantic checks are advisory.** They can be slow, they require LLM access, and they will sometimes be wrong. They should never auto-apply without explicit user consent (unless the user has opted into auto-update mode).

**Be a good neighbor.** Never break Backlog.md's behavior. Never remove or modify fields that Backlog.md owns. If Backlog.md changes its format in a future release, backlog-drift should degrade gracefully, not crash.

### 6.3 Dependencies

| Dependency | Purpose | Note |
|-----------|---------|------|
| gray-matter | YAML frontmatter parsing | Same version as Backlog.md |
| commander | CLI framework | Same as Backlog.md |
| simple-git | Git operations | Lightweight wrapper over git CLI |
| ink (optional) | Terminal UI for review mode | Can defer to Phase 2 |
| zod | Config and schema validation | |

No LLM SDK dependencies — provider integrations use raw HTTP fetch to keep the dependency tree minimal.

---

## 7. User Flows

### 7.1 First-Time Setup

```
$ cd my-project                       # already has Backlog.md initialized
$ npm i -g backlog-drift              # or: bun add -g backlog-drift
$ backlog-drift init

  Found Backlog.md project at ./backlog/
  ✓ Created .backlog-drift.yml
  ? Install pre-commit hook? [Y/n] Y
  ✓ Added drift check to .husky/pre-commit
  ? Enable semantic drift detection? (requires LLM API key) [y/N] N
  ✓ Ready. Structural drift checks will run on every commit.
  ✓ Run `backlog-drift check` anytime for a full scan.
```

### 7.2 Commit With Drift Warning

```
$ git add src/auth/
$ git commit -m "refactor: replace passport with custom JWT auth"

  ⚠ backlog-drift: 3 tasks affected

    task-19 "OAuth integration"  [Done]
      ✗ ref src/auth/passport.ts deleted
      ✗ ref src/auth/strategies/ deleted

    task-31 "Add social login"  [In Progress]
      ⚠ ref src/auth/passport.ts deleted — task may need updating

    task-44 "Auth middleware tests"  [To Do]
      ⚠ ref src/auth/middleware.ts modified

  Run `backlog-drift review` to resolve, or `backlog-drift fix` to auto-fix refs.

[main abc1234] refactor: replace passport with custom JWT auth
```

### 7.3 Interactive Review

```
$ backlog-drift review

  ┌─────────────────────────────────────────────────┐
  │  task-19: OAuth integration  [Done]             │
  │  Drift: 2 referenced files deleted              │
  │                                                 │
  │  - src/auth/passport.ts      [DELETED]          │
  │  - src/auth/strategies/      [DELETED]          │
  │                                                 │
  │  [u] Update refs  [a] Archive task  [s] Skip    │
  └─────────────────────────────────────────────────┘
```

### 7.4 Semantic Drift Check

```
$ backlog-drift check --task task-31 --semantic

  task-31: "Add social login"  [In Progress]

  Structural:
    ✗ ref src/auth/passport.ts deleted

  Semantic:
    ⚠ Description references Passport.js strategies, but the auth module
      now uses a custom JWT implementation (src/auth/jwt.ts).
    ⚠ Acceptance criterion "Configure Google OAuth strategy in Passport"
      references a library no longer in use.

  Suggested changes:
    - Update description to reference JWT-based auth flow
    - Replace acceptance criteria referencing Passport with JWT equivalents
    - Add ref: src/auth/jwt.ts
    - Remove ref: src/auth/passport.ts

  [a] Apply all  [r] Review each  [s] Skip
```

---

## 8. Prompt Engineering for Semantic Drift

The semantic drift engine sends focused, scoped prompts to the LLM. Here's the template structure:

```
You are analyzing whether a project task is still accurate given recent code changes.

## Task
{task frontmatter + body}

## Referenced Files (Current State)
{content of each file in the task's ref list that still exists}

## Recent Changes to Referenced Files
{git diff for each ref file, scoped to the last N commits}

## Deleted Referenced Files
{list of ref files that no longer exist}

## Analysis Required
1. Does the task description still accurately describe the current state of the code?
2. Are any acceptance criteria already satisfied by the current code?
3. Are any acceptance criteria impossible or irrelevant given the current code?
4. Should any file references be added or removed?

Respond with a JSON object containing your analysis and suggested changes.
```

The prompt is designed to be token-efficient: it only includes the content of files actually referenced by the task, not the entire codebase.

---

## 9. Roadmap

### Phase 1 — Structural Engine (Weeks 1–3)

- Project scaffolding (Bun + TypeScript + Commander.js + Biome)
- Backlog.md file reader using gray-matter
- Structural drift detection (dead refs, dependency state, stale completions)
- `backlog-drift check` command
- `backlog-drift fix` for structural issues (update/remove dead refs)
- Pre-commit hook installation via `.husky`
- `.backlog-drift.yml` configuration

### Phase 2 — Semantic Engine (Weeks 4–6)

- LLM adapter with Anthropic, OpenAI, and Ollama providers
- Semantic drift detection (description drift, criteria completion/invalidation)
- `backlog-drift check --semantic` command
- Suggestion generation and storage
- `backlog-drift review` interactive TUI

### Phase 3 — Polish & Ecosystem (Weeks 7–8)

- `backlog-drift report` for project-wide health view
- JSON output for CI integration
- GitHub Actions example workflow
- Documentation and README
- npm publish

### Phase 4 — Upstream Contribution (Post-Launch)

- Gather user feedback and usage data
- Open a feature proposal issue on MrLesk/Backlog.md
- Refactor drift engine into a clean module matching Backlog.md's conventions
- Submit PR adding `backlog drift` as a native subcommand
- Deprecate standalone package once merged

---

## 10. Upstream PR Strategy

When contributing to Backlog.md, the PR should be structured to minimize maintainer burden:

**What the PR adds:**
- New `backlog drift` subcommand with `check`, `fix`, and `review` sub-commands
- New optional frontmatter fields (`drift_status`, `drift_checked`, `drift_log`)
- Drift configuration section in `backlog/config.yml`
- Drift indicators in the terminal board and web UI
- Documentation updates

**What the PR does NOT add:**
- No new npm dependencies beyond what Backlog.md already uses (gray-matter, commander, simple-git)
- No mandatory LLM dependency — semantic checks are opt-in and the LLM adapter uses raw fetch
- No changes to existing task file format — all new fields are additive
- No changes to existing CLI commands — `backlog drift` is a new subcommand

**The pitch to the maintainer:**
"Backlog.md already has file references via `--ref`. This PR makes those references active rather than passive — they become the system's awareness of whether tasks are still accurate. The drift engine is a natural extension of the existing data model, not a new concept."

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Backlog.md changes its file format, breaking backlog-drift | Pin to a known schema version. Validate on read and degrade gracefully. Maintain a compatibility test suite against multiple Backlog.md versions. |
| Maintainer rejects upstream PR | The companion tool remains valuable standalone. It's MIT-licensed and self-sufficient. This is not a failure case — it's the baseline. |
| Pre-commit hook slows down developer workflow | Structural checks only by default (<1s). Semantic checks are manual-only unless explicitly opted in. Standard `--no-verify` escape hatch documented. |
| Semantic drift suggestions are wrong or noisy | Conservative defaults. Never auto-apply without consent. Tunable sensitivity. Every suggestion includes the LLM's reasoning so the developer can judge quality. |
| Users don't use `--ref` on their tasks, so there's nothing to check | Provide a `backlog-drift scan` command that analyzes task descriptions and suggests ref links based on file paths mentioned in the text. Include onboarding guidance for getting maximum value from refs. |
| LLM token costs for large codebases | Scoped analysis: only send content of files in the task's ref list, not the whole repo. Cache results by commit hash. Support local models via Ollama for zero-cost operation. |

---

## 12. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Structural drift catch rate | 100% of dead refs detected | Automated test suite |
| Pre-commit hook latency | <1s for structural checks | Benchmark on repos with 50+ tasks |
| Semantic suggestion acceptance rate | >60% of suggestions accepted by users | Telemetry opt-in or user survey |
| npm weekly downloads | 500+ within 3 months of launch | npm stats |
| Upstream PR submission | Within 6 months of initial release | Calendar milestone |

---

*This PRD is scoped to the companion tool phase. The upstream PR phase will require a separate, shorter design doc tailored to Backlog.md's contribution guidelines and maintainer preferences.*
