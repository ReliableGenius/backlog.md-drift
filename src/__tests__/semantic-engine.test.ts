import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runSemanticChecks } from "../engine/semantic.js";
import type { GitIntegration } from "../integrations/git.js";
import type { BacklogTask, DriftConfig } from "../types.js";

const TMP_DIR = join(import.meta.dirname, "../../.test-tmp-semantic");
const originalFetch = globalThis.fetch;

beforeEach(() => {
	mkdirSync(join(TMP_DIR, "src"), { recursive: true });
});

afterEach(() => {
	rmSync(TMP_DIR, { recursive: true, force: true });
	globalThis.fetch = originalFetch;
	process.env.BACKLOG_DRIFT_API_KEY = undefined;
});

function makeConfig(overrides: Partial<DriftConfig["semantic"]> = {}): DriftConfig {
	return {
		structural: {
			enabled: true,
			check_dead_refs: true,
			check_dependency_state: true,
			check_stale_completions: true,
			check_orphaned_tasks: true,
			stale_completion_days: 14,
		},
		semantic: { enabled: true, provider: "anthropic", model: "test-model", ...overrides },
		hook: { mode: "warn", structural_only: true, semantic_on_commit: false },
		scope: {
			statuses: ["To Do", "In Progress"],
			check_completed: true,
			check_archived: false,
			ignore_tasks: [],
			ignore_refs: [],
		},
	};
}

function makeTask(overrides: Partial<BacklogTask> = {}): BacklogTask {
	return {
		id: "T-1",
		title: "Test task",
		status: "In Progress",
		filePath: join(TMP_DIR, "backlog/tasks/t-1.md"),
		refs: ["src/foo.ts"],
		dependencies: [],
		labels: [],
		assignee: [],
		frontmatter: {},
		body: "## Description\nImplement foo.\n\n## Acceptance Criteria\n- [ ] Foo works\n",
		...overrides,
	};
}

function makeMockGit(existingFiles: string[] = []): GitIntegration {
	const files = new Set(existingFiles);
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
		fileExists(f: string) {
			return files.has(f);
		},
		async getFileDiff() {
			return "";
		},
		async getFilesFromCommitsMentioning() {
			return [];
		},
	};
}

