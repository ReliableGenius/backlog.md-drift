import type { BacklogTask } from "../types.js";

export function buildDriftAnalysisPrompt(
	task: BacklogTask,
	fileContents: Record<string, string>,
	deletedRefs: string[],
	diffs: Record<string, string>,
): string {
	const parts: string[] = [];

	parts.push(`You are analyzing whether a project task is still accurate given the current state of the code.

Respond with a JSON object (no markdown fencing) with this structure:
{
  "description_drift": {
    "detected": boolean,
    "reasoning": "string",
    "suggested_update": "string or null"
  },
  "criteria_completed": [
    { "criterion": "string", "reasoning": "string", "confidence": "high|medium|low" }
  ],
  "criteria_invalidated": [
    { "criterion": "string", "reasoning": "string", "suggested_replacement": "string or null" }
  ],
  "redundancy": {
    "detected": boolean,
    "reasoning": "string"
  }
}`);

	parts.push(`\n## Task\nID: ${task.id}\nTitle: ${task.title}\nStatus: ${task.status}\n\n${task.body}`);

	if (Object.keys(fileContents).length > 0) {
		parts.push("\n## Referenced Files (Current State)");
		for (const [path, content] of Object.entries(fileContents)) {
			parts.push(`\n### ${path}\n\`\`\`\n${truncate(content, 4000)}\n\`\`\``);
		}
	}

	if (Object.keys(diffs).length > 0) {
		parts.push("\n## Recent Changes to Referenced Files");
		for (const [path, diff] of Object.entries(diffs)) {
			parts.push(`\n### ${path}\n\`\`\`diff\n${truncate(diff, 2000)}\n\`\`\``);
		}
	}

	if (deletedRefs.length > 0) {
		parts.push(`\n## Deleted Referenced Files\n${deletedRefs.map((r) => `- ${r}`).join("\n")}`);
	}

	return parts.join("\n");
}

function truncate(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text;
	return `${text.slice(0, maxLen)}\n... (truncated)`;
}
