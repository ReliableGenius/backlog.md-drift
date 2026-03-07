import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { driftConfigExists, loadBacklogConfig, loadDriftConfig } from "../config.js";

const TMP_DIR = join(import.meta.dirname, "../../.test-tmp-config");

beforeEach(() => {
	mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("loadDriftConfig", () => {
	test("returns defaults when no config file exists", () => {
		const config = loadDriftConfig(TMP_DIR);
		expect(config.structural.enabled).toBe(true);
		expect(config.structural.check_dead_refs).toBe(true);
		expect(config.structural.stale_completion_days).toBe(14);
		expect(config.semantic.enabled).toBe(false);
		expect(config.semantic.provider).toBe("anthropic");
		expect(config.hook.mode).toBe("warn");
		expect(config.scope.statuses).toEqual(["To Do", "In Progress", "Review"]);
		expect(config.scope.check_completed).toBe(true);
		expect(config.scope.ignore_tasks).toEqual([]);
	});

	test("loads and validates YAML config", () => {
		writeFileSync(
			join(TMP_DIR, ".backlog-drift.yml"),
			`
structural:
  enabled: true
  stale_completion_days: 7
semantic:
  enabled: true
  provider: openai
  model: gpt-4o
hook:
  mode: block
scope:
  statuses:
    - In Progress
  ignore_tasks:
    - SKIP-1
`,
		);

		const config = loadDriftConfig(TMP_DIR);
		expect(config.structural.stale_completion_days).toBe(7);
		expect(config.semantic.enabled).toBe(true);
		expect(config.semantic.provider).toBe("openai");
		expect(config.semantic.model).toBe("gpt-4o");
		expect(config.hook.mode).toBe("block");
		expect(config.scope.statuses).toEqual(["In Progress"]);
		expect(config.scope.ignore_tasks).toEqual(["SKIP-1"]);
	});

	test("fills defaults for partial config", () => {
		writeFileSync(
			join(TMP_DIR, ".backlog-drift.yml"),
			`
structural:
  stale_completion_days: 30
`,
		);

		const config = loadDriftConfig(TMP_DIR);
		expect(config.structural.stale_completion_days).toBe(30);
		expect(config.structural.enabled).toBe(true);
		expect(config.semantic.enabled).toBe(false);
		expect(config.hook.mode).toBe("warn");
	});
});

describe("loadBacklogConfig", () => {
	test("returns defaults when no backlog config exists", () => {
		const config = loadBacklogConfig(TMP_DIR);
		expect(config.task_prefix).toBe("task");
		expect(config.statuses).toEqual(["To Do", "In Progress", "Done"]);
		expect(config.bypass_git_hooks).toBe(false);
	});

	test("reads backlog config.yml", () => {
		mkdirSync(join(TMP_DIR, "backlog"), { recursive: true });
		writeFileSync(
			join(TMP_DIR, "backlog/config.yml"),
			`
task_prefix: "drift"
statuses: ["To Do", "In Progress", "Review", "Done"]
bypass_git_hooks: true
`,
		);

		const config = loadBacklogConfig(TMP_DIR);
		expect(config.task_prefix).toBe("drift");
		expect(config.bypass_git_hooks).toBe(true);
	});
});

describe("driftConfigExists", () => {
	test("returns false when no config", () => {
		expect(driftConfigExists(TMP_DIR)).toBe(false);
	});

	test("returns true when config exists", () => {
		writeFileSync(join(TMP_DIR, ".backlog-drift.yml"), "structural:\n  enabled: true\n");
		expect(driftConfigExists(TMP_DIR)).toBe(true);
	});
});
