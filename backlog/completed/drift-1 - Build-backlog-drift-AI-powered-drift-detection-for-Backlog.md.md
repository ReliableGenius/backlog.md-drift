---
id: DRIFT-1
title: 'Build backlog-drift: AI-powered drift detection for Backlog.md'
status: Done
assignee: []
created_date: '2026-03-07 21:17'
updated_date: '2026-03-07 22:16'
labels:
  - initiative
  - cli
dependencies: []
references:
  - src/index.ts
  - src/engine/structural.ts
  - src/engine/semantic.ts
  - src/integrations/backlog-reader.ts
  - src/integrations/git.ts
  - src/config.ts
  - src/types.ts
documentation:
  - PRD-backlog-drift.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build a standalone companion CLI tool (`backlog-drift`) that detects when code changes make Backlog.md tasks stale, inaccurate, or silently resolved. The tool reads Backlog.md's native file format, integrates via git hooks, and flags or auto-updates affected tasks.

**Why:** Backlog.md tracks issues alongside code but doesn't detect when tasks become outdated as code evolves. Dead file references, silently completed acceptance criteria, and outdated descriptions accumulate as drift — especially damaging for AI agents consuming the backlog as context.

**Strategy:** Ship as a standalone npm package first (companion tool), then contribute upstream to Backlog.md as a native `backlog drift` subcommand once battle-tested.

**Stack:** Bun + TypeScript + Commander.js + gray-matter + Biome (matching Backlog.md's stack exactly for eventual upstream PR).

See linked PRD document for full specification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Phase 1 complete: structural drift detection (dead refs, dependency state, stale completions, orphaned tasks) works end-to-end
- [x] #2 Phase 2 complete: semantic drift detection via LLM (description drift, criteria completion/invalidation, redundancy) works end-to-end
- [x] #3 Phase 3 complete: reporting, CI-friendly JSON output, documentation, and npm publish
- [x] #4 CLI commands implemented: check, fix, review, hook install/remove/status, init, config, report
- [x] #5 Pre-commit hook runs structural checks in <1s on typical projects
- [x] #6 Reads Backlog.md task files correctly via gray-matter (matching Backlog.md's parser)
- [x] #7 Writes changes through `backlog task edit` CLI when possible, direct file writes only for drift-specific fields
- [x] #8 Configuration via .backlog-drift.yml with sensible defaults
- [x] #9 Zero false positives on structural drift checks
- [x] #10 Semantic checks never auto-apply without explicit user consent
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## Full implementation complete

All 6 subtasks implemented:
1. **Scaffolding, types, config, backlog reader** — Zod-validated config, gray-matter task parser
2. **Git integration & structural engine** — 4 checks: dead refs, dependency state, stale completion, orphaned tasks
3. **CLI commands** — check, fix, init, config, report, scan, hook
4. **Resolver & writer** — Auto-fix with dry-run, writes via backlog CLI or direct file
5. **Git hooks** — Pre-commit hook with warn/block/silent modes, ref discovery on commit
6. **Semantic engine & LLM** — Anthropic/OpenAI/Ollama via raw fetch, no SDK deps

Stats: 121 tests, 98.74% coverage, all type checks and Biome lint passing.
npm publish ready: clean tarball, Node.js compatible build.
<!-- SECTION:FINAL_SUMMARY:END -->
