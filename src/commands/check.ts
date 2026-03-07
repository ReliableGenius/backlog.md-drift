import { loadDriftConfig } from "../config.js";
import { runStructuralChecks } from "../engine/structural.js";
import { formatResults } from "../formatters/terminal.js";
import { loadAllTasks } from "../integrations/backlog-reader.js";
import { createGitIntegration } from "../integrations/git.js";

interface CheckOptions {
	task?: string;
	since?: string;
	semantic?: boolean;
	json?: boolean;
}

export async function runCheck(opts: CheckOptions): Promise<void> {
	const projectRoot = process.cwd();
	const config = loadDriftConfig(projectRoot);
	const tasks = loadAllTasks(projectRoot);
	const git = createGitIntegration(projectRoot);

	if (tasks.length === 0) {
		console.log("No backlog tasks found. Is this a Backlog.md project?");
		process.exit(0);
	}

	const results = await runStructuralChecks({
		tasks,
		git,
		config,
		projectRoot,
		taskId: opts.task,
		since: opts.since,
	});

	if (opts.semantic && config.semantic.enabled) {
		const { runSemanticChecks } = await import("../engine/semantic.js");
		const semanticResults = await runSemanticChecks({
			tasks,
			git,
			config,
			projectRoot,
			taskId: opts.task,
			since: opts.since,
		});
		results.push(...semanticResults);
	}

	if (opts.json) {
		console.log(JSON.stringify(results, null, 2));
	} else {
		console.log(formatResults(results));
	}

	process.exit(results.some((r) => r.severity === "error" || r.severity === "warning") ? 1 : 0);
}
