import { describe, expect, test } from "bun:test";
import { formatHookOutput, formatResults, formatSummary } from "../formatters/terminal.js";
import type { DriftResult } from "../types.js";

describe("formatResults", () => {
	test("returns clean message for empty results", () => {
		const output = formatResults([]);
		expect(output).toContain("No drift detected");
	});

	test("formats single result", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test task",
				type: "ref-deleted",
				severity: "error",
				message: "Referenced file no longer exists: src/old.ts",
			},
		];
		const output = formatResults(results);
		expect(output).toContain("1 drift issue found");
		expect(output).toContain("T-1");
		expect(output).toContain("Test task");
		expect(output).toContain("src/old.ts");
	});

	test("formats multiple results plural", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "ref-deleted",
				severity: "error",
				message: "Ref a deleted",
			},
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "ref-deleted",
				severity: "error",
				message: "Ref b deleted",
			},
		];
		const output = formatResults(results);
		expect(output).toContain("2 drift issues found");
	});

	test("groups results by task", () => {
		const results: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "Task 1", type: "ref-deleted", severity: "error", message: "msg1" },
			{ taskId: "T-2", taskTitle: "Task 2", type: "ref-deleted", severity: "error", message: "msg2" },
			{ taskId: "T-1", taskTitle: "Task 1", type: "refs-orphaned", severity: "error", message: "msg3" },
		];
		const output = formatResults(results);
		// Both task IDs appear
		expect(output).toContain("T-1");
		expect(output).toContain("T-2");
	});

	test("includes detail when present", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "description-drift",
				severity: "warning",
				message: "Description drift",
				detail: "Suggested update here",
			},
		];
		const output = formatResults(results);
		expect(output).toContain("Suggested update here");
	});
});

describe("formatSummary", () => {
	test("returns clean for empty results", () => {
		const output = formatSummary([]);
		expect(output).toContain("clean");
	});

	test("formats errors only", () => {
		const results: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "T", type: "ref-deleted", severity: "error", message: "m" },
		];
		const output = formatSummary(results);
		expect(output).toContain("1 error");
	});

	test("formats mixed severities", () => {
		const results: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "T", type: "ref-deleted", severity: "error", message: "m" },
			{ taskId: "T-1", taskTitle: "T", type: "ref-deleted", severity: "error", message: "m" },
			{ taskId: "T-1", taskTitle: "T", type: "post-complete-change", severity: "warning", message: "m" },
			{ taskId: "T-1", taskTitle: "T", type: "dep-resolved", severity: "info", message: "m" },
		];
		const output = formatSummary(results);
		expect(output).toContain("2 errors");
		expect(output).toContain("1 warning");
		expect(output).toContain("1 info");
	});

	test("pluralizes correctly", () => {
		const one: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "T", type: "post-complete-change", severity: "warning", message: "m" },
		];
		expect(formatSummary(one)).toContain("1 warning");
		expect(formatSummary(one)).not.toContain("warnings");
	});
});

describe("formatHookOutput", () => {
	test("returns empty string for no results", () => {
		expect(formatHookOutput([])).toBe("");
	});

	test("shows task count singular", () => {
		const results: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "Single task", type: "ref-deleted", severity: "error", message: "deleted" },
		];
		const output = formatHookOutput(results);
		expect(output).toContain("1 task affected");
		expect(output).not.toContain("tasks affected");
	});

	test("shows task count plural", () => {
		const results: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "Task 1", type: "ref-deleted", severity: "error", message: "deleted" },
			{ taskId: "T-2", taskTitle: "Task 2", type: "ref-deleted", severity: "error", message: "deleted" },
		];
		const output = formatHookOutput(results);
		expect(output).toContain("2 tasks affected");
	});

	test("includes fix suggestion", () => {
		const results: DriftResult[] = [
			{ taskId: "T-1", taskTitle: "Test", type: "ref-deleted", severity: "error", message: "deleted" },
		];
		const output = formatHookOutput(results);
		expect(output).toContain("backlog-drift check");
		expect(output).toContain("backlog-drift fix");
	});
});