describe("runSemanticChecks", () => {
	test("returns empty when semantic disabled", async () => {
		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig({ enabled: false }),
			projectRoot: TMP_DIR,
		});
		expect(results).toEqual([]);
	});

	test("returns empty when API key missing (graceful degradation)", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = undefined;
		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});
		expect(results).toEqual([]);
	});

	test("skips tasks with no refs", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		// Mock fetch should not be called
		let fetchCalled = false;
		globalThis.fetch = (async () => {
			fetchCalled = true;
			return { ok: true, json: async () => ({}) };
		}) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask({ refs: [] })],
			git: makeMockGit(),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toEqual([]);
		expect(fetchCalled).toBe(false);
	});

	test("skips Done tasks", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		let fetchCalled = false;
		globalThis.fetch = (async () => {
			fetchCalled = true;
			return { ok: true, json: async () => ({}) };
		}) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask({ status: "Done" })],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toEqual([]);
		expect(fetchCalled).toBe(false);
	});

	test("skips ignored tasks", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		let fetchCalled = false;
		globalThis.fetch = (async () => {
			fetchCalled = true;
			return { ok: true, json: async () => ({}) };
		}) as unknown as typeof fetch;

		const config = makeConfig();
		config.scope.ignore_tasks = ["T-1"];

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config,
			projectRoot: TMP_DIR,
		});

		expect(results).toEqual([]);
		expect(fetchCalled).toBe(false);
	});

	test("parses description drift from LLM response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "export function foo() { return 42; }");

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							description_drift: {
								detected: true,
								reasoning: "The code now returns 42 instead of a string",
								suggested_update: "Update description to reflect numeric return",
							},
							criteria_completed: [],
							criteria_invalidated: [],
							redundancy: { detected: false, reasoning: "" },
						}),
					},
				],
				usage: { input_tokens: 100, output_tokens: 50 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toHaveLength(1);
		expect(results[0].type).toBe("description-drift");
		expect(results[0].reasoning).toContain("42");
	});

	test("parses criteria-completed from LLM response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "export function foo() {}");

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							description_drift: { detected: false, reasoning: "", suggested_update: null },
							criteria_completed: [
								{ criterion: "Foo works", reasoning: "foo() is implemented", confidence: "high" },
								{ criterion: "Low conf", reasoning: "maybe", confidence: "low" },
							],
							criteria_invalidated: [],
							redundancy: { detected: false, reasoning: "" },
						}),
					},
				],
				usage: { input_tokens: 100, output_tokens: 50 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		// Only high/medium confidence are included
		expect(results).toHaveLength(1);
		expect(results[0].type).toBe("criteria-completed");
		expect(results[0].message).toContain("Foo works");
	});

	test("parses criteria-invalidated from LLM response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "// empty");

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							description_drift: { detected: false, reasoning: "", suggested_update: null },
							criteria_completed: [],
							criteria_invalidated: [
								{
									criterion: "Use library X",
									reasoning: "Switched to library Y",
									suggested_replacement: "Use library Y",
								},
							],
							redundancy: { detected: false, reasoning: "" },
						}),
					},
				],
				usage: { input_tokens: 10, output_tokens: 10 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toHaveLength(1);
		expect(results[0].type).toBe("criteria-invalidated");
		expect(results[0].detail).toBe("Use library Y");
	});

	test("parses redundancy from LLM response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "// code");

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							description_drift: { detected: false, reasoning: "", suggested_update: null },
							criteria_completed: [],
							criteria_invalidated: [],
							redundancy: { detected: true, reasoning: "Task T-2 already covers this" },
						}),
					},
				],
				usage: { input_tokens: 10, output_tokens: 10 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toHaveLength(1);
		expect(results[0].type).toBe("redundancy-detected");
	});

	test("handles malformed LLM response gracefully", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "code");

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [{ type: "text", text: "This is not JSON at all" }],
				usage: { input_tokens: 10, output_tokens: 10 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toEqual([]);
	});

	test("handles JSON embedded in markdown response", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "code");

		const jsonResult = JSON.stringify({
			description_drift: { detected: true, reasoning: "changed", suggested_update: "new desc" },
			criteria_completed: [],
			criteria_invalidated: [],
			redundancy: { detected: false, reasoning: "" },
		});

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [{ type: "text", text: `Here is the analysis:\n\`\`\`json\n${jsonResult}\n\`\`\`` }],
				usage: { input_tokens: 10, output_tokens: 10 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toHaveLength(1);
		expect(results[0].type).toBe("description-drift");
	});

	test("filters by taskId", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		writeFileSync(join(TMP_DIR, "src/foo.ts"), "code");

		let fetchCallCount = 0;
		globalThis.fetch = (async () => {
			fetchCallCount++;
			return {
				ok: true,
				json: async () => ({
					content: [
						{
							type: "text",
							text: JSON.stringify({
								description_drift: { detected: false, reasoning: "", suggested_update: null },
								criteria_completed: [],
								criteria_invalidated: [],
								redundancy: { detected: false, reasoning: "" },
							}),
						},
					],
					usage: { input_tokens: 10, output_tokens: 10 },
				}),
			};
		}) as unknown as typeof fetch;

		await runSemanticChecks({
			tasks: [makeTask({ id: "T-1" }), makeTask({ id: "T-2" })],
			git: makeMockGit(["src/foo.ts"]),
			config: makeConfig(),
			projectRoot: TMP_DIR,
			taskId: "T-1",
		});

		expect(fetchCallCount).toBe(1);
	});

	test("handles all refs deleted (only deletedRefs, no file contents)", async () => {
		process.env.BACKLOG_DRIFT_API_KEY = "test-key";
		// Don't create the file - it's "deleted"

		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				content: [
					{
						type: "text",
						text: JSON.stringify({
							description_drift: { detected: true, reasoning: "file gone", suggested_update: null },
							criteria_completed: [],
							criteria_invalidated: [],
							redundancy: { detected: false, reasoning: "" },
						}),
					},
				],
				usage: { input_tokens: 10, output_tokens: 10 },
			}),
		})) as unknown as typeof fetch;

		const results = await runSemanticChecks({
			tasks: [makeTask()],
			git: makeMockGit([]), // file doesn't exist
			config: makeConfig(),
			projectRoot: TMP_DIR,
		});

		expect(results).toHaveLength(1);
		expect(results[0].type).toBe("description-drift");
	});
});
