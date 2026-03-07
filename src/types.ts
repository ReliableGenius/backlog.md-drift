export type DriftType = "ref-deleted" | "dep-resolved" | "post-complete-change" | "refs-orphaned";

export type SemanticDriftType =
	| "description-drift"
	| "criteria-completed"
	| "criteria-invalidated"
	| "redundancy-detected";

export type DriftSeverity = "error" | "warning" | "info";

export interface DriftResult {
	taskId: string;
	taskTitle: string;
	type: DriftType | SemanticDriftType;
	severity: DriftSeverity;
	message: string;
	detail?: string;
	/** The file ref that triggered this result, if applicable */
	ref?: string;
	/** The dependency task ID that triggered this result, if applicable */
	dependencyId?: string;
	/** LLM reasoning for semantic results */
	reasoning?: string;
}

export interface DriftFix {
	taskId: string;
	type: "remove-ref" | "add-drift-status" | "add-drift-log" | "update-description" | "update-criteria";
	description: string;
	/** For remove-ref: the ref to remove */
	ref?: string;
	/** For updates: the new value */
	value?: string;
	/** Whether this fix requires user confirmation (semantic fixes always do) */
	requiresConfirmation: boolean;
}

export interface BacklogTask {
	id: string;
	title: string;
	status: string;
	filePath: string;
	/** File references from the task */
	refs: string[];
	dependencies: string[];
	createdDate?: string;
	updatedDate?: string;
	priority?: string;
	labels: string[];
	assignee: string[];
	/** Drift-specific fields */
	driftStatus?: "clean" | "flagged" | "auto-updated";
	driftChecked?: string;
	driftLog?: DriftLogEntry[];
	/** Raw frontmatter for pass-through */
	frontmatter: Record<string, unknown>;
	/** Markdown body content */
	body: string;
}

export interface DriftLogEntry {
	date: string;
	type: DriftType | SemanticDriftType;
	detail: string;
	resolution: string;
}

export interface DriftConfig {
	structural: {
		enabled: boolean;
		check_dead_refs: boolean;
		check_dependency_state: boolean;
		check_stale_completions: boolean;
		check_orphaned_tasks: boolean;
		stale_completion_days: number;
	};
	semantic: {
		enabled: boolean;
		provider: "anthropic" | "openai" | "ollama";
		model: string;
	};
	hook: {
		mode: "warn" | "block" | "silent";
		structural_only: boolean;
		semantic_on_commit: boolean;
	};
	scope: {
		statuses: string[];
		check_completed: boolean;
		check_archived: boolean;
		ignore_tasks: string[];
		ignore_refs: string[];
	};
}

export interface DriftCheckOptions {
	/** Check a specific task by ID */
	taskId?: string;
	/** Only check changes since this git ref */
	since?: string;
	/** Run semantic checks */
	semantic?: boolean;
	/** Output format */
	format?: "terminal" | "json";
}

export interface BacklogConfig {
	task_prefix: string;
	statuses: string[];
	bypass_git_hooks: boolean;
}
