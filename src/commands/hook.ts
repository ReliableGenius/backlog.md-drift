import pc from "picocolors";
import { hookStatus, installHook, removeHook } from "../hooks/installer.js";

export async function runHook(action: string): Promise<void> {
	const projectRoot = process.cwd();

	switch (action) {
		case "install": {
			const result = installHook(projectRoot);
			if (result.success) {
				console.log(pc.green(`✓ ${result.message}`));
			} else {
				console.log(pc.red(`✗ ${result.message}`));
				process.exit(1);
			}
			break;
		}
		case "remove": {
			const result = removeHook(projectRoot);
			if (result.success) {
				console.log(pc.green(`✓ ${result.message}`));
			} else {
				console.log(pc.red(`✗ ${result.message}`));
				process.exit(1);
			}
			break;
		}
		case "status": {
			const status = hookStatus(projectRoot);
			if (status.installed) {
				console.log(pc.green(`✓ Hook installed via ${status.method}`));
				console.log(pc.dim(`  Path: ${status.path}`));
			} else {
				console.log(pc.yellow("⚠ No hook installed"));
				console.log(pc.dim("  Run `backlog-drift hook install` to add pre-commit checks."));
			}
			break;
		}
		default:
			console.log(pc.red(`Unknown action: ${action}`));
			console.log(pc.dim("  Use: install | remove | status"));
			process.exit(1);
	}
}
