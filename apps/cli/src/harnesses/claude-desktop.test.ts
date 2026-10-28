import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(await run(adapter.save(schedule))).toStartWith(
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
        name: "Dependency watch",
        status: "paused",
        lastRun: { at: new Date(Date.UTC(2026, 9, 26, 8, 3)) },
        schedule,
      },
    ]);
    // An existing task keeps whatever mode it was given in the app.
    expect(
      await run(reopened.save({ ...schedule, prompt: "Report the updated findings." })),
    ).toBeUndefined();
    expect(await readFile(skillPath, "utf8")).toBe(
      `${customFrontmatter}---\n\nReport the updated findings.\n`,
    );
    const updated = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(updated.scheduledTasks[0].permissionMode).toBe("acceptEdits");
    expect(await run(reopened.save({ ...schedule, name: "Nightly" }))).toBe(
      "Bypass permissions, so runs can do anything",
    );
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
