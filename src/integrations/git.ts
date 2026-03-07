import { statSync } from "node:fs";
import { resolve } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export interface GitIntegration {
	/** Get files changed between two refs (or since a ref to HEAD) */
	getChangedFiles(since: string, until?: string): Promise<string[]>;
	/** Get the last modified time of a file from the filesystem */
	getFileModDate(filePath: string): Date | null;
	/** Get staged files for the current commit */
	getStagedFiles(): Promise<string[]>;
	/** Check if a file exists in the current working tree */
	fileExists(filePath: string): boolean;
	/** Get the diff for a file between two refs */
	getFileDiff(filePath: string, since: string, until?: string): Promise<string>;
	/** Find files touched by commits whose message mentions the given text */
	getFilesFromCommitsMentioning(text: string): Promise<string[]>;
}

export function createGitIntegration(projectRoot: string): GitIntegration {
	const git: SimpleGit = simpleGit(projectRoot);

	return {
		async getChangedFiles(since: string, until = "HEAD"): Promise<string[]> {
			try {
				const diff = await git.diff(["--name-only", `${since}...${until}`]);
				return diff
					.split("\n")
					.map((f) => f.trim())
					.filter(Boolean);
			} catch {
				return [];
			}
		},

		getFileModDate(filePath: string): Date | null {
			try {
				const fullPath = resolve(projectRoot, filePath);
				const stat = statSync(fullPath);
				return stat.mtime;
			} catch {
				return null;
			}
		},

		async getStagedFiles(): Promise<string[]> {
			try {
				const diff = await git.diff(["--name-only", "--cached"]);
				return diff
					.split("\n")
					.map((f) => f.trim())
					.filter(Boolean);
			} catch {
				return [];
			}
		},

		fileExists(filePath: string): boolean {
			try {
				const fullPath = resolve(projectRoot, filePath);
				statSync(fullPath);
				return true;
			} catch {
				return false;
			}
		},

		async getFileDiff(filePath: string, since: string, until = "HEAD"): Promise<string> {
			try {
				return await git.diff([`${since}...${until}`, "--", filePath]);
			} catch {
				return "";
			}
		},

		async getFilesFromCommitsMentioning(text: string): Promise<string[]> {
			try {
				const log = await git.log(["--all", `--grep=${text}`, "--name-only", "--pretty=format:"]);
				const files = new Set<string>();
				for (const entry of log.all) {
					const diff = entry.diff;
					if (diff?.files) {
						for (const f of diff.files) {
							files.add(f.file);
						}
					}
				}
				if (files.size === 0) {
					// Fallback: parse raw log output
					const raw = await git.raw(["log", "--all", `--grep=${text}`, "--name-only", "--pretty=format:"]);
					for (const line of raw.split("\n")) {
						const trimmed = line.trim();
						if (trimmed && !trimmed.startsWith("commit ")) {
							files.add(trimmed);
						}
					}
				}
				return [...files];
			} catch {
				return [];
			}
		},
	};
}
