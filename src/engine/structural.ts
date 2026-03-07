import type { GitIntegration } from "../integrations/git.js";
import type { BacklogTask, DriftConfig, DriftResult } from "../types.js";

export interface StructuralCheckContext {
	tasks: BacklogTask[];
	git: GitIntegration;
	config: DriftConfig;
	projectRoot: string;
	/** If set, only check changes since this ref */
	since?: string;
	/** If set, only check this task */
	taskId?: string;
}

export async function runStructuralChecks(ctx: StructuralCheckContext): Promise<DriftResult[]> {
	let tasks = ctx.tasks;

	if (ctx.taskId) {
		tasks = tasks.filter((t) => t.id.toLowerCase() === ctx.taskId?.toLowerCase());
	}

	const results: DriftResult[] = [];

	for (const task of tasks) {
		if (shouldSkipTask(task, ctx.config)) continue;

		if (ctx.config.structural.check_dead_refs) {
			results.push(...checkDeadRefs(task, ctx));
		}

		if (ctx.config.structural.check_dependency_state) {
			results.push(...checkDependencyState(task, ctx));
		}

		if (ctx.config.structural.check_stale_completions) {
			results.push(...checkStaleCompletion(task, ctx));
		}

		if (ctx.config.structural.check_orphaned_tasks) {
			results.push(...checkOrphanedTask(task, ctx));
		}
	}

	return results;
}

function shouldSkipTask(task: BacklogTask, config: DriftConfig): boolean {
	if (config.scope.ignore_tasks.includes(task.id)) return true;

	const isCompleted = task.status === "Done";
	const isArchived = task.filePath.includes("/archive/");

	if (isArchived && !config.scope.check_archived) return true;
	if (isCompleted && !config.scope.check_completed) return true;
	if (!isCompleted && !isArchived && !config.scope.statuses.includes(task.status)) return true;

	return false;
}

function isRefIgnored(ref: string, config: DriftConfig): boolean {
	return config.scope.ignore_refs.some((pattern) => {
		if (pattern.includes("*")) {
			const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
			return regex.test(ref);
		}
		return ref === pattern;
	});
}

function checkDeadRefs(task: BacklogTask, ctx: StructuralCheckContext): DriftResult[] {
	const results: DriftResult[] = [];

	for (const ref of task.refs) {
		if (isRefIgnored(ref, ctx.config)) continue;
		if (!ctx.git.fileExists(ref)) {
			results.push({
				taskId: task.id,
				taskTitle: task.title,
				type: "ref-deleted",
				severity: "error",
				message: `Referenced file no longer exists: ${ref}`,
				ref,
			});
		}
	}

	return results;
}

function checkDependencyState(task: BacklogTask, ctx: StructuralCheckContext): DriftResult[] {
	const results: DriftResult[] = [];
	const isActive = task.status !== "Done" && !task.filePath.includes("/archive/");
	if (!isActive) return results;

	for (const depId of task.dependencies) {
		const depTask = ctx.tasks.find((t) => t.id.toLowerCase() === depId.toLowerCase());
		if (!depTask) continue;

		const depDone = depTask.status === "Done";
		const depArchived = depTask.filePath.includes("/archive/");

		if (depDone || depArchived) {
			results.push({
				taskId: task.id,
				taskTitle: task.title,
				type: "dep-resolved",
				severity: "info",
				message: `Dependency ${depId} has been ${depArchived ? "archived" : "completed"}`,
				dependencyId: depId,
			});
		}
	}

	return results;
}

function checkStaleCompletion(task: BacklogTask, ctx: StructuralCheckContext): DriftResult[] {
	const results: DriftResult[] = [];

	if (task.status !== "Done") return results;
	if (!task.updatedDate) return results;

	const updatedDate = new Date(task.updatedDate);
	const staleDays = ctx.config.structural.stale_completion_days;
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - staleDays);

	// Only flag if the task was updated within the stale window
	if (updatedDate < cutoff) return results;

	for (const ref of task.refs) {
		if (isRefIgnored(ref, ctx.config)) continue;
		if (!ctx.git.fileExists(ref)) continue;

		const modDate = ctx.git.getFileModDate(ref);
		if (modDate && modDate > updatedDate) {
			results.push({
				taskId: task.id,
				taskTitle: task.title,
				type: "post-complete-change",
				severity: "warning",
				message: `Referenced file ${ref} was modified after task was completed`,
				ref,
			});
		}
	}

	return results;
}

function checkOrphanedTask(task: BacklogTask, ctx: StructuralCheckContext): DriftResult[] {
	const isActive = task.status !== "Done" && !task.filePath.includes("/archive/");
	if (!isActive) return [];
	if (task.refs.length === 0) return [];

	const allRefsDeleted = task.refs.every((ref) => {
		if (isRefIgnored(ref, ctx.config)) return false;
		return !ctx.git.fileExists(ref);
	});

	if (allRefsDeleted) {
		return [
			{
				taskId: task.id,
				taskTitle: task.title,
				type: "refs-orphaned",
				severity: "error",
				message: "All referenced files have been deleted",
			},
		];
	}

	return [];
}
