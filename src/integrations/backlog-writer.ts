import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import matter from "gray-matter";
import type { BacklogTask, DriftFix, DriftLogEntry } from "../types.js";

export interface WriteResult {
	success: boolean;
	method: "cli" | "direct";
	error?: string;
}

export function applyFix(fix: DriftFix, task: BacklogTask): WriteResult {
	switch (fix.type) {
		case "remove-ref":
			return removeRef(task, fix.ref ?? "");
		case "add-drift-status":
			return writeDriftField(task, "drift_status", fix.value ?? "flagged");
		case "add-drift-log":
			return writeDriftLog(task, fix.value ?? "[]");
		default:
			return writeDriftField(task, "drift_status", "flagged");
	}
}

function removeRef(task: BacklogTask, ref: string): WriteResult {
	// Try CLI first
	try {
		const currentRefs = task.refs.filter((r) => r !== ref);
		if (currentRefs.length === 0) {
			// Can't remove last ref via CLI easily; use direct write
			return removeRefDirect(task, ref);
		}
		// Use backlog task edit to update refs
		execSync(`backlog task edit ${task.id} --ref ${currentRefs.join(" --ref ")}`, {
			stdio: "pipe",
			timeout: 10000,
		});
		return { success: true, method: "cli" };
	} catch {
		return removeRefDirect(task, ref);
	}
}

function removeRefDirect(task: BacklogTask, ref: string): WriteResult {
	try {
		const raw = readFileSync(task.filePath, "utf-8");
		const { data, content } = matter(raw);

		const refField = data.ref ?? data.refs ?? data.references;
		if (Array.isArray(refField)) {
			const key = data.ref ? "ref" : data.refs ? "refs" : "references";
			data[key] = refField.filter((r: string) => r !== ref);
			if (data[key].length === 0) delete data[key];
		} else if (typeof refField === "string" && refField === ref) {
			const key = data.ref ? "ref" : data.refs ? "refs" : "references";
			delete data[key];
		}

		writeFileSync(task.filePath, matter.stringify(content, data));
		return { success: true, method: "direct" };
	} catch (e) {
		return { success: false, method: "direct", error: String(e) };
	}
}

function writeDriftField(task: BacklogTask, field: string, value: string): WriteResult {
	try {
		const raw = readFileSync(task.filePath, "utf-8");
		const { data, content } = matter(raw);

		data[field] = value;
		if (!data.drift_checked) {
			data.drift_checked = new Date().toISOString().split("T")[0];
		}

		writeFileSync(task.filePath, matter.stringify(content, data));
		return { success: true, method: "direct" };
	} catch (e) {
		return { success: false, method: "direct", error: String(e) };
	}
}

function writeDriftLog(task: BacklogTask, entriesJson: string): WriteResult {
	try {
		const raw = readFileSync(task.filePath, "utf-8");
		const { data, content } = matter(raw);

		const newEntries: DriftLogEntry[] = JSON.parse(entriesJson);
		const existing: DriftLogEntry[] = Array.isArray(data.drift_log) ? data.drift_log : [];
		data.drift_log = [...existing, ...newEntries];
		data.drift_checked = new Date().toISOString().split("T")[0];

		writeFileSync(task.filePath, matter.stringify(content, data));
		return { success: true, method: "direct" };
	} catch (e) {
		return { success: false, method: "direct", error: String(e) };
	}
}
