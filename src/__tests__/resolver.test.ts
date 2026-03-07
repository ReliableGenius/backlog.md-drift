import { describe, expect, test } from "bun:test";
import { generateFixes } from "../engine/resolver.js";
import type { DriftResult } from "../types.js";

describe("generateFixes", () => {
	test("generates remove-ref fix for ref-deleted", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "ref-deleted",
				severity: "error",
				message: "Referenced file no longer exists: src/old.ts",
				ref: "src/old.ts",
			},
		];

		const fixes = generateFixes(results);
		const removeRefFix = fixes.find((f) => f.type === "remove-ref");
		expect(removeRefFix).toBeDefined();
		expect(removeRefFix?.ref).toBe("src/old.ts");
		expect(removeRefFix?.requiresConfirmation).toBe(false);
	});

	test("generates drift-status fix for orphaned tasks", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "refs-orphaned",
				severity: "error",
				message: "All referenced files have been deleted",
			},
		];

		const fixes = generateFixes(results);
		const statusFix = fixes.find((f) => f.type === "add-drift-status");
		expect(statusFix).toBeDefined();
		expect(statusFix?.value).toBe("flagged");
	});

	test("generates drift log entries", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "ref-deleted",
				severity: "error",
				message: "Referenced file no longer exists: src/old.ts",
				ref: "src/old.ts",
			},
		];

		const fixes = generateFixes(results);
		const logFix = fixes.find((f) => f.type === "add-drift-log");
		expect(logFix).toBeDefined();
		expect(logFix?.requiresConfirmation).toBe(false);

		const entries = JSON.parse(logFix?.value ?? "[]");
		expect(entries).toHaveLength(1);
		expect(entries[0].type).toBe("ref-deleted");
	});

	test("semantic fixes require confirmation", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "description-drift",
				severity: "warning",
				message: "Description may be outdated",
				detail: "Updated description",
				reasoning: "The code has changed",
			},
		];

		const fixes = generateFixes(results);
		const descFix = fixes.find((f) => f.type === "update-description");
		expect(descFix).toBeDefined();
		expect(descFix?.requiresConfirmation).toBe(true);
	});

	test("generates fix for post-complete-change", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "post-complete-change",
				severity: "warning",
				message: "Referenced file src/foo.ts was modified after task was completed",
				ref: "src/foo.ts",
			},
		];

		const fixes = generateFixes(results);
		const statusFix = fixes.find((f) => f.type === "add-drift-status");
		expect(statusFix).toBeDefined();
		expect(statusFix?.value).toBe("flagged");
		expect(statusFix?.description).toContain("src/foo.ts");
	});

	test("generates fix for dep-resolved", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "dep-resolved",
				severity: "info",
				message: "Dependency T-2 has been completed",
				dependencyId: "T-2",
			},
		];

		const fixes = generateFixes(results);
		const statusFix = fixes.find((f) => f.type === "add-drift-status");
		expect(statusFix).toBeDefined();
		expect(statusFix?.description).toContain("T-2");
	});

	test("generates update-criteria fix for criteria-completed", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "criteria-completed",
				severity: "info",
				message: "Criterion may be satisfied",
				detail: "Check off this criterion",
				reasoning: "Already implemented",
			},
		];

		const fixes = generateFixes(results);
		const criteriaFix = fixes.find((f) => f.type === "update-criteria");
		expect(criteriaFix).toBeDefined();
		expect(criteriaFix?.requiresConfirmation).toBe(true);
	});

	test("generates update-criteria fix for criteria-invalidated", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "criteria-invalidated",
				severity: "warning",
				message: "Criterion is invalid",
				detail: "Replace with new criterion",
				reasoning: "Approach changed",
			},
		];

		const fixes = generateFixes(results);
		const criteriaFix = fixes.find((f) => f.type === "update-criteria");
		expect(criteriaFix).toBeDefined();
		expect(criteriaFix?.requiresConfirmation).toBe(true);
	});

	test("skips semantic fix when no detail provided", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "redundancy-detected",
				severity: "warning",
				message: "Task may be redundant",
				reasoning: "Similar to another task",
			},
		];

		const fixes = generateFixes(results);
		// Should still generate a drift log, but no update fix (no detail)
		const updateFix = fixes.find((f) => f.type === "update-description" || f.type === "update-criteria");
		expect(updateFix).toBeUndefined();
	});

	test("deduplicates drift log entries by task", () => {
		const results: DriftResult[] = [
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "ref-deleted",
				severity: "error",
				message: "Ref a deleted",
				ref: "a.ts",
			},
			{
				taskId: "T-1",
				taskTitle: "Test",
				type: "ref-deleted",
				severity: "error",
				message: "Ref b deleted",
				ref: "b.ts",
			},
		];

		const fixes = generateFixes(results);
		const logFixes = fixes.filter((f) => f.type === "add-drift-log");
		// Only one drift-log entry per task
		expect(logFixes).toHaveLength(1);
		const entries = JSON.parse(logFixes[0].value ?? "[]");
		expect(entries).toHaveLength(2);
	});
});
