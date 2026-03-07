import pc from "picocolors";
import { scanForRefs } from "../engine/scanner.js";
import { loadAllTasks } from "../integrations/backlog-reader.js";
import { createGitIntegration } from "../integrations/git.js";

interface ScanOptions {
	task?: string;
	apply?: boolean;
	json?: boolean;
}

export async function runScan(opts: ScanOptions): Promise<void> {
	const projectRoot = process.cwd();
	let tasks = loadAllTasks(projectRoot);
	const git = createGitIntegration(projectRoot);

	if (opts.task) {
		tasks = tasks.filter((t) => t.id.toLowerCase() === opts.task?.toLowerCase());
		if (tasks.length === 0) {
			console.log(pc.red(`Task ${opts.task} not found.`));
			process.exit(1);
		}
	}

	const results = await scanForRefs(tasks, git, projectRoot);

	if (results.length === 0) {
		console.log(pc.green("✓ No new file references discovered."));
		return;
	}

	if (opts.json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	console.log(pc.bold(`Found references for ${results.length} task${results.length === 1 ? "" : "s"}:\n`));

	for (const result of results) {
		console.log(`  ${pc.bold(result.taskId)} "${result.taskTitle}"`);
		if (result.existingRefs.length > 0) {
			console.log(pc.dim(`    Existing refs: ${result.existingRefs.join(", ")}`));
		}
		console.log(`    ${pc.green("Discovered")} (${result.discoveredRefs.length}):`);
		for (const ref of result.discoveredRefs) {
			const sources = result.sources[ref].join(", ");
			console.log(`      ${pc.green("+")} ${ref} ${pc.dim(`(${sources})`)}`);
		}
		console.log();
	}

	if (opts.apply) {
		const { execSync } = await import("node:child_process");
		for (const result of results) {
			const refArgs = result.discoveredRefs.map((r) => `--ref ${r}`).join(" ");
			try {
				execSync(`backlog task edit ${result.taskId} ${refArgs}`, { stdio: "pipe", timeout: 10000 });
				console.log(`  ${pc.green("✓")} Added ${result.discoveredRefs.length} ref(s) to ${result.taskId}`);
			} catch (e) {
				console.log(`  ${pc.red("✗")} Failed to update ${result.taskId}: ${e}`);
			}
		}
	} else {
		console.log(pc.dim("  Run with --apply to add these references, or manually:"));
		for (const result of results) {
			const refArgs = result.discoveredRefs.map((r) => `--ref ${r}`).join(" ");
			console.log(pc.dim(`    backlog task edit ${result.taskId} ${refArgs}`));
		}
	}
}
