import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanForRefs } from "../engine/scanner.js";
import type { GitIntegration } from "../integrations/git.js";
import type { BacklogTask } from "../types.js";

const TMP_DIR = join(import.meta.dirname, "../../.test-tmp-scanner");

beforeEach(() => {
	mkdirSync(join(TMP_DIR, "src/engine"), { recursive: true });
	mkdirSync(join(TMP_DIR, "src/integrations"), { recursive: true });
});

afterEach(() => {
	rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeTask(overrides: Partial<BacklogTask> = {}): BacklogTask {
	return {
		id: "T-1",
		title: "Test task",
		status: "To Do",
		filePath: join(TMP_DIR, "backlog/tasks/t-1.md"),
		refs: [],
		dependencies: [],
		labels: [],
		assignee: [],
		frontmatter: {},
		body: "",
		...overrides,
	};
}

function makeMockGit(commitFiles: string[] = []): GitIntegration {
	return {
		async getChangedFiles() {
			return [];
		},
		getFileModDate() {
			return null;
		},
		async getStagedFiles() {
			return [];
		},
		fileExists() {
			return false;
		},
		async getFileDiff() {
			return "";
		},
		async getFilesFromCommitsMentioning() {
			return commitFiles;
		},
	};
}

describe("scanForRefs", () => {
	test("discovers file paths mentioned in task body", async () => {
		writeFileSync(join(TMP_DIR, "src/index.ts"), "// entry");
		writeFileSync(join(TMP_DIR, "src/engine/structural.ts"), "// engine");

		const task = makeTask({
			body: `## Description
Implement the structural engine in \`src/engine/structural.ts\` and wire it
to the CLI entry point at src/index.ts.
`,
		});

		const results = await scanForRefs([task], makeMockGit(), TMP_DIR);

		expect(results).toHaveLength(1);
		expect(results[0].discoveredRefs).toContain("src/index.ts");
		expect(results[0].discoveredRefs).toContain("src/engine/structural.ts");
		expect(results[0].sources["src/index.ts"]).toContain("description");
	});

	test("does not discover paths that don't exist on disk", async () => {
		const task = makeTask({
			body: "See src/nonexistent.ts for details.",
		});

		const results = await scanForRefs([task], makeMockGit(), TMP_DIR);
		expect(results).toHaveLength(0);
	});

	test("does not rediscover existing refs", async () => {
		writeFileSync(join(TMP_DIR, "src/index.ts"), "// entry");

		const task = makeTask({
			refs: ["src/index.ts"],
			body: "The entry point is src/index.ts.",
		});

		const results = await scanForRefs([task], makeMockGit(), TMP_DIR);
		expect(results).toHaveLength(0);
	});

	test("discovers refs from git history", async () => {
		const task = makeTask({ body: "Some task" });
		const git = makeMockGit(["src/new-feature.ts", "src/utils.ts"]);

		const results = await scanForRefs([task], git, TMP_DIR);

		expect(results).toHaveLength(1);
		expect(results[0].discoveredRefs).toContain("src/new-feature.ts");
		expect(results[0].sources["src/new-feature.ts"]).toContain("git-history");
	});

	test("combines description and git sources", async () => {
		writeFileSync(join(TMP_DIR, "src/index.ts"), "// entry");

		const task = makeTask({
			body: "Entry at src/index.ts",
		});
		const git = makeMockGit(["src/index.ts", "src/other.ts"]);

		const results = await scanForRefs([task], git, TMP_DIR);

		expect(results).toHaveLength(1);
		expect(results[0].discoveredRefs).toContain("src/index.ts");
		expect(results[0].discoveredRefs).toContain("src/other.ts");
		expect(results[0].sources["src/index.ts"]).toContain("description");
		expect(results[0].sources["src/index.ts"]).toContain("git-history");
	});

	test("returns empty for tasks with no discoverable refs", async () => {
		const task = makeTask({ body: "A vague description with no file paths." });
		const results = await scanForRefs([task], makeMockGit(), TMP_DIR);
		expect(results).toHaveLength(0);
	});

	test("handles standalone filenames like package.json", async () => {
		writeFileSync(join(TMP_DIR, "package.json"), "{}");

		const task = makeTask({
			body: "Update the package.json with new deps.",
		});

		const results = await scanForRefs([task], makeMockGit(), TMP_DIR);
		expect(results).toHaveLength(1);
		expect(results[0].discoveredRefs).toContain("package.json");
	});

	test("scans multiple tasks", async () => {
		writeFileSync(join(TMP_DIR, "src/index.ts"), "// a");

		const t1 = makeTask({ id: "T-1", body: "Uses src/index.ts" });
		const t2 = makeTask({ id: "T-2", body: "No file paths here" });

		const results = await scanForRefs([t1, t2], makeMockGit(), TMP_DIR);
		expect(results).toHaveLength(1);
		expect(results[0].taskId).toBe("T-1");
	});
});
