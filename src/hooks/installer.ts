import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HOOK_MARKER_START = "# >>> backlog-drift pre-commit hook >>>";
const HOOK_MARKER_END = "# <<< backlog-drift pre-commit hook <<<";
const HOOK_SCRIPT = `${HOOK_MARKER_START}
npx backlog-drift hook-run 2>&1
${HOOK_MARKER_END}`;

interface InstallResult {
	success: boolean;
	method: "husky" | "git-hook";
	message: string;
}

export function installHook(projectRoot: string): InstallResult {
	// Try Husky first
	const huskyDir = resolve(projectRoot, ".husky");
	if (existsSync(huskyDir)) {
		return installHusky(huskyDir);
	}

	// Fall back to .git/hooks
	const gitHooksDir = resolve(projectRoot, ".git/hooks");
	if (existsSync(resolve(projectRoot, ".git"))) {
		return installGitHook(gitHooksDir);
	}

	return { success: false, method: "git-hook", message: "No .git directory found. Is this a git repository?" };
}

export function removeHook(projectRoot: string): InstallResult {
	const huskyPath = resolve(projectRoot, ".husky/pre-commit");
	const gitHookPath = resolve(projectRoot, ".git/hooks/pre-commit");

	if (existsSync(huskyPath)) {
		return removeFromFile(huskyPath, "husky");
	}

	if (existsSync(gitHookPath)) {
		return removeFromFile(gitHookPath, "git-hook");
	}

	return { success: true, method: "git-hook", message: "No hook found to remove." };
}

export function hookStatus(projectRoot: string): {
	installed: boolean;
	method: "husky" | "git-hook" | "none";
	path: string;
} {
	const huskyPath = resolve(projectRoot, ".husky/pre-commit");
	if (existsSync(huskyPath) && readFileSync(huskyPath, "utf-8").includes(HOOK_MARKER_START)) {
		return { installed: true, method: "husky", path: huskyPath };
	}

	const gitHookPath = resolve(projectRoot, ".git/hooks/pre-commit");
	if (existsSync(gitHookPath) && readFileSync(gitHookPath, "utf-8").includes(HOOK_MARKER_START)) {
		return { installed: true, method: "git-hook", path: gitHookPath };
	}

	return { installed: false, method: "none", path: "" };
}

function installHusky(huskyDir: string): InstallResult {
	const hookPath = resolve(huskyDir, "pre-commit");

	if (existsSync(hookPath)) {
		const content = readFileSync(hookPath, "utf-8");
		if (content.includes(HOOK_MARKER_START)) {
			return { success: true, method: "husky", message: "Hook already installed in .husky/pre-commit" };
		}
		appendFileSync(hookPath, `\n${HOOK_SCRIPT}\n`);
	} else {
		writeFileSync(hookPath, `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n${HOOK_SCRIPT}\n`);
		chmodSync(hookPath, 0o755);
	}

	return { success: true, method: "husky", message: "Hook installed in .husky/pre-commit" };
}

function installGitHook(hooksDir: string): InstallResult {
	if (!existsSync(hooksDir)) {
		mkdirSync(hooksDir, { recursive: true });
	}

	const hookPath = resolve(hooksDir, "pre-commit");

	if (existsSync(hookPath)) {
		const content = readFileSync(hookPath, "utf-8");
		if (content.includes(HOOK_MARKER_START)) {
			return { success: true, method: "git-hook", message: "Hook already installed in .git/hooks/pre-commit" };
		}
		appendFileSync(hookPath, `\n${HOOK_SCRIPT}\n`);
	} else {
		writeFileSync(hookPath, `#!/usr/bin/env sh\n\n${HOOK_SCRIPT}\n`);
		chmodSync(hookPath, 0o755);
	}

	return { success: true, method: "git-hook", message: "Hook installed in .git/hooks/pre-commit" };
}

function removeFromFile(filePath: string, method: "husky" | "git-hook"): InstallResult {
	const content = readFileSync(filePath, "utf-8");

	if (!content.includes(HOOK_MARKER_START)) {
		return { success: true, method, message: "No backlog-drift hook found to remove." };
	}

	const regex = new RegExp(`\\n?${escapeRegex(HOOK_MARKER_START)}[\\s\\S]*?${escapeRegex(HOOK_MARKER_END)}\\n?`, "g");
	const updated = content.replace(regex, "\n");

	writeFileSync(filePath, updated);
	return { success: true, method, message: `Hook removed from ${filePath}` };
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
