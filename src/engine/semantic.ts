import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GitIntegration } from "../integrations/git.js";
import type { LLMProvider } from "../integrations/llm/adapter.js";
import { createAnthropicProvider } from "../integrations/llm/anthropic.js";
import { createOllamaProvider } from "../integrations/llm/ollama.js";
import { createOpenAIProvider } from "../integrations/llm/openai.js";
import type { BacklogTask, DriftConfig, DriftResult } from "../types.js";
import { buildDriftAnalysisPrompt } from "./prompts.js";

export interface SemanticCheckContext {
	tasks: BacklogTask[];
	git: GitIntegration;
	config: DriftConfig;
	projectRoot: string;
	taskId?: string;
	since?: string;
}

interface AnalysisResult {
	description_drift: {
		detected: boolean;
		reasoning: string;
		suggested_update: string | null;
	};
	criteria_completed: Array<{
		criterion: string;
		reasoning: string;
		confidence: string;
	}>;
	criteria_invalidated: Array<{
		criterion: string;
		reasoning: string;
		suggested_replacement: string | null;
	}>;
	redundancy: {
		detected: boolean;
		reasoning: string;
	};
}

export async function runSemanticChecks(ctx: SemanticCheckContext): Promise<DriftResult[]> {
	if (!ctx.config.semantic.enabled) return [];

	let provider: LLMProvider;
	try {
		provider = createProvider(ctx.config.semantic.provider);
	} catch (e) {
		console.error(`Semantic checks unavailable: ${e}`);
		return [];
	}

	let tasks = ctx.tasks.filter(
		(t) => t.status !== "Done" && !t.filePath.includes("/archive/") && ctx.config.scope.statuses.includes(t.status),
	);

	if (ctx.taskId) {
		tasks = tasks.filter((t) => t.id.toLowerCase() === ctx.taskId?.toLowerCase());
	}

	const results: DriftResult[] = [];

	for (const task of tasks) {
		if (ctx.config.scope.ignore_tasks.includes(task.id)) continue;
		if (task.refs.length === 0) continue;

		try {
			const taskResults = await analyzeTask(task, ctx, provider);
			results.push(...taskResults);
		} catch (e) {
			console.error(`Semantic check failed for ${task.id}: ${e}`);
		}
	}

	return results;
}

async function analyzeTask(
	task: BacklogTask,
	ctx: SemanticCheckContext,
	provider: LLMProvider,
): Promise<DriftResult[]> {
	const fileContents: Record<string, string> = {};
	const deletedRefs: string[] = [];
	const diffs: Record<string, string> = {};

	for (const ref of task.refs) {
		if (ctx.git.fileExists(ref)) {
			try {
				fileContents[ref] = readFileSync(resolve(ctx.projectRoot, ref), "utf-8");
			} catch {
				// Skip unreadable files
			}
			if (ctx.since) {
				const diff = await ctx.git.getFileDiff(ref, ctx.since);
				if (diff) diffs[ref] = diff;
			}
		} else {
			deletedRefs.push(ref);
		}
	}

	if (Object.keys(fileContents).length === 0 && deletedRefs.length === 0) {
		return [];
	}

	const prompt = buildDriftAnalysisPrompt(task, fileContents, deletedRefs, diffs);

	const response = await provider.chat([{ role: "user", content: prompt }], ctx.config.semantic.model);

	return parseAnalysis(task, response.content);
}

function parseAnalysis(task: BacklogTask, responseText: string): DriftResult[] {
	let analysis: AnalysisResult;
	try {
		analysis = JSON.parse(responseText);
	} catch {
		// Try to extract JSON from the response
		const match = responseText.match(/\{[\s\S]*\}/);
		if (!match) return [];
		try {
			analysis = JSON.parse(match[0]);
		} catch {
			return [];
		}
	}

	const results: DriftResult[] = [];

	if (analysis.description_drift?.detected) {
		results.push({
			taskId: task.id,
			taskTitle: task.title,
			type: "description-drift",
			severity: "warning",
			message: "Task description may no longer match the code",
			detail: analysis.description_drift.suggested_update ?? undefined,
			reasoning: analysis.description_drift.reasoning,
		});
	}

	for (const item of analysis.criteria_completed ?? []) {
		if (item.confidence === "high" || item.confidence === "medium") {
			results.push({
				taskId: task.id,
				taskTitle: task.title,
				type: "criteria-completed",
				severity: "info",
				message: `Acceptance criterion may already be satisfied: ${item.criterion}`,
				reasoning: item.reasoning,
			});
		}
	}

	for (const item of analysis.criteria_invalidated ?? []) {
		results.push({
			taskId: task.id,
			taskTitle: task.title,
			type: "criteria-invalidated",
			severity: "warning",
			message: `Acceptance criterion may be invalid: ${item.criterion}`,
			detail: item.suggested_replacement ?? undefined,
			reasoning: item.reasoning,
		});
	}

	if (analysis.redundancy?.detected) {
		results.push({
			taskId: task.id,
			taskTitle: task.title,
			type: "redundancy-detected",
			severity: "warning",
			message: "Task may be redundant",
			reasoning: analysis.redundancy.reasoning,
		});
	}

	return results;
}

function createProvider(name: string): LLMProvider {
	switch (name) {
		case "anthropic":
			return createAnthropicProvider();
		case "openai":
			return createOpenAIProvider();
		case "ollama":
			return createOllamaProvider();
		default:
			throw new Error(`Unknown LLM provider: ${name}`);
	}
}
