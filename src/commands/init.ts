import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { driftConfigExists } from "../config.js";
import { installHook } from "../hooks/installer.js";

const DEFAULT_CONFIG = `# Drift detection settings
structural:
  enabled: true
  check_dead_refs: true
  check_dependency_state: true
  check_stale_completions: true
  check_orphaned_tasks: true
  stale_completion_days: 14        # only flag if ref changed within N days of completion

semantic:
  enabled: false
  provider: anthropic               # anthropic | openai | ollama
  model: claude-sonnet-4-20250514

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
`;

export async function runInit(): Promise<void> {
	const projectRoot = process.cwd();
	const backlogDir = resolve(projectRoot, "backlog");
	const configDest = resolve(projectRoot, ".backlog-drift.yml");

	if (!existsSync(backlogDir)) {
		console.log(pc.red("✗ No backlog/ directory found. Is this a Backlog.md project?"));
		console.log(pc.dim("  Run `backlog init` first to set up Backlog.md."));
		process.exit(1);
	}

	if (driftConfigExists(projectRoot)) {
		console.log(pc.yellow("⚠ .backlog-drift.yml already exists."));
	} else {
		writeFileSync(configDest, DEFAULT_CONFIG);
		console.log(pc.green("✓ Created .backlog-drift.yml"));
	}

	// Install pre-commit hook
	const hookResult = installHook(projectRoot);
	if (hookResult.success) {
		console.log(pc.green(`✓ ${hookResult.message}`));
	} else {
		console.log(pc.yellow(`⚠ Could not install hook: ${hookResult.message}`));
	}

	console.log();
	console.log(pc.dim("  On every commit, backlog-drift will:"));
	console.log(pc.dim("    - Check staged files against task refs for drift"));
	console.log(pc.dim("    - Auto-discover new refs from staged files"));
	console.log();
	console.log(pc.dim("  Run `backlog-drift scan` to discover refs for existing tasks."));
	console.log(pc.dim("  Run `backlog-drift check` for a full drift scan."));
}
