import { describe, expect, test } from "bun:test";
import { runStructuralChecks } from "../engine/structural.js";
import type { GitIntegration } from "../integrations/git.js";
import type { BacklogTask, DriftConfig } from "../types.js";

function makeConfig(overrides: Partial<DriftConfig> = {}): DriftConfig {
	return {
		structural: {
			enabled: true,
			check_dead_refs: true,
			check_dependency_state: true,
			check_stale_completions: true,
			check_orphaned_tasks: true,
			stale_completion_days: 14,
			...overrides.structural,
		},
		semantic: { enabled: false, provider: "anthropic", model: "test", ...overrides.semantic },
		hook: { mode: "warn", structural_only: true, semantic_on_commit: false, ...overrides.hook },
		scope: {
			statuses: ["To Do", "In Progress", "Review"],
			check_completed: true,
			check_archived: false,
			ignore_tasks: [],
			ignore_refs: [],
			...overrides.scope,
		},
	};
}

function makeTask(overrides: Partial<BacklogTask> = {}): BacklogTask {
	return {
		id: "T-1",
		title: "Test task",
		status: "To Do",
		filePath: "/tasks/t-1.md",
		refs: [],
		dependencies: [],
		labels: [],
		assignee: [],
		frontmatter: {},
		body: "",
		...overrides,
	};
}

function makeMockGit(opts: { existingFiles?: string[]; fileDates?: Record<string, Date> } = {}): GitIntegration {
	const existingFiles = new Set(opts.existingFiles ?? []);
	return {
		async getChangedFiles() {
			return [];
		},
		getFileModDate(filePath: string) {
			return opts.fileDates?.[filePath] ?? null;
		},
		async getStagedFiles() {
			return [];
		},
		fileExists(filePath: string) {
			return existingFiles.has(filePath);
		},
		async getFileDiff() {
			return "";
		},
		async getFilesFromCommitsMentioning() {
			return [];
		},
	};
}

