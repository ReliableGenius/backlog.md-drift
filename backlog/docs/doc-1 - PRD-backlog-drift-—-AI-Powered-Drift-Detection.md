---
id: doc-1
title: 'PRD: backlog-drift — AI-Powered Drift Detection'
type: other
created_date: '2026-03-07 21:17'
---
# Product Requirements Document: backlog-drift

**AI-Powered Drift Detection for Backlog.md**

*Version 1.0 — March 2026*

---

## 1. Executive Summary

backlog-drift is a companion CLI tool that adds AI-powered drift detection to Backlog.md. It monitors whether code changes have made tasks stale, inaccurate, or silently resolved, then flags or auto-updates affected tasks. The tool reads and writes Backlog.md's native file format, integrates via git hooks, and is designed to eventually be contributed upstream as a PR to the Backlog.md project.

---

## 2. Delivery Strategy: Companion-First, Then PR

Build a standalone CLI (`backlog-drift`) that reads Backlog.md's file format natively, installs alongside it, and operates on the same `backlog/tasks/` directory. This lets us prove value independently, iterate fast, ship immediately, and then use the working tool as the basis for an upstream PR once battle-tested.

### Handoff Path
1. **Phase 1 (Companion):** Ship as standalone npm package
2. **Phase 2 (Integration Proposal):** Open GitHub issue on Backlog.md with reference implementation
3. **Phase 3 (PR):** Port drift engine into Backlog.md as `backlog drift` subcommand
4. **Phase 4 (Deprecation):** Final version redirects to native command

### Design Decisions for Handoff
- Bun + TypeScript (matching Backlog.md's stack)
- gray-matter for frontmatter parsing (matching Backlog.md's parser)
- Biome for linting/formatting (matching Backlog.md's conventions)
- Never modify existing frontmatter fields — drift metadata uses new fields only
- Drift engine structured as single importable module with clean boundaries
- Uses existing `--ref` field as primary input

---

## 3. Problem Statement

Backlog.md solves "issues should live with the code" but not "issues should stay accurate as code changes." Tasks accumulate drift:
- Dead references (deleted/renamed files)
- Silently completed acceptance criteria
- Outdated approach descriptions
- Misleading historical records

For AI agents consuming the backlog as context, stale tasks produce stale plans.

---

## 4. Drift Detection Layers

### Layer 1 — Structural (Deterministic, No AI)
| Check | Signal | Action |
|-------|--------|--------|
| Dead references | ref file deleted/renamed | Flag `ref-deleted` |
| Dependency state change | dependency moved to Done/archived | Flag `dep-resolved` |
| Stale completion | Done task's ref modified since `updated_date` | Flag `post-complete-change` |
| Orphaned task | All ref files deleted | Flag `refs-orphaned` |

### Layer 2 — Semantic (AI-Powered, Opt-In)
| Check | Signal | Action |
|-------|--------|--------|
| Description drift | Description doesn't match current code | Suggest updated description |
| Criteria completion | AC already satisfied by current code | Suggest checking off |
| Criteria invalidation | AC references obsolete patterns | Suggest updated criteria |
| Redundancy detection | Work covered by another completed task | Flag as redundant |

---

## 5. CLI Commands

```bash
backlog-drift check [--semantic] [--task ID] [--since REF]
backlog-drift fix [--semantic]
backlog-drift review              # Interactive TUI
backlog-drift hook install|remove|status
backlog-drift init
backlog-drift config
backlog-drift report [--json]
```

---

## 6. Architecture

```
backlog-drift/
├── src/
│   ├── index.ts                    # CLI entry (Commander.js)
│   ├── engine/
│   │   ├── structural.ts           # Layer 1
│   │   ├── semantic.ts             # Layer 2 (LLM)
│   │   └── resolver.ts             # Applies fixes
│   ├── integrations/
│   │   ├── backlog-reader.ts       # gray-matter reader
│   │   ├── backlog-writer.ts       # CLI or direct writes
│   │   ├── git.ts                  # Git operations
│   │   └── llm/                    # Provider adapters (fetch-based)
│   ├── hooks/                      # Hook install/run
│   ├── tui/                        # Interactive review
│   ├── config.ts
│   └── types.ts
```

Dependencies: gray-matter, commander, simple-git, zod, ink (optional). No LLM SDK deps — raw HTTP fetch.

---

## 7. Roadmap

- **Phase 1 (Structural Engine):** Scaffolding, reader, structural checks, `check`/`fix` commands, hooks, config
- **Phase 2 (Semantic Engine):** LLM adapter, semantic checks, `review` TUI
- **Phase 3 (Polish):** Reports, CI integration, docs, npm publish
- **Phase 4 (Upstream):** Community feedback, PR to Backlog.md, deprecate standalone
