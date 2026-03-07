import pc from "picocolors";
import { loadDriftConfig } from "../config.js";
import { runStructuralChecks } from "../engine/structural.js";
import { formatResults, formatSummary } from "../formatters/terminal.js";
import { loadAllTasks } from "../integrations/backlog-reader.js";
import { createGitIntegration } from "../integrations/git.js";

interface ReportOptions {
	json?: boolean;
}

export async function runReport(opts: ReportOptions): Promise<void> {
	const projectRoot = process.cwd();
	const config = loadDriftConfig(projectRoot);
	const tasks = loadAllTasks(projectRoot);
	const git = createGitIntegration(projectRoot);

	if (tasks.length === 0) {
		if (opts.json) {
			console.log(JSON.stringify({ tasks: 0, results: [] }));
		} else {
			console.log("No backlog tasks found.");
		}
		process.exit(0);
	}

	const results = await runStructuralChecks({
		tasks,
		git,
		config,
		projectRoot,
	});

	if (opts.json) {
		console.log(
			JSON.stringify(
				{
					timestamp: new Date().toISOString(),
					tasks_checked: tasks.length,
					issues_found: results.length,
					summary: {
						errors: results.filter((r) => r.severity === "error").length,
						warnings: results.filter((r) => r.severity === "warning").length,
						info: results.filter((r) => r.severity === "info").length,
					},
					results,
				},
				null,
				2,
			),
		);
	} else {
		console.log(pc.bold("Drift Health Report\n"));
		console.log(`  Tasks checked: ${tasks.length}`);
		console.log(`  Status: ${formatSummary(results)}\n`);
		console.log(formatResults(results));
	}

	process.exit(results.some((r) => r.severity === "error" || r.severity === "warning") ? 1 : 0);
}
