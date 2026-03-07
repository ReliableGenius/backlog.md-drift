import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { applyFix } from "../integrations/backlog-writer.js";
import type { BacklogTask, DriftFix } from "../types.js";

const TMP_DIR = join(import.meta.dirname, "../../.test-tmp-writer");

beforeEach(() => {
	mkdirSync(join(TMP_DIR, "backlog/tasks"), { recursive: true });
});

afterEach(() => {
	rmSync(TMP_DIR, { recursive: true, force: true });
});

function createTaskFile(filename: string, frontmatter: Record<string, unknown>, body = "\nTest body.\n"): string {
	const path = join(TMP_DIR, "backlog/tasks", filename);
	writeFileSync(path, matter.stringify(body, frontmatter));
	return path;
}

function makeTask(filePath: string, overrides: Partial<BacklogTask> = {}): BacklogTask {
	return {
		id: "T-1",
		title: "Test task",
		status: "To Do",
		filePath,
		refs: ["src/a.ts", "src/b.ts"],
		dependencies: [],
		labels: [],
		assignee: [],
		frontmatter: {},
		body: "",
		...overrides,
	};
}

describe("applyFix", () => {
	describe("remove-ref", () => {
		test("removes a ref from array via direct write", () => {
			const path = createTaskFile("t-1.md", {
				id: "T-1",
				title: "Test",
				status: "To Do",
				ref: ["src/a.ts", "src/b.ts"],
			});
			const task = makeTask(path);
			const fix: DriftFix = {
				taskId: "T-1",
				type: "remove-ref",
				description: "Remove src/a.ts",
				ref: "src/a.ts",
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(true);

			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.ref).toEqual(["src/b.ts"]);
		});

		test("removes last ref (deletes field)", () => {
			const path = createTaskFile("t-2.md", {
				id: "T-2",
				title: "Test",
				status: "To Do",
				ref: ["src/only.ts"],
			});
			const task = makeTask(path, { id: "T-2", refs: ["src/only.ts"] });
			const fix: DriftFix = {
				taskId: "T-2",
				type: "remove-ref",
				description: "Remove src/only.ts",
				ref: "src/only.ts",
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(true);

			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.ref).toBeUndefined();
		});

		test("removes single string ref", () => {
			const path = createTaskFile("t-3.md", {
				id: "T-3",
				title: "Test",
				status: "To Do",
				ref: "src/single.ts",
			});
			const task = makeTask(path, { id: "T-3", refs: ["src/single.ts"] });
			const fix: DriftFix = {
				taskId: "T-3",
				type: "remove-ref",
				description: "Remove src/single.ts",
				ref: "src/single.ts",
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(true);

			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.ref).toBeUndefined();
		});
	});

	describe("add-drift-status", () => {
		test("adds drift_status and drift_checked", () => {
			const path = createTaskFile("t-4.md", {
				id: "T-4",
				title: "Test",
				status: "To Do",
			});
			const task = makeTask(path, { id: "T-4" });
			const fix: DriftFix = {
				taskId: "T-4",
				type: "add-drift-status",
				description: "Flag task",
				value: "flagged",
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(true);

			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.drift_status).toBe("flagged");
			expect(updated.data.drift_checked).toBeDefined();
		});

		test("preserves existing frontmatter", () => {
			const path = createTaskFile("t-5.md", {
				id: "T-5",
				title: "Test",
				status: "In Progress",
				priority: "high",
				labels: ["feature"],
			});
			const task = makeTask(path, { id: "T-5" });
			const fix: DriftFix = {
				taskId: "T-5",
				type: "add-drift-status",
				description: "Flag task",
				value: "flagged",
				requiresConfirmation: false,
			};

			applyFix(fix, task);
			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.id).toBe("T-5");
			expect(updated.data.title).toBe("Test");
			expect(updated.data.status).toBe("In Progress");
			expect(updated.data.priority).toBe("high");
			expect(updated.data.labels).toEqual(["feature"]);
			expect(updated.data.drift_status).toBe("flagged");
		});
	});

	describe("add-drift-log", () => {
		test("adds new drift log entries", () => {
			const path = createTaskFile("t-6.md", {
				id: "T-6",
				title: "Test",
				status: "To Do",
			});
			const task = makeTask(path, { id: "T-6" });
			const entries = [
				{ date: "2026-03-07", type: "ref-deleted", detail: "src/old.ts deleted", resolution: "flagged" },
			];
			const fix: DriftFix = {
				taskId: "T-6",
				type: "add-drift-log",
				description: "Update drift log",
				value: JSON.stringify(entries),
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(true);

			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.drift_log).toHaveLength(1);
			expect(updated.data.drift_log[0].type).toBe("ref-deleted");
			expect(updated.data.drift_checked).toBeDefined();
		});

		test("appends to existing drift log", () => {
			const path = createTaskFile("t-7.md", {
				id: "T-7",
				title: "Test",
				status: "To Do",
				drift_log: [{ date: "2026-03-01", type: "ref-deleted", detail: "old entry", resolution: "flagged" }],
			});
			const task = makeTask(path, { id: "T-7" });
			const entries = [{ date: "2026-03-07", type: "ref-deleted", detail: "new entry", resolution: "flagged" }];
			const fix: DriftFix = {
				taskId: "T-7",
				type: "add-drift-log",
				description: "Update drift log",
				value: JSON.stringify(entries),
				requiresConfirmation: false,
			};

			applyFix(fix, task);
			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.drift_log).toHaveLength(2);
			expect(updated.data.drift_log[0].detail).toBe("old entry");
			expect(updated.data.drift_log[1].detail).toBe("new entry");
		});
	});

	describe("default case", () => {
		test("falls back to adding drift_status flagged", () => {
			const path = createTaskFile("t-8.md", {
				id: "T-8",
				title: "Test",
				status: "To Do",
			});
			const task = makeTask(path, { id: "T-8" });
			const fix: DriftFix = {
				taskId: "T-8",
				type: "update-description" as DriftFix["type"],
				description: "Unknown fix type",
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(true);

			const updated = matter(readFileSync(path, "utf-8"));
			expect(updated.data.drift_status).toBe("flagged");
		});
	});

	describe("error handling", () => {
		test("returns error for nonexistent file", () => {
			const task = makeTask("/nonexistent/path.md");
			const fix: DriftFix = {
				taskId: "T-1",
				type: "add-drift-status",
				description: "Flag",
				value: "flagged",
				requiresConfirmation: false,
			};

			const result = applyFix(fix, task);
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe("YAML round-trip", () => {
		test("produced YAML is valid and parseable by gray-matter", () => {
			const path = createTaskFile(
				"t-rt.md",
				{
					id: "T-RT",
					title: "Round trip test",
					status: "In Progress",
					ref: ["src/a.ts", "src/b.ts"],
					dependencies: ["T-0"],
					priority: "high",
					labels: ["feature", "core"],
				},
				"\nRound trip body content.\n",
			);
			const task = makeTask(path, { id: "T-RT", refs: ["src/a.ts", "src/b.ts"] });

			// Apply multiple fixes
			applyFix(
				{ taskId: "T-RT", type: "remove-ref", description: "rm", ref: "src/a.ts", requiresConfirmation: false },
				task,
			);
			applyFix(
				{
					taskId: "T-RT",
					type: "add-drift-status",
					description: "flag",
					value: "flagged",
					requiresConfirmation: false,
				},
				task,
			);
			applyFix(
				{
					taskId: "T-RT",
					type: "add-drift-log",
					description: "log",
					value: JSON.stringify([{ date: "2026-03-07", type: "ref-deleted", detail: "test", resolution: "flagged" }]),
					requiresConfirmation: false,
				},
				task,
			);

			// Verify round-trip
			const raw = readFileSync(path, "utf-8");
			const parsed = matter(raw);
			expect(parsed.data.id).toBe("T-RT");
			expect(parsed.data.ref).toEqual(["src/b.ts"]);
			expect(parsed.data.drift_status).toBe("flagged");
			expect(parsed.data.drift_log).toHaveLength(1);
			expect(parsed.content).toContain("Round trip body content");
		});
	});
});
