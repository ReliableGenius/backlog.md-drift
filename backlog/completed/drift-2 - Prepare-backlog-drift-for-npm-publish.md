---
id: DRIFT-2
title: Prepare backlog-drift for npm publish
status: Done
assignee: []
created_date: '2026-03-07 22:13'
updated_date: '2026-03-07 22:16'
labels:
  - npm
  - release
dependencies:
  - DRIFT-1
references:
  - package.json
  - src/index.ts
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make the package publishable to npm so users can install via `npm i -g backlog-drift` or `bun add -g backlog-drift`.

Currently the `bin` field points to `src/index.ts` (TypeScript source), which only works with Bun. Need to build a standalone bundle, control what gets published, and wire up publish scripts.

**Changes needed:**
1. Build step: bundle `src/index.ts` into `dist/index.js` with bun build
2. `bin` field: point to `dist/index.js` with proper shebang
3. `files` field: whitelist only `dist/`, `LICENSE`, `README.md`
4. `prepublishOnly` script: run checks + build before publish
5. Verify the built CLI works without Bun (plain Node.js compat)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bin field points to built JS output, not TypeScript source
- [x] #2 files field limits published package to dist/, LICENSE, README.md
- [x] #3 prepublishOnly script runs type check, lint, tests, and build
- [x] #4 Built CLI runs correctly with node (not just bun)
- [x] #5 npm pack produces a clean tarball with no test files, backlog/, or PRD
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
## npm publish readiness

All changes verified and working:

- `bin` → `dist/index.js` with `#!/usr/bin/env node` shebang
- `files` field limits tarball to `dist/`, `LICENSE`, `README.md` (4 files, 154KB packed)
- `prepublishOnly` runs type check → lint → test → build
- Built CLI runs correctly with plain `node` (verified `--version` and `--help`)
- `npm pack --dry-run` produces clean tarball with no test files, backlog/, or PRD
- Build script replaces `#!/usr/bin/env bun` → `#!/usr/bin/env node` automatically
<!-- SECTION:FINAL_SUMMARY:END -->
