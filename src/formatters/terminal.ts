import pc from "picocolors";
import type { DriftResult, DriftSeverity } from "../types.js";

const SEVERITY_ICON: Record<DriftSeverity, string> = {
	error: pc.red("✗"),
	warning: pc.yellow("⚠"),
	info: pc.blue("ℹ"),
};

const SEVERITY_COLOR: Record<DriftSeverity, (s: string) => string> = {
	error: pc.red,
	warning: pc.yellow,
	info: pc.blue,
};

export function formatResults(results: DriftResult[]): string {
	if (results.length === 0) {
		return pc.green("✓ No drift detected");
	}

	const grouped = groupByTask(results);
	const lines: string[] = [];

	lines.push(pc.bold(`${results.length} drift issue${results.length === 1 ? "" : "s"} found:\n`));

	for (const [taskId, taskResults] of Object.entries(grouped)) {
		const first = taskResults[0];
		const statusBadge = first.taskTitle ? ` "${first.taskTitle}"` : "";
		lines.push(`  ${pc.bold(taskId)}${statusBadge}`);

		for (const result of taskResults) {
			const icon = SEVERITY_ICON[result.severity];
			const color = SEVERITY_COLOR[result.severity];
			lines.push(`    ${icon} ${color(result.message)}`);
			if (result.detail) {
				lines.push(`      ${pc.dim(result.detail)}`);
			}
		}

		lines.push("");
	}

	return lines.join("\n");
}

export function formatSummary(results: DriftResult[]): string {
	const errors = results.filter((r) => r.severity === "error").length;
	const warnings = results.filter((r) => r.severity === "warning").length;
	const infos = results.filter((r) => r.severity === "info").length;

	const parts: string[] = [];
	if (errors > 0) parts.push(pc.red(`${errors} error${errors === 1 ? "" : "s"}`));
	if (warnings > 0) parts.push(pc.yellow(`${warnings} warning${warnings === 1 ? "" : "s"}`));
	if (infos > 0) parts.push(pc.blue(`${infos} info`));

	return parts.length > 0 ? parts.join(", ") : pc.green("clean");
}

export function formatHookOutput(results: DriftResult[]): string {
	if (results.length === 0) return "";

	const grouped = groupByTask(results);
	const taskCount = Object.keys(grouped).length;
	const lines: string[] = [];

	lines.push(
		`\n${pc.yellow(`⚠ backlog-drift: ${taskCount} task${taskCount === 1 ? "" : "s"} affected by this commit`)}\n`,
	);

	for (const [taskId, taskResults] of Object.entries(grouped)) {
		const first = taskResults[0];
		lines.push(`  ${pc.bold(taskId)} "${first.taskTitle}"`);

		for (const result of taskResults) {
			const icon = SEVERITY_ICON[result.severity];
			const color = SEVERITY_COLOR[result.severity];
			lines.push(`    ${icon} ${color(result.message)}`);
		}

		lines.push("");
	}

	lines.push(pc.dim("  Run `backlog-drift check` for details or `backlog-drift fix` to auto-fix.\n"));

	return lines.join("\n");
}

function groupByTask(results: DriftResult[]): Record<string, DriftResult[]> {
	const grouped: Record<string, DriftResult[]> = {};
	for (const result of results) {
		if (!grouped[result.taskId]) grouped[result.taskId] = [];
		grouped[result.taskId].push(result);
	}
	return grouped;
}
