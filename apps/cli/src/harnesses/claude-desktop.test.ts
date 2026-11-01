import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { claudeDesktop } from "./claude-desktop.ts";
import { connect, run } from "../harness.ts";

let root = "";
const saved = {
  config: process.env.CLAUDE_CONFIG_DIR,
  userData: process.env.CLAUDE_USER_DATA_DIR,
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "claude-desktop-"));
  process.env.CLAUDE_CONFIG_DIR = join(root, "config");
  process.env.CLAUDE_USER_DATA_DIR = join(root, "app");
  await mkdir(join(root, "app/claude-code-sessions/account/org"), { recursive: true });
  await mkdir(join(root, "repo"));
});

afterAll(async () => {
  process.env.CLAUDE_CONFIG_DIR = saved.config;
  process.env.CLAUDE_USER_DATA_DIR = saved.userData;
  await rm(root, { recursive: true, force: true });
});

test.skipIf(process.platform !== "linux")(
  "push reports the permission mode and list shows the last run",
  async () => {
    const cwd = join(root, "repo");
    const manifestPath = join(root, "app/claude-code-sessions/account/org/scheduled-tasks.json");
    const schedule = {
      name: "Dependency watch",
      timing: { minute: 0, hour: 8, weekdays: [1] },
      prompt: 'Audit dependencies: report "findings". # Review C:\\repo\u0085next',
    };

    const adapter = await connect(claudeDesktop, { cwd });
    expect(await run(adapter.check(schedule, false))).toBeUndefined();
    expect((await run(adapter.save(schedule))).note).toStartWith(
      "Manual permissions, so a run stops for each tool you haven't allowed: click Run now",
    );

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const skillPath = manifest.scheduledTasks[0].filePath;
    const skill = await readFile(skillPath, "utf8");
    const description = /^description: (.*)$/m.exec(skill)?.[1] ?? "";
    expect(JSON.parse(description)).toBe(schedule.prompt);
    expect(description).toContain("\\u0085");
    const frontmatter = skill.slice(0, skill.indexOf("\n---", 4));
    const customFrontmatter = `${frontmatter}\nmodel: sonnet\nallowed-tools:\n  - Read\n  - 'Bash(git status:*)'\ncustom:\n  nested: true\n`;
    await writeFile(skillPath, `${customFrontmatter}---\n\n${schedule.prompt}\n`);
    manifest.scheduledTasks[0].lastRunAt = Date.UTC(2026, 9, 26, 8, 3);
    manifest.scheduledTasks[0].enabled = false;
    manifest.scheduledTasks[0].permissionMode = "acceptEdits";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await mkdir(join(cwd, ".claude"));
    await writeFile(
      join(cwd, ".claude/settings.json"),
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
    );

    const reopened = await connect(claudeDesktop, { cwd });
    expect(await run(reopened.list)).toEqual([
      {
        id: "dependency-watch",
        name: "Dependency watch",
        status: "paused",
        workspace: cwd,
        lastRun: { at: new Date(Date.UTC(2026, 9, 26, 8, 3)) },
        settings: { permissionMode: "acceptEdits" },
        schedule,
      },
    ]);
    // An existing task keeps whatever mode it was given in the app.
    expect(
      await run(reopened.save({ ...schedule, prompt: "Report the updated findings." })),
    ).toEqual({ id: "dependency-watch" });
    expect(await readFile(skillPath, "utf8")).toBe(
      `${customFrontmatter}---\n\nReport the updated findings.\n`,
    );
    const updated = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(updated.scheduledTasks[0].permissionMode).toBe("acceptEdits");
    expect(await run(reopened.save({ ...schedule, name: "Nightly" }))).toEqual({
      id: "nightly",
      note: "Bypass permissions, so runs can do anything",
    });
  },
);

test.skipIf(process.platform !== "linux")("Windows detects Claude from tasklist CSV", async () => {
  const bin = join(root, "bin");
  await mkdir(bin);
  await writeFile(
    join(bin, "tasklist"),
    `#!/bin/sh
test "$3" = /FO && test "$4" = CSV && test "$5" = /NH || exit 1
printf '%s\\n' '"Claude.exe","1234","Console","1","42,000 K"'
`,
    { mode: 0o755 },
  );
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  const path = process.env.PATH;

  try {
    process.env.PATH = `${bin}:${path}`;
    Object.defineProperty(process, "platform", { value: "win32" });
    const adapter = await connect(claudeDesktop, { cwd: join(root, "repo") });
    expect(
      await run(
        adapter.check(
          { name: "Test", timing: { minute: 0, hour: 8, weekdays: null }, prompt: "Check" },
          false,
        ),
      ),
    ).toStartWith("Quit Claude Desktop before pushing");
  } finally {
    if (platform) {
      Object.defineProperty(process, "platform", platform);
    }

    process.env.PATH = path;
  }
});

test.skipIf(process.platform !== "linux")(
  "lists every workspace's tasks and pauses, updates and removes them by id",
  async () => {
    const manifestPath = join(root, "app/claude-code-sessions/account/org/scheduled-tasks.json");
    const tasksDir = join(root, "config/scheduled-tasks");
    const task = (id: string, cwd: string) => ({
      id,
      displayName: id,
      cronExpression: "0 8 1 * *",
      enabled: true,
      filePath: join(tasksDir, id, "SKILL.md"),
      createdAt: 1,
      cwd,
    });
    for (const id of ["mine", "theirs"]) {
      await mkdir(join(tasksDir, id), { recursive: true });
      await writeFile(join(tasksDir, id, "SKILL.md"), `---\nname: ${id}\n---\n\nRun ${id}.\n`);
    }
    await writeFile(
      manifestPath,
      JSON.stringify({
        scheduledTasks: [task("mine", join(root, "repo")), task("theirs", "/other")],
      }),
    );

    const all = await run(claudeDesktop.inventory);
    expect(all.map((live) => [live.id, live.workspace, "schedule" in live])).toEqual([
      ["mine", join(root, "repo"), true],
      ["theirs", "/other", true],
    ]);

    await run(claudeDesktop.setEnabled?.("theirs", false) ?? Effect.succeed(undefined));
    const adapter = await connect(claudeDesktop, { cwd: join(root, "repo") });
    expect(
      await run(
        adapter.save(
          { name: "Renamed", timing: { minute: 0, hour: 9, weekdays: null }, prompt: "Run it." },
          "mine",
        ),
      ),
    ).toEqual({ id: "mine" });
    await run(claudeDesktop.remove?.("theirs") ?? Effect.succeed(undefined));

    const { scheduledTasks } = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(scheduledTasks).toMatchObject([
      { id: "mine", displayName: "Renamed", cronExpression: "0 9 * * *", enabled: true },
    ]);
    expect(await readFile(join(tasksDir, "theirs", "SKILL.md"), "utf8").catch(() => "gone")).toBe(
      "gone",
    );
    // The other tests here start from an account with no tasks, in whatever order they run.
    await rm(manifestPath);
    await rm(tasksDir, { recursive: true });
  },
);
