import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import type { BacklogTask, DriftLogEntry } from "../types.js";

const TASK_DIRS = ["backlog/tasks", "backlog/completed", "backlog/archive/tasks"];

export function discoverTaskFiles(projectRoot: string): string[] {
	const files: string[] = [];

	for (const dir of TASK_DIRS) {
		const fullDir = resolve(projectRoot, dir);
		if (!existsSync(fullDir)) continue;

		const entries = readdirSync(fullDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith(".md")) {
				files.push(join(fullDir, entry.name));
			}
		}
	}

	return files;
}

export function parseTaskFile(filePath: string): BacklogTask | null {
	if (!existsSync(filePath)) return null;

	const raw = readFileSync(filePath, "utf-8");
	const { data, content } = matter(raw);

	if (!data.id || !data.title) return null;

	const refs = extractRefs(data);
	const dependencies = extractDependencies(data);

	return {
		id: String(data.id),
		title: String(data.title),
		status: String(data.status ?? "To Do"),
		filePath,
		refs,
		dependencies,
		createdDate: data.created_date ? String(data.created_date) : undefined,
		updatedDate: data.updated_date ? String(data.updated_date) : undefined,
		priority: data.priority ? String(data.priority) : undefined,
		labels: toStringArray(data.labels),
		assignee: toStringArray(data.assignee),
		driftStatus: data.drift_status as BacklogTask["driftStatus"],
		driftChecked: data.drift_checked ? String(data.drift_checked) : undefined,
		driftLog: parseDriftLog(data.drift_log),
		frontmatter: data,
		body: content,
	};
}

export function loadAllTasks(projectRoot: string): BacklogTask[] {
	const files = discoverTaskFiles(projectRoot);
	const tasks: BacklogTask[] = [];

	for (const file of files) {
		const task = parseTaskFile(file);
		if (task) tasks.push(task);
	}

	return tasks;
}

function extractRefs(data: Record<string, unknown>): string[] {
	// Refs can be stored as `ref` (single or array) or `references`
	const raw = data.ref ?? data.refs ?? data.references ?? [];
	return toStringArray(raw);
}

function extractDependencies(data: Record<string, unknown>): string[] {
	const raw = data.dependencies ?? [];
	return toStringArray(raw);
}

function toStringArray(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter((v) => v != null).map(String);
	if (typeof value === "string") return [value];
	return [];
}

function parseDriftLog(raw: unknown): DriftLogEntry[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	return raw
		.filter((entry) => entry && typeof entry === "object" && entry.date && entry.type)
		.map((entry) => ({
			date: String(entry.date),
			type: entry.type,
			detail: String(entry.detail ?? ""),
			resolution: String(entry.resolution ?? ""),
		}));
}
