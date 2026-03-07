import pc from "picocolors";
import { driftConfigExists, loadBacklogConfig, loadDriftConfig } from "../config.js";

export async function runConfig(): Promise<void> {
	const projectRoot = process.cwd();

	if (!driftConfigExists(projectRoot)) {
		console.log(pc.yellow("⚠ No .backlog-drift.yml found. Run `backlog-drift init` first."));
		process.exit(1);
	}

	const config = loadDriftConfig(projectRoot);
	const backlogConfig = loadBacklogConfig(projectRoot);

	console.log(pc.bold("Drift Configuration:\n"));
	console.log(pc.dim("  Source: .backlog-drift.yml\n"));

	console.log("  Structural checks:");
	console.log(`    Enabled:              ${fmt(config.structural.enabled)}`);
	console.log(`    Dead refs:            ${fmt(config.structural.check_dead_refs)}`);
	console.log(`    Dependency state:     ${fmt(config.structural.check_dependency_state)}`);
	console.log(`    Stale completions:    ${fmt(config.structural.check_stale_completions)}`);
	console.log(`    Orphaned tasks:       ${fmt(config.structural.check_orphaned_tasks)}`);
	console.log(`    Stale window:         ${config.structural.stale_completion_days} days`);

	console.log("\n  Semantic checks:");
	console.log(`    Enabled:              ${fmt(config.semantic.enabled)}`);
	console.log(`    Provider:             ${config.semantic.provider}`);
	console.log(`    Model:                ${config.semantic.model}`);

	console.log("\n  Hook:");
	console.log(`    Mode:                 ${config.hook.mode}`);
	console.log(`    Structural only:      ${fmt(config.hook.structural_only)}`);

	console.log("\n  Scope:");
	console.log(`    Statuses:             ${config.scope.statuses.join(", ")}`);
	console.log(`    Check completed:      ${fmt(config.scope.check_completed)}`);
	console.log(`    Check archived:       ${fmt(config.scope.check_archived)}`);
	console.log(
		`    Ignored tasks:        ${config.scope.ignore_tasks.length > 0 ? config.scope.ignore_tasks.join(", ") : pc.dim("none")}`,
	);
	console.log(
		`    Ignored refs:         ${config.scope.ignore_refs.length > 0 ? config.scope.ignore_refs.join(", ") : pc.dim("none")}`,
	);

	console.log(pc.dim("\n  Backlog.md interop:"));
	console.log(`    Task prefix:          ${backlogConfig.task_prefix}`);
	console.log(`    Bypass git hooks:     ${fmt(backlogConfig.bypass_git_hooks)}`);
}

function fmt(val: boolean): string {
	return val ? pc.green("yes") : pc.red("no");
}
