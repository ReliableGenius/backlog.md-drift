import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { GitIntegration } from "../integrations/git.js";
import type { BacklogTask } from "../types.js";

export interface ScanResult {
	taskId: string;
	taskTitle: string;
	existingRefs: string[];
	discoveredRefs: string[];
	sources: Record<string, RefSource[]>;
}

export type RefSource = "description" | "git-history";

/**
 * Scan tasks to discover file references that should be tracked.
 * Uses two strategies:
 * 1. Parse task description/body for file path patterns
 * 2. Search git log for commits mentioning the task ID
 */
export async function scanForRefs(
	tasks: BacklogTask[],
	git: GitIntegration,
	projectRoot: string,
): Promise<ScanResult[]> {
	const results: ScanResult[] = [];

	for (const task of tasks) {
		const discovered = new Map<string, RefSource[]>();

		// Strategy 1: Parse description for file paths
		const pathsFromBody = extractFilePaths(task.body, projectRoot);
		for (const path of pathsFromBody) {
			if (!task.refs.includes(path)) {
				addSource(discovered, path, "description");
			}
		}

		// Strategy 2: Git log for commits mentioning task ID
		const pathsFromGit = await findRefsFromGitHistory(task.id, git);
		for (const path of pathsFromGit) {
			if (!task.refs.includes(path)) {
				addSource(discovered, path, "git-history");
			}
		}

		if (discovered.size > 0) {
			results.push({
				taskId: task.id,
				taskTitle: task.title,
				existingRefs: task.refs,
				discoveredRefs: [...discovered.keys()],
				sources: Object.fromEntries(discovered),
			});
		}
	}

	return results;
}

/** Extract file paths from markdown text that exist on disk */
function extractFilePaths(text: string, projectRoot: string): string[] {
	const paths = new Set<string>();

	// Match common file path patterns:
	// - src/foo/bar.ts, lib/index.js, etc.
	// - backtick-wrapped paths: `src/foo.ts`
	// - paths in code blocks
	const pathRegex =
		/(?:^|\s|`|"|')(((?:src|lib|bin|dist|config|test|tests|spec|app|packages|modules)\/[\w./-]+\.\w+)|([\w-]+\.(?:tsx|jsx|ts|json|js|yml|yaml|md|css|html)))/gm;

	for (const match of text.matchAll(pathRegex)) {
		const candidate = match[1].replace(/[`"']+$/, "");
		if (existsSync(resolve(projectRoot, candidate))) {
			paths.add(candidate);
		}
	}

	return [...paths];
}

/** Search git log for commits mentioning a task ID and return touched files */
async function findRefsFromGitHistory(taskId: string, git: GitIntegration): Promise<string[]> {
	try {
		return await git.getFilesFromCommitsMentioning(taskId);
	} catch {
		return [];
	}
}

function addSource(map: Map<string, RefSource[]>, path: string, source: RefSource): void {
	const existing = map.get(path) ?? [];
	if (!existing.includes(source)) {
		existing.push(source);
	}
	map.set(path, existing);
}
