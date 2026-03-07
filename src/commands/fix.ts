import pc from "picocolors";
import { loadDriftConfig } from "../config.js";
import { generateFixes } from "../engine/resolver.js";
import { runStructuralChecks } from "../engine/structural.js";
import { loadAllTasks } from "../integrations/backlog-reader.js";
import { applyFix } from "../integrations/backlog-writer.js";
import { createGitIntegration } from "../integrations/git.js";

interface FixOptions {
	task?: string;
	dryRun?: boolean;
	semantic?: boolean;
	yes?: boolean;
}

export async function runFix(opts: FixOptions): Promise<void> {
	const projectRoot = process.cwd();
	const config = loadDriftConfig(projectRoot);
	const tasks = loadAllTasks(projectRoot);
	const git = createGitIntegration(projectRoot);

	const results = await runStructuralChecks({
		tasks,
		git,
		config,
		projectRoot,
		taskId: opts.task,
	});

	if (opts.semantic && config.semantic.enabled) {
		const { runSemanticChecks } = await import("../engine/semantic.js");
		const semanticResults = await runSemanticChecks({
			tasks,
			git,
			config,
			projectRoot,
			taskId: opts.task,
		});
		results.push(...semanticResults);
	}

	if (results.length === 0) {
		console.log(pc.green("✓ No drift detected. Nothing to fix."));
		process.exit(0);
	}

	const fixes = generateFixes(results);
	const autoFixes = fixes.filter((f) => !f.requiresConfirmation);
	const manualFixes = fixes.filter((f) => f.requiresConfirmation);

	if (opts.dryRun) {
		console.log(pc.bold("Dry run — proposed changes:\n"));
		for (const fix of autoFixes) {
			console.log(`  ${pc.green("→")} [${fix.taskId}] ${fix.description}`);
		}
		if (manualFixes.length > 0) {
			console.log(pc.yellow("\n  Requires confirmation:"));
			for (const fix of manualFixes) {
				console.log(`  ${pc.yellow("?")} [${fix.taskId}] ${fix.description}`);
			}
		}
		return;
	}

	// Apply auto-fixes
	let applied = 0;
	let failed = 0;

	for (const fix of autoFixes) {
		const task = tasks.find((t) => t.id === fix.taskId);
		if (!task) continue;

		const result = applyFix(fix, task);
		if (result.success) {
			console.log(`  ${pc.green("✓")} [${fix.taskId}] ${fix.description} ${pc.dim(`(${result.method})`)}`);
			applied++;
		} else {
			console.log(`  ${pc.red("✗")} [${fix.taskId}] ${fix.description}: ${result.error}`);
			failed++;
		}
	}

	if (manualFixes.length > 0 && !opts.yes) {
		console.log(
			pc.yellow(`\n  ${manualFixes.length} fix(es) require confirmation. Use --yes to apply, or run interactively.`),
		);
	} else if (manualFixes.length > 0 && opts.yes) {
		for (const fix of manualFixes) {
			const task = tasks.find((t) => t.id === fix.taskId);
			if (!task) continue;

			const result = applyFix(fix, task);
			if (result.success) {
				console.log(`  ${pc.green("✓")} [${fix.taskId}] ${fix.description}`);
				applied++;
			} else {
				console.log(`  ${pc.red("✗")} [${fix.taskId}] ${fix.description}: ${result.error}`);
				failed++;
			}
		}
	}

	console.log(`\n${pc.bold("Summary:")} ${applied} applied, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}