describe("structural checks", () => {
	describe("dead refs", () => {
		test("detects deleted ref files", async () => {
			const task = makeTask({ refs: ["src/foo.ts", "src/bar.ts"] });
			const git = makeMockGit({ existingFiles: ["src/foo.ts"] });

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe("ref-deleted");
			expect(results[0].ref).toBe("src/bar.ts");
			expect(results[0].severity).toBe("error");
		});

		test("no results when all refs exist", async () => {
			const task = makeTask({ refs: ["src/foo.ts"] });
			const git = makeMockGit({ existingFiles: ["src/foo.ts"] });

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});

		test("respects ignore_refs", async () => {
			const task = makeTask({ refs: ["src/foo.test.ts"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					scope: {
						statuses: ["To Do"],
						check_completed: true,
						check_archived: false,
						ignore_tasks: [],
						ignore_refs: ["*.test.ts"],
					},
				}),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});
	});

	describe("dependency state", () => {
		test("detects resolved dependencies", async () => {
			const parent = makeTask({ id: "T-1", dependencies: ["T-2"], status: "In Progress" });
			const dep = makeTask({ id: "T-2", status: "Done" });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [parent, dep],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe("dep-resolved");
			expect(results[0].dependencyId).toBe("T-2");
		});

		test("ignores dep checks on completed tasks", async () => {
			const parent = makeTask({ id: "T-1", dependencies: ["T-2"], status: "Done" });
			const dep = makeTask({ id: "T-2", status: "Done" });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [parent, dep],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			// No dep-resolved for a Done task (it only flags active tasks)
			const depResults = results.filter((r) => r.type === "dep-resolved");
			expect(depResults).toHaveLength(0);
		});
	});

	describe("stale completion", () => {
		test("detects post-complete changes", async () => {
			const updatedDate = new Date("2026-03-01");
			const modDate = new Date("2026-03-05");

			const task = makeTask({
				status: "Done",
				refs: ["src/foo.ts"],
				updatedDate: "2026-03-01",
			});

			const git = makeMockGit({
				existingFiles: ["src/foo.ts"],
				fileDates: { "src/foo.ts": modDate },
			});

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(1);
			expect(results[0].type).toBe("post-complete-change");
		});

		test("ignores old completions outside stale window", async () => {
			const task = makeTask({
				status: "Done",
				refs: ["src/foo.ts"],
				updatedDate: "2025-01-01",
			});

			const git = makeMockGit({
				existingFiles: ["src/foo.ts"],
				fileDates: { "src/foo.ts": new Date("2025-06-01") },
			});

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});
	});

	describe("orphaned tasks", () => {
		test("detects tasks with all refs deleted", async () => {
			const task = makeTask({ refs: ["src/a.ts", "src/b.ts"] });
			const git = makeMockGit({ existingFiles: [] });

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(3);
			// 2 ref-deleted + 1 refs-orphaned
			expect(results.filter((r) => r.type === "ref-deleted")).toHaveLength(2);
			expect(results.filter((r) => r.type === "refs-orphaned")).toHaveLength(1);
		});

		test("no orphan if task has no refs", async () => {
			const task = makeTask({ refs: [] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});
	});

	describe("scoping", () => {
		test("filters by task ID", async () => {
			const t1 = makeTask({ id: "T-1", refs: ["deleted.ts"] });
			const t2 = makeTask({ id: "T-2", refs: ["deleted.ts"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [t1, t2],
				git,
				config: makeConfig(),
				projectRoot: "/",
				taskId: "T-1",
			});

			expect(results.every((r) => r.taskId === "T-1")).toBe(true);
		});

		test("skips ignored tasks", async () => {
			const task = makeTask({ id: "SKIP-1", refs: ["deleted.ts"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					scope: {
						statuses: ["To Do"],
						check_completed: true,
						check_archived: false,
						ignore_tasks: ["SKIP-1"],
						ignore_refs: [],
					},
				}),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});

		test("skips tasks not in scope statuses", async () => {
			const task = makeTask({ status: "Blocked", refs: ["deleted.ts"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});

		test("skips archived tasks when check_archived is false", async () => {
			const task = makeTask({
				refs: ["deleted.ts"],
				filePath: "/backlog/archive/tasks/t-1.md",
			});
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					scope: {
						statuses: ["To Do"],
						check_completed: true,
						check_archived: false,
						ignore_tasks: [],
						ignore_refs: [],
					},
				}),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});

		test("includes archived tasks when check_archived is true", async () => {
			const task = makeTask({
				refs: ["deleted.ts"],
				filePath: "/backlog/archive/tasks/t-1.md",
			});
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					scope: {
						statuses: ["To Do"],
						check_completed: true,
						check_archived: true,
						ignore_tasks: [],
						ignore_refs: [],
					},
				}),
				projectRoot: "/",
			});

			expect(results.some((r) => r.type === "ref-deleted")).toBe(true);
		});

		test("ignore_refs with exact match", async () => {
			const task = makeTask({ refs: ["config.json"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					scope: {
						statuses: ["To Do"],
						check_completed: true,
						check_archived: false,
						ignore_tasks: [],
						ignore_refs: ["config.json"],
					},
				}),
				projectRoot: "/",
			});

			expect(results).toHaveLength(0);
		});
	});

	describe("dependency state edge cases", () => {
		test("detects archived dependency", async () => {
			const parent = makeTask({ id: "T-1", dependencies: ["T-2"], status: "In Progress" });
			const dep = makeTask({ id: "T-2", status: "To Do", filePath: "/backlog/archive/tasks/t-2.md" });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [parent, dep],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			const depResult = results.find((r) => r.type === "dep-resolved");
			expect(depResult).toBeDefined();
			expect(depResult?.message).toContain("archived");
		});

		test("ignores non-existent dependency gracefully", async () => {
			const parent = makeTask({ id: "T-1", dependencies: ["T-NONEXISTENT"], status: "In Progress" });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [parent],
				git,
				config: makeConfig(),
				projectRoot: "/",
			});

			const depResults = results.filter((r) => r.type === "dep-resolved");
			expect(depResults).toHaveLength(0);
		});
	});

	describe("disabled checks", () => {
		test("skips dead refs when disabled", async () => {
			const task = makeTask({ refs: ["deleted.ts"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					structural: {
						enabled: true,
						check_dead_refs: false,
						check_dependency_state: true,
						check_stale_completions: true,
						check_orphaned_tasks: true,
						stale_completion_days: 14,
					},
				}),
				projectRoot: "/",
			});

			expect(results.filter((r) => r.type === "ref-deleted")).toHaveLength(0);
		});

		test("skips orphaned check when disabled", async () => {
			const task = makeTask({ refs: ["a.ts", "b.ts"] });
			const git = makeMockGit();

			const results = await runStructuralChecks({
				tasks: [task],
				git,
				config: makeConfig({
					structural: {
						enabled: true,
						check_dead_refs: true,
						check_dependency_state: true,
						check_stale_completions: true,
						check_orphaned_tasks: false,
						stale_completion_days: 14,
					},
				}),
				projectRoot: "/",
			});

			expect(results.filter((r) => r.type === "refs-orphaned")).toHaveLength(0);
			// Still gets ref-deleted
			expect(results.filter((r) => r.type === "ref-deleted")).toHaveLength(2);
		});
	});
});
