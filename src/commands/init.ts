import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";
import { driftConfigExists } from "../config.js";
import { installHook } from "../hooks/installer.js";

export async function runInit(): Promise<void> {
	const projectRoot = process.cwd();
	const backlogDir = resolve(projectRoot, "backlog");
	const configDest = resolve(projectRoot, ".backlog-drift.yml");
	const exampleSrc = resolve(import.meta.dirname, "../../.backlog-drift.yml.example");

	if (!existsSync(backlogDir)) {
		console.log(pc.red("✗ No backlog/ directory found. Is this a Backlog.md project?"));
		console.log(pc.dim("  Run `backlog init` first to set up Backlog.md."));
		process.exit(1);
	}

	if (driftConfigExists(projectRoot)) {
		console.log(pc.yellow("⚠ .backlog-drift.yml already exists."));
	} else {
		copyFileSync(exampleSrc, configDest);
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
