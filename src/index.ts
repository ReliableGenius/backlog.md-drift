#!/usr/bin/env bun
import { createRequire } from "node:module";
import { Command } from "commander";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const program = new Command();

program.name("backlog-drift").description("AI-powered drift detection for Backlog.md").version(version);

program
	.command("check")
	.description("Run drift checks on backlog tasks")
	.option("-t, --task <id>", "Check a specific task by ID")
	.option("-s, --since <ref>", "Only check changes since this git ref")
	.option("--semantic", "Also run AI-powered semantic checks")
	.option("--json", "Output results as JSON")
	.action(async (opts) => {
		const { runCheck } = await import("./commands/check.js");
		await runCheck(opts);
	});

program
	.command("init")
	.description("Initialize backlog-drift configuration")
	.action(async () => {
		const { runInit } = await import("./commands/init.js");
		await runInit();
	});

program
	.command("config")
	.description("Show current configuration")
	.action(async () => {
		const { runConfig } = await import("./commands/config.js");
		await runConfig();
	});

program
	.command("report")
	.description("Generate a drift health report")
	.option("--json", "Output as JSON")
	.action(async (opts) => {
		const { runReport } = await import("./commands/report.js");
		await runReport(opts);
	});

program
	.command("fix")
	.description("Auto-fix structural drift issues")
	.option("-t, --task <id>", "Fix a specific task by ID")
	.option("--dry-run", "Print proposed changes without modifying files")
	.option("--semantic", "Also apply AI-suggested updates")
	.option("-y, --yes", "Auto-apply without confirmation")
	.action(async (opts) => {
		const { runFix } = await import("./commands/fix.js");
		await runFix(opts);
	});

program
	.command("scan")
	.description("Discover file references for tasks by analyzing descriptions and git history")
	.option("-t, --task <id>", "Scan a specific task")
	.option("--apply", "Automatically add discovered refs to tasks")
	.option("--json", "Output as JSON")
	.action(async (opts) => {
		const { runScan } = await import("./commands/scan.js");
		await runScan(opts);
	});

program
	.command("hook")
	.description("Manage git hook integration")
	.argument("<action>", "install | remove | status")
	.action(async (action) => {
		const { runHook } = await import("./commands/hook.js");
		await runHook(action);
	});

program
	.command("hook-run", { hidden: true })
	.description("Internal: run hook checks (called by pre-commit hook)")
	.action(async () => {
		const { runHookCheck } = await import("./hooks/runner.js");
		await runHookCheck();
	});

program.parse();
