import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAllTasks, parseTaskFile } from "../integrations/backlog-reader.js";

const TMP_DIR = join(import.meta.dirname, "../../.test-tmp-reader");

beforeEach(() => {
	mkdirSync(join(TMP_DIR, "backlog/tasks"), { recursive: true });
	mkdirSync(join(TMP_DIR, "backlog/completed"), { recursive: true });
	mkdirSync(join(TMP_DIR, "backlog/archive/tasks"), { recursive: true });
});

afterEach(() => {
	rmSync(TMP_DIR, { recursive: true, force: true });
});

function writeTask(dir: string, filename: string, content: string) {
	writeFileSync(join(TMP_DIR, dir, filename), content);
}

describe("parseTaskFile", () => {
	test("parses a task with all fields", () => {
		const path = join(TMP_DIR, "backlog/tasks/test-1.md");
		writeFileSync(
			path,
			`---
id: TEST-1
title: Test task
status: In Progress
ref:
  - src/foo.ts
  - src/bar.ts
dependencies:
  - TEST-0
created_date: '2026-01-01'
updated_date: '2026-01-02'
priority: high
labels:
  - feature
assignee:
  - '@claude'
---

## Description
A test task.
`,
		);

		const task = parseTaskFile(path);
		expect(task).not.toBeNull();
		expect(task?.id).toBe("TEST-1");
		expect(task?.title).toBe("Test task");
		expect(task?.status).toBe("In Progress");
		expect(task?.refs).toEqual(["src/foo.ts", "src/bar.ts"]);
		expect(task?.dependencies).toEqual(["TEST-0"]);
		expect(task?.priority).toBe("high");
		expect(task?.labels).toEqual(["feature"]);
		expect(task?.assignee).toEqual(["@claude"]);
		expect(task?.body).toContain("A test task.");
	});

	test("handles task with no refs", () => {
		const path = join(TMP_DIR, "backlog/tasks/test-2.md");
		writeFileSync(
			path,
			`---
id: TEST-2
title: No refs task
status: To Do
---

Body.
`,
		);

		const task = parseTaskFile(path);
		expect(task?.refs).toEqual([]);
	});

	test("handles task with empty arrays", () => {
		const path = join(TMP_DIR, "backlog/tasks/test-3.md");
		writeFileSync(
			path,
			`---
id: TEST-3
title: Empty arrays
status: To Do
ref: []
dependencies: []
labels: []
assignee: []
---

Body.
`,
		);

		const task = parseTaskFile(path);
		expect(task?.refs).toEqual([]);
		expect(task?.dependencies).toEqual([]);
		expect(task?.labels).toEqual([]);
	});

	test("handles task with single string ref", () => {
		const path = join(TMP_DIR, "backlog/tasks/test-4.md");
		writeFileSync(
			path,
			`---
id: TEST-4
title: Single ref
status: To Do
ref: src/single.ts
---

Body.
`,
		);

		const task = parseTaskFile(path);
		expect(task?.refs).toEqual(["src/single.ts"]);
	});

	test("returns null for file without id/title", () => {
		const path = join(TMP_DIR, "backlog/tasks/bad.md");
		writeFileSync(
			path,
			`---
status: To Do
---

No id or title.
`,
		);

		const task = parseTaskFile(path);
		expect(task).toBeNull();
	});

	test("parses drift fields", () => {
		const path = join(TMP_DIR, "backlog/tasks/test-5.md");
		writeFileSync(
			path,
			`---
id: TEST-5
title: Drift fields
status: To Do
drift_status: flagged
drift_checked: '2026-03-01'
drift_log:
  - date: '2026-03-01'
    type: ref-deleted
    detail: 'src/old.ts no longer exists'
    resolution: flagged
---

Body.
`,
		);

		const task = parseTaskFile(path);
		expect(task?.driftStatus).toBe("flagged");
		expect(task?.driftChecked).toBe("2026-03-01");
		expect(task?.driftLog).toHaveLength(1);
		expect(task?.driftLog?.[0].type).toBe("ref-deleted");
	});
});

describe("loadAllTasks", () => {
	test("discovers tasks across all directories", () => {
		writeTask(
			"backlog/tasks",
			"t1.md",
			`---
id: T-1
title: Active task
status: To Do
---
`,
		);
		writeTask(
			"backlog/completed",
			"t2.md",
			`---
id: T-2
title: Done task
status: Done
---
`,
		);
		writeTask(
			"backlog/archive/tasks",
			"t3.md",
			`---
id: T-3
title: Archived task
status: Done
---
`,
		);

		const tasks = loadAllTasks(TMP_DIR);
		expect(tasks).toHaveLength(3);
		expect(tasks.map((t) => t.id).sort()).toEqual(["T-1", "T-2", "T-3"]);
	});

	test("handles missing directories gracefully", () => {
		rmSync(join(TMP_DIR, "backlog/completed"), { recursive: true });
		rmSync(join(TMP_DIR, "backlog/archive"), { recursive: true });

		writeTask(
			"backlog/tasks",
			"t1.md",
			`---
id: T-1
title: Only task
status: To Do
---
`,
		);

		const tasks = loadAllTasks(TMP_DIR);
		expect(tasks).toHaveLength(1);
	});
});
