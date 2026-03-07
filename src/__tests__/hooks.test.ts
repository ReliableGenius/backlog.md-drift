import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hookStatus, installHook, removeHook } from "../hooks/installer.js";

const TMP_DIR = join(import.meta.dirname, "../../.test-tmp-hooks");

beforeEach(() => {
	mkdirSync(join(TMP_DIR, ".git/hooks"), { recursive: true });
});

afterEach(() => {
	rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("installHook", () => {
	test("installs to .git/hooks when no husky", () => {
		const result = installHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(result.method).toBe("git-hook");

		const content = readFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "utf-8");
		expect(content).toContain("backlog-drift");
	});

	test("installs to husky when .husky dir exists", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		const result = installHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(result.method).toBe("husky");

		const content = readFileSync(join(TMP_DIR, ".husky/pre-commit"), "utf-8");
		expect(content).toContain("backlog-drift");
	});

	test("is idempotent", () => {
		installHook(TMP_DIR);
		installHook(TMP_DIR);

		const content = readFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "utf-8");
		const matches = content.match(/backlog-drift pre-commit hook >>>/g);
		expect(matches).toHaveLength(1);
	});

	test("appends to existing hook without breaking it", () => {
		writeFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "#!/bin/sh\necho 'existing hook'\n");
		installHook(TMP_DIR);

		const content = readFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "utf-8");
		expect(content).toContain("existing hook");
		expect(content).toContain("backlog-drift");
	});
});

describe("removeHook", () => {
	test("removes hook cleanly", () => {
		installHook(TMP_DIR);
		const result = removeHook(TMP_DIR);
		expect(result.success).toBe(true);

		const content = readFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "utf-8");
		expect(content).not.toContain("backlog-drift pre-commit hook >>>");
	});

	test("preserves other hook content", () => {
		writeFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "#!/bin/sh\necho 'keep me'\n");
		installHook(TMP_DIR);
		removeHook(TMP_DIR);

		const content = readFileSync(join(TMP_DIR, ".git/hooks/pre-commit"), "utf-8");
		expect(content).toContain("keep me");
		expect(content).not.toContain("backlog-drift");
	});

	test("handles no hook gracefully", () => {
		const result = removeHook(TMP_DIR);
		expect(result.success).toBe(true);
	});
});

describe("hookStatus", () => {
	test("reports not installed when no hook", () => {
		const status = hookStatus(TMP_DIR);
		expect(status.installed).toBe(false);
		expect(status.method).toBe("none");
	});

	test("reports installed with git-hook method", () => {
		installHook(TMP_DIR);
		const status = hookStatus(TMP_DIR);
		expect(status.installed).toBe(true);
		expect(status.method).toBe("git-hook");
	});

	test("reports installed with husky method", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		installHook(TMP_DIR);
		const status = hookStatus(TMP_DIR);
		expect(status.installed).toBe(true);
		expect(status.method).toBe("husky");
	});
});

describe("installHook edge cases", () => {
	test("fails gracefully without .git directory", () => {
		const noGitDir = join(TMP_DIR, "no-git-project");
		mkdirSync(noGitDir, { recursive: true });
		const result = installHook(noGitDir);
		expect(result.success).toBe(false);
		expect(result.message).toContain("git");
	});

	test("creates .git/hooks dir if missing", () => {
		// Remove the hooks dir but keep .git
		rmSync(join(TMP_DIR, ".git/hooks"), { recursive: true });
		const result = installHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(existsSync(join(TMP_DIR, ".git/hooks/pre-commit"))).toBe(true);
	});

	test("husky install creates new file when pre-commit doesn't exist", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		// No pre-commit file exists yet
		const result = installHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(result.method).toBe("husky");

		const content = readFileSync(join(TMP_DIR, ".husky/pre-commit"), "utf-8");
		expect(content).toContain("#!/usr/bin/env sh");
		expect(content).toContain("husky.sh");
		expect(content).toContain("backlog-drift");
	});

	test("husky install appends to existing pre-commit", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		writeFileSync(join(TMP_DIR, ".husky/pre-commit"), "#!/usr/bin/env sh\nnpx lint-staged\n");

		const result = installHook(TMP_DIR);
		expect(result.success).toBe(true);

		const content = readFileSync(join(TMP_DIR, ".husky/pre-commit"), "utf-8");
		expect(content).toContain("lint-staged");
		expect(content).toContain("backlog-drift");
	});

	test("husky install is idempotent", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		installHook(TMP_DIR);
		const result = installHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(result.message).toContain("already installed");

		const content = readFileSync(join(TMP_DIR, ".husky/pre-commit"), "utf-8");
		const matches = content.match(/backlog-drift pre-commit hook >>>/g);
		expect(matches).toHaveLength(1);
	});
});

describe("removeHook edge cases", () => {
	test("removes from husky pre-commit", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		installHook(TMP_DIR);
		const result = removeHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(result.method).toBe("husky");

		const content = readFileSync(join(TMP_DIR, ".husky/pre-commit"), "utf-8");
		expect(content).not.toContain("backlog-drift");
	});

	test("reports no hook to remove from husky file without marker", () => {
		mkdirSync(join(TMP_DIR, ".husky"), { recursive: true });
		writeFileSync(join(TMP_DIR, ".husky/pre-commit"), "#!/usr/bin/env sh\nnpx lint-staged\n");

		const result = removeHook(TMP_DIR);
		expect(result.success).toBe(true);
		expect(result.message).toContain("No backlog-drift hook");
	});
});
