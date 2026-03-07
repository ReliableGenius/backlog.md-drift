import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HOOK_MARKER_START = "# >>> backlog-drift pre-commit hook >>>";
const HOOK_MARKER_END = "# <<< backlog-drift pre-commit hook <<<";
const HOOK_SCRIPT = `${HOOK_MARKER_START}
npx backlog-drift hook-run 2>&1
${HOOK_MARKER_END}`;

const COMMIT_MSG_MARKER_START = "# >>> backlog-drift commit-msg hook >>>";
const COMMIT_MSG_MARKER_END = "# <<< backlog-drift commit-msg hook <<<";
const COMMIT_MSG_SCRIPT = `${COMMIT_MSG_MARKER_START}
# Enforces Conventional Commits: https://www.conventionalcommits.org/
commit_msg_file="$1"
commit_msg=$(head -1 "$commit_msg_file")
if echo "$commit_msg" | grep -qE "^Merge |^Revert "; then
  exit 0
fi
pattern="^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\\(.+\\))?\\!?: .+"
if ! echo "$commit_msg" | grep -qE "$pattern"; then
  echo ""
  echo "ERROR: Commit message does not follow Conventional Commits format."
  echo ""
  echo "  Expected: <type>[optional scope]: <description>"
  echo ""
  echo "  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
  echo ""
  echo "  Examples:"
  echo "    feat: add semantic drift detection"
  echo "    fix(scanner): handle files with spaces in path"
  echo "    feat!: redesign config schema (breaking change)"
  echo ""
  echo "  Your message: $commit_msg"
  echo ""
  exit 1
fi
${COMMIT_MSG_MARKER_END}`;

interface InstallResult {
	success: boolean;
	method: "husky" | "git-hook";
	message: string;
}

export function installHook(projectRoot: string): InstallResult {
	// Try Husky first
	const huskyDir = resolve(projectRoot, ".husky");
	if (existsSync(huskyDir)) {
		const result = installHusky(huskyDir);
		installCommitMsgHook(huskyDir, true);
		return result;
	}

	// Fall back to .git/hooks
	const gitHooksDir = resolve(projectRoot, ".git/hooks");
	if (existsSync(resolve(projectRoot, ".git"))) {
		const result = installGitHook(gitHooksDir);
		installCommitMsgHook(gitHooksDir, false);
		return result;
	}

	return { success: false, method: "git-hook", message: "No .git directory found. Is this a git repository?" };
}

export function removeHook(projectRoot: string): InstallResult {
	const huskyPath = resolve(projectRoot, ".husky/pre-commit");
	const gitHookPath = resolve(projectRoot, ".git/hooks/pre-commit");
	const huskyCommitMsgPath = resolve(projectRoot, ".husky/commit-msg");
	const gitCommitMsgPath = resolve(projectRoot, ".git/hooks/commit-msg");

	// Remove commit-msg hooks
	if (existsSync(huskyCommitMsgPath)) {
		removeFromFile(huskyCommitMsgPath, "husky", COMMIT_MSG_MARKER_START, COMMIT_MSG_MARKER_END);
	}
	if (existsSync(gitCommitMsgPath)) {
		removeFromFile(gitCommitMsgPath, "git-hook", COMMIT_MSG_MARKER_START, COMMIT_MSG_MARKER_END);
	}

	// Remove pre-commit hooks
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

function installCommitMsgHook(hooksDir: string, isHusky: boolean): void {
	const hookPath = resolve(hooksDir, "commit-msg");

	if (existsSync(hookPath)) {
		const content = readFileSync(hookPath, "utf-8");
		if (content.includes(COMMIT_MSG_MARKER_START)) {
			return;
		}
		appendFileSync(hookPath, `\n${COMMIT_MSG_SCRIPT}\n`);
	} else {
		const shebang = isHusky ? `#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\n` : "#!/usr/bin/env sh\n\n";
		writeFileSync(hookPath, `${shebang}${COMMIT_MSG_SCRIPT}\n`);
		chmodSync(hookPath, 0o755);
	}
}

function removeFromFile(
	filePath: string,
	method: "husky" | "git-hook",
	markerStart = HOOK_MARKER_START,
	markerEnd = HOOK_MARKER_END,
): InstallResult {
	const content = readFileSync(filePath, "utf-8");

	if (!content.includes(markerStart)) {
		return { success: true, method, message: "No backlog-drift hook found to remove." };
	}

	const regex = new RegExp(`\\n?${escapeRegex(markerStart)}[\\s\\S]*?${escapeRegex(markerEnd)}\\n?`, "g");
	const updated = content.replace(regex, "\n");

	writeFileSync(filePath, updated);
	return { success: true, method, message: `Hook removed from ${filePath}` };
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
