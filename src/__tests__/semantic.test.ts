import { describe, expect, test } from "bun:test";
import { buildDriftAnalysisPrompt } from "../engine/prompts.js";
import type { BacklogTask } from "../types.js";

function makeTask(overrides: Partial<BacklogTask> = {}): BacklogTask {
	return {
		id: "T-1",
		title: "Test task",
		status: "In Progress",
		filePath: "/tasks/t-1.md",
		refs: ["src/foo.ts"],
		dependencies: [],
		labels: [],
		assignee: [],
		frontmatter: {},
		body: "## Description\nImplement foo feature.\n\n## Acceptance Criteria\n- [ ] Foo works\n",
		...overrides,
	};
}

describe("buildDriftAnalysisPrompt", () => {
	test("includes task info", () => {
		const prompt = buildDriftAnalysisPrompt(makeTask(), {}, [], {});
		expect(prompt).toContain("T-1");
		expect(prompt).toContain("Test task");
		expect(prompt).toContain("Implement foo feature");
	});

	test("includes file contents", () => {
		const prompt = buildDriftAnalysisPrompt(
			makeTask(),
			{ "src/foo.ts": 'export function foo() { return "bar"; }' },
			[],
			{},
		);
		expect(prompt).toContain("src/foo.ts");
		expect(prompt).toContain("export function foo");
	});

	test("includes deleted refs", () => {
		const prompt = buildDriftAnalysisPrompt(makeTask(), {}, ["src/old.ts"], {});
		expect(prompt).toContain("Deleted Referenced Files");
		expect(prompt).toContain("src/old.ts");
	});

	test("includes diffs", () => {
		const prompt = buildDriftAnalysisPrompt(makeTask(), { "src/foo.ts": "new code" }, [], {
			"src/foo.ts": "+new code\n-old code",
		});
		expect(prompt).toContain("Recent Changes");
		expect(prompt).toContain("+new code");
	});

	test("truncates long file contents", () => {
		const longContent = "x".repeat(5000);
		const prompt = buildDriftAnalysisPrompt(makeTask(), { "src/foo.ts": longContent }, [], {});
		expect(prompt).toContain("truncated");
		expect(prompt.length).toBeLessThan(longContent.length + 2000);
	});

	test("requests JSON response format", () => {
		const prompt = buildDriftAnalysisPrompt(makeTask(), {}, [], {});
		expect(prompt).toContain("description_drift");
		expect(prompt).toContain("criteria_completed");
		expect(prompt).toContain("criteria_invalidated");
		expect(prompt).toContain("redundancy");
	});
});
