import pc from "picocolors";
import { loadBacklogConfig, loadDriftConfig } from "../config.js";
import { scanForRefs } from "../engine/scanner.js";
import { runStructuralChecks } from "../engine/structural.js";
import { formatHookOutput } from "../formatters/terminal.js";
import { loadAllTasks } from "../integrations/backlog-reader.js";
import { createGitIntegration } from "../integrations/git.js";

export async function runHookCheck(): Promise<void> {
	const projectRoot = process.cwd();
	const backlogConfig = loadBacklogConfig(projectRoot);

	if (backlogConfig.bypass_git_hooks) {
		process.exit(0);
	}

	const config = loadDriftConfig(projectRoot);
	const git = createGitIntegration(projectRoot);

	// Get staged files
	const stagedFiles = await git.getStagedFiles();
	if (stagedFiles.length === 0) {
		process.exit(0);
	}

	const allTasks = loadAllTasks(projectRoot);
	const output: string[] = [];
	let hasDrift = false;

	// 1. Structural drift: check tasks whose refs overlap with staged files
	const affectedTasks = allTasks.filter((task) => task.refs.some((ref) => stagedFiles.includes(ref)));

	if (affectedTasks.length > 0) {
		const results = await runStructuralChecks({
			tasks: affectedTasks,
			git,
			config,
			projectRoot,
		});

		if (results.length > 0) {
			hasDrift = true;
			output.push(formatHookOutput(results));
		}
	}

	// 2. Ref discovery: find tasks that mention staged files in their description
	// but don't have them as refs yet
	const scanResults = await scanForRefs(allTasks, git, projectRoot);
	const relevantScans = scanResults.filter((sr) => sr.discoveredRefs.some((ref) => stagedFiles.includes(ref)));

	if (relevantScans.length > 0) {
		const lines: string[] = [];
		lines.push(`\n${pc.cyan("ℹ backlog-drift: discovered new refs from staged files")}\n`);
		for (const scan of relevantScans) {
			const stagedRefs = scan.discoveredRefs.filter((r) => stagedFiles.includes(r));
			lines.push(`  ${pc.bold(scan.taskId)} "${scan.taskTitle}"`);
			for (const ref of stagedRefs) {
				lines.push(`    ${pc.cyan("+")} ${ref} ${pc.dim("(not yet tracked)")}`);
			}
		}
		lines.push("");
		lines.push(pc.dim("  Run `backlog-drift scan --apply` to add these references.\n"));
		output.push(lines.join("\n"));
	}

	if (output.length === 0) {
		process.exit(0);
	}

	switch (config.hook.mode) {
		case "silent":
			break;
		case "warn":
			process.stderr.write(output.join(""));
			process.exit(0);
			break;
		case "block":
			process.stderr.write(output.join(""));
			process.exit(hasDrift ? 1 : 0);
			break;
	}
}
