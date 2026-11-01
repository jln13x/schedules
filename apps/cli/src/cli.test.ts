import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Inventory } from "./inventory.ts";

const CLI = fileURLToPath(new URL("cli.ts", import.meta.url));
let root = "";
let env: Record<string, string> = {};

const cli = (args: ReadonlyArray<string>, cwd = join(root, "repo")) => {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, env, encoding: "utf8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
};
const ok = (args: ReadonlyArray<string>, cwd?: string) => {
  const result = cli(args, cwd);
  expect(result.err + result.out).toBeDefined();

  if (result.code !== 0) {
    throw new Error(`${args.join(" ")} exited ${result.code}:\n${result.out}\n${result.err}`);
  }

  return result.out;
};
const inventory = (...args: ReadonlyArray<string>) =>
  JSON.parse(ok(["list", "--all", "--json", ...args])) as Inventory;
const crontab = () => readFileSync(join(root, "table"), "utf8");
const registrations = () =>
  JSON.parse(readFileSync(join(root, "state/registrations.json"), "utf8")).registrations as Array<{
    harness: string;
    nativeId: string;
    source: string;
    name: string;
  }>;

function executable(path: string, body: string) {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "agent-schedules-cli-"));
  const bin = join(root, "bin");
  for (const dir of ["bin", "home", "repo", "remote-repo", "state"]) {
    mkdirSync(join(root, dir));
  }

  executable(
    join(bin, "crontab"),
    `if [ "$1" = "-l" ]; then [ -f "${root}/table" ] || { echo "no crontab for test" >&2; exit 1; }; cat "${root}/table"; else cat > "${root}/table"; fi`,
  );
  // Agents that record that they ran, and what they were asked.
  executable(join(bin, "codex"), `cat > "$PWD/codex-prompt"\necho done`);
  executable(join(bin, "pi"), `echo done`);
  // An ssh that runs the command here, with the remote's own state, and one host that is down.
  executable(
    join(bin, "ssh"),
    `while [ "$1" != "--" ]; do shift; done; shift
host="$1"; shift
if [ "$host" = broken ]; then echo "ssh: connect to host broken port 22: Connection refused" >&2; exit 255; fi
AGENT_SCHEDULES_HOME="${root}/remote-state" exec sh -c "$1"`,
  );
  env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: join(root, "home"),
    AGENT_SCHEDULES_HOME: join(root, "state"),
    AGENT_SCHEDULES_CRONTAB: join(bin, "crontab"),
    AGENT_SCHEDULES_SSH: join(bin, "ssh"),
    AGENT_SCHEDULES_REMOTE_CLI: `${process.execPath} ${CLI}`,
    CODEX_HOME: join(root, "home/.codex"),
    DO_NOT_TRACK: "1",
  };
  for (const repo of ["repo", "remote-repo"]) {
    spawnSync("git", ["init", "-q"], { cwd: join(root, repo) });
    const skill = join(root, repo, ".agents/skills/brief");
    mkdirSync(skill, { recursive: true });
    writeFileSync(
      join(skill, "SKILL.md"),
      "---\nname: brief\ndescription: Brief me.\n---\n\nBrief me.\n",
    );
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const file = () => join(root, "repo/.agents/schedules/brief.md");

test("a schedule's life with a command-line agent, in order", async () => {
  let id = "";

  // schedule and push bind the file to the new task.
  {
    ok(["schedule", "brief", "0 8 * * 1-5"]);
    expect(ok(["push", "codex", "--all"])).toContain("create    brief");
    const [registration] = registrations();
    expect(registration).toMatchObject({ harness: "codex", name: "brief" });
    expect(registration?.source.endsWith("/repo/.agents/schedules/brief.md")).toBe(true);
    id = registration?.nativeId ?? "";
    expect(crontab()).toContain(`# agent-schedules ${id}`);
  }

  // list --all --json reports the task with its source, actions, and warnings.
  {
    const listed = inventory();
    expect(listed.version).toBe(1);
    expect(listed.tasks.find((task) => task.id === id)).toEqual({
      id,
      harness: "codex",
      host: null,
      workspace: join(root, "repo"),
      name: "brief",
      prompt: expect.stringContaining("read .agents/skills/brief/SKILL.md"),
      timing: { cron: "0 8 * * 1-5", description: "Weekdays 08:00" },
      unsupported: null,
      status: "active",
      lastRun: null,
      model: null,
      access: "read",
      options: { model: true, access: ["read", "edit", "full"] },
      settings: {},
      source: { path: file(), exists: true },
      actions: ["disable", "run-now", "remove", "push", "pull"],
    });
    // T3 and Claude Desktop aren't here; the listing still answers, and says so.
    expect(listed.warnings.map((warning) => warning.harness)).toEqual(
      expect.arrayContaining(["t3", "claude-desktop"]),
    );
  }

  // a paused task stays paused through a push and a one-off run.
  {
    expect(JSON.parse(ok(["disable", "codex", "brief", "--json"])).results[0]).toMatchObject({
      id,
      action: "disable",
      outcome: "done",
    });
    expect(crontab()).not.toContain(id);

    ok(["schedule", "brief", "0 9 * * 1-5"]);
    expect(ok(["push", "codex", "--all"])).toContain("still paused");
    expect(crontab()).not.toContain(id);

    ok(["run-now", "codex", "--id", id]);
    const last = join(root, "state/jobs", id, "last.json");
    for (let tries = 0; tries < 100 && !existsSync(last); tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(JSON.parse(readFileSync(last, "utf8")).outcome).toBe("ok");
    expect(readFileSync(join(root, "repo/codex-prompt"), "utf8")).toContain("brief skill");
    expect(inventory().tasks.find((task) => task.id === id)?.status).toBe("paused");
    expect(crontab()).not.toContain(id);

    ok(["enable", "codex", "brief"]);
    expect(crontab()).toContain(`# agent-schedules ${id}`);
  }

  // a rename updates the same task, and an edit in the scheduler needs --force.
  {
    writeFileSync(file(), readFileSync(file(), "utf8").replace("name: brief", "name: Daily brief"));
    expect(ok(["push", "codex", "--all"])).toContain("update    Daily brief");
    expect(inventory().tasks.filter((task) => task.harness === "codex")).toMatchObject([
      { id, name: "Daily brief" },
    ]);

    writeFileSync(join(root, "state/jobs", id, "prompt.md"), "Edited in the scheduler.");
    writeFileSync(file(), readFileSync(file(), "utf8").replace("0 9", "0 10"));
    const conflict = cli(["push", "codex", "--all"]);
    expect(conflict.code).toBe(1);
    expect(conflict.out).toContain("changed in codex since the last push");
    expect(ok(["push", "codex", "--all", "--force"])).toContain("update    Daily brief");
  }

  // pull --adopt binds files to existing tasks.
  {
    rmSync(join(root, "state/registrations.json"));
    expect(ok(["pull", "codex", "--all"])).toContain("1 unchanged");
    expect(existsSync(join(root, "state/registrations.json"))).toBe(false);
    ok(["pull", "codex", "--all", "--adopt"]);
    expect(registrations()).toMatchObject([{ harness: "codex", nativeId: id }]);
  }

  // remote hosts are listed with one call each, and a broken one is a warning.
  {
    ok(["schedule", "brief", "0 7 * * 1", "--ssh", "devbox", "--cwd", join(root, "remote-repo")]);
    ok(["push", "codex", "--all", "--ssh", "devbox", "--cwd", join(root, "remote-repo")]);
    expect(JSON.parse(readFileSync(join(root, "state/hosts.json"), "utf8")).hosts).toMatchObject([
      { host: "devbox" },
    ]);
    expect(existsSync(join(root, "remote-state/registrations.json"))).toBe(true);

    // A host can be remembered and then go away.
    const hosts = JSON.parse(readFileSync(join(root, "state/hosts.json"), "utf8"));
    hosts.hosts.push({ host: "broken", addedAt: "2026-11-01T00:00:00.000Z" });
    writeFileSync(join(root, "state/hosts.json"), JSON.stringify(hosts));

    const listed = inventory("codex");
    expect(listed.tasks.map((task) => [task.host, task.name])).toEqual([
      [null, "Daily brief"],
      ["devbox", "brief"],
    ]);
    expect(listed.warnings).toEqual([
      {
        harness: null,
        host: "broken",
        message: "ssh: connect to host broken port 22: Connection refused",
      },
    ]);
    ok(["hosts", "forget", "broken"]);
  }

  // a file shared by two tasks isn't deleted, and remove forgets the task.
  {
    expect(ok(["push", "pi", "--all"])).toContain("create    Daily brief");
    const shared = cli(["remove", "codex", "Daily brief", "--delete-source"]);
    expect(shared.code).toBe(1);
    expect(shared.out).toContain("is also pushed to pi task Daily brief");
    expect(crontab()).toContain(id);
    expect(existsSync(file())).toBe(true);

    ok(["delete", "pi", "Daily brief"]);
    expect(existsSync(file())).toBe(true);
    expect(ok(["remove", "codex", "--id", id, "--delete-source"])).toContain("deleted");
    expect(existsSync(file())).toBe(false);
    expect(crontab()).not.toContain(id);
    expect(registrations()).toEqual([]);
  }
}, 120_000);
