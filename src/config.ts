import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { BacklogConfig, DriftConfig } from "./types.js";

const DriftConfigSchema = z.object({
	structural: z
		.object({
			enabled: z.boolean().default(true),
			check_dead_refs: z.boolean().default(true),
			check_dependency_state: z.boolean().default(true),
			check_stale_completions: z.boolean().default(true),
			check_orphaned_tasks: z.boolean().default(true),
			stale_completion_days: z.number().default(14),
		})
		.default({}),
	semantic: z
		.object({
			enabled: z.boolean().default(false),
			provider: z.enum(["anthropic", "openai", "ollama"]).default("anthropic"),
			model: z.string().default("claude-sonnet-4-20250514"),
		})
		.default({}),
	hook: z
		.object({
			mode: z.enum(["warn", "block", "silent"]).default("warn"),
			structural_only: z.boolean().default(true),
			semantic_on_commit: z.boolean().default(false),
		})
		.default({}),
	scope: z
		.object({
			statuses: z.array(z.string()).default(["To Do", "In Progress", "Review"]),
			check_completed: z.boolean().default(true),
			check_archived: z.boolean().default(false),
			ignore_tasks: z.array(z.string()).default([]),
			ignore_refs: z.array(z.string()).default([]),
		})
		.default({}),
});

const CONFIG_FILENAME = ".backlog-drift.yml";
const BACKLOG_CONFIG_PATH = "backlog/config.yml";

export function loadDriftConfig(projectRoot: string): DriftConfig {
	const configPath = resolve(projectRoot, CONFIG_FILENAME);

	if (!existsSync(configPath)) {
		return DriftConfigSchema.parse({});
	}

	const raw = readFileSync(configPath, "utf-8");
	const parsed = parseYaml(raw) ?? {};
	return DriftConfigSchema.parse(parsed);
}

export function loadBacklogConfig(projectRoot: string): BacklogConfig {
	const configPath = resolve(projectRoot, BACKLOG_CONFIG_PATH);

	const defaults: BacklogConfig = {
		task_prefix: "task",
		statuses: ["To Do", "In Progress", "Done"],
		bypass_git_hooks: false,
	};

	if (!existsSync(configPath)) {
		return defaults;
	}

	const raw = readFileSync(configPath, "utf-8");
	const parsed = parseYaml(raw) ?? {};

	return {
		task_prefix: parsed.task_prefix ?? defaults.task_prefix,
		statuses: parsed.statuses ?? defaults.statuses,
		bypass_git_hooks: parsed.bypass_git_hooks ?? defaults.bypass_git_hooks,
	};
}

export function driftConfigExists(projectRoot: string): boolean {
	return existsSync(resolve(projectRoot, CONFIG_FILENAME));
}
