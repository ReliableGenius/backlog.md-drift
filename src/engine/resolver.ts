import type { DriftFix, DriftResult } from "../types.js";

export function generateFixes(results: DriftResult[]): DriftFix[] {
	const fixes: DriftFix[] = [];

	for (const result of results) {
		switch (result.type) {
			case "ref-deleted":
				if (result.ref) {
					fixes.push({
						taskId: result.taskId,
						type: "remove-ref",
						description: `Remove deleted reference: ${result.ref}`,
						ref: result.ref,
						requiresConfirmation: false,
					});
				}
				break;

			case "refs-orphaned":
				fixes.push({
					taskId: result.taskId,
					type: "add-drift-status",
					description: "Flag task as having all references deleted",
					value: "flagged",
					requiresConfirmation: false,
				});
				break;

			case "post-complete-change":
				fixes.push({
					taskId: result.taskId,
					type: "add-drift-status",
					description: `Flag completed task: ${result.ref} modified after completion`,
					value: "flagged",
					requiresConfirmation: false,
				});
				break;

			case "dep-resolved":
				fixes.push({
					taskId: result.taskId,
					type: "add-drift-status",
					description: `Note: dependency ${result.dependencyId} has been resolved`,
					value: "flagged",
					requiresConfirmation: false,
				});
				break;

			// Semantic drift types always require confirmation
			case "description-drift":
			case "criteria-completed":
			case "criteria-invalidated":
			case "redundancy-detected":
				if (result.detail) {
					fixes.push({
						taskId: result.taskId,
						type: result.type === "description-drift" ? "update-description" : "update-criteria",
						description: result.message,
						value: result.detail,
						requiresConfirmation: true,
					});
				}
				break;
		}
	}

	// Add drift log entries for all fixes
	const taskIds = [...new Set(fixes.map((f) => f.taskId))];
	for (const taskId of taskIds) {
		const taskResults = results.filter((r) => r.taskId === taskId);
		fixes.push({
			taskId,
			type: "add-drift-log",
			description: "Update drift log",
			value: JSON.stringify(
				taskResults.map((r) => ({
					date: new Date().toISOString().split("T")[0],
					type: r.type,
					detail: r.message,
					resolution: "flagged",
				})),
			),
			requiresConfirmation: false,
		});
	}

	return fixes;
}
