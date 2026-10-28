import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, run } from "../../harness.ts";
import { cronLines, withoutCronJob } from "./crontab.ts";
import { cronHarness, removeJob } from "./index.ts";
import { type Job, jobId, lastRun, listJobs, preflight, runJob } from "./jobs.ts";

const job: Job = {
  id: "codex-morning-brief-abc123",
  agent: "codex",
  name: "Morning brief",
  cwd: "/repo",
  schedule: "7 9 * * 1-5",
  access: "read",
  binary: "/usr/bin/codex",
  path: "/usr/bin",
  updatedAt: "2026-10-27T00:00:00.000Z",
};

describe("cron entries", () => {
  test("quote every argument and escape %", () => {
    const [tag, entry] = cronLines(job, [
      "/usr/bin/node",
      "/home/o'neil/50%/cli.mjs",
      "run",
      job.id,
    ]);
    expect(tag).toBe(`# agent-schedules ${job.id}`);
    expect(entry).toBe(
      `7 9 * * 1-5 '/usr/bin/node' '/home/o'\\''neil/50\\%/cli.mjs' 'run' '${job.id}'`,
    );
  });

  test("removing a job keeps every other line", () => {
    const lines = ["MAILTO=me", ...cronLines(job, ["x"]), "0 1 * * * backup"];
    expect(withoutCronJob(lines, job.id)).toEqual(["MAILTO=me", "0 1 * * * backup"]);
    expect(withoutCronJob(lines, "other")).toEqual(lines);
  });
});

describe.skipIf(process.platform === "win32")("scheduling with cron", () => {
  const saved = {
    home: process.env.AGENT_SCHEDULES_HOME,
    crontab: process.env.AGENT_SCHEDULES_CRONTAB,
    path: process.env.PATH,
  };
  let root = "";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "agent-schedules-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await mkdir(join(root, "repo"));
    // A crontab that keeps its table in a file, and a codex that records what it was given.
    await writeFile(
      join(bin, "crontab"),
      `#!/bin/sh\nif [ "$1" = "-l" ]; then [ -f "${root}/table" ] || { echo "no crontab for test" >&2; exit 1; }; cat "${root}/table"; else cat > "${root}/table"; fi\n`,
    );
    await writeFile(
      join(bin, "codex"),
      `#!/bin/sh\necho "$@" > "$PWD/args"\ncat > "$PWD/stdin"\necho done\n`,
    );
    // An opencode that takes two seconds and records when it ran, to prove runs don't overlap.
    await writeFile(
      join(bin, "opencode"),
      `#!/bin/sh\ncat > /dev/null\nif [ -f "$PWD/fail-once" ]; then rm "$PWD/fail-once"; echo "Error: database is locked"; exit 1; fi\nif [ -f "$PWD/fail-always" ]; then echo "Error: database is locked"; exit 1; fi\necho "start $(date +%s%N)" >> "$PWD/opencode-runs"\nsleep 2\necho "end $(date +%s%N)" >> "$PWD/opencode-runs"\n`,
    );
    await chmod(join(bin, "crontab"), 0o755);
    await chmod(join(bin, "codex"), 0o755);
    await chmod(join(bin, "opencode"), 0o755);
    process.env.AGENT_SCHEDULES_HOME = join(root, "state");
    process.env.AGENT_SCHEDULES_CRONTAB = join(bin, "crontab");
    process.env.AGENT_SCHEDULES_RETRY_DELAY_MS = "10";
    process.env.PATH = `${bin}:${process.env.PATH}`;
  });

  afterAll(async () => {
    process.env.AGENT_SCHEDULES_HOME = saved.home;
    process.env.AGENT_SCHEDULES_CRONTAB = saved.crontab;
    process.env.PATH = saved.path;
    await rm(root, { recursive: true, force: true });
  });

  test("push, list, run, and remove", async () => {
    await writeFile(join(root, "table"), "MAILTO=me\n");
    const cwd = join(root, "repo");
    const adapter = await connect(cronHarness("codex"), { cwd, access: "edit" });
    const schedule = {
      name: "Morning brief",
      timing: { minute: 7, hour: 9, weekdays: [1, 2, 3, 4, 5] },
      prompt: "Say 'hi' and 100% nothing $HOME else.",
    };

    expect(await run(adapter.check(schedule, false))).toBeUndefined();
    expect(await run(adapter.save(schedule))).toBe("Weekdays 09:07 via cron, edit access");
    expect(await run(adapter.list)).toEqual([
      {
        name: "Morning brief",
        status: "active",
        lastRun: undefined,
        model: undefined,
        access: "edit",
        schedule,
      },
    ]);

    const table = await readFile(join(root, "table"), "utf8");
    expect(table.startsWith("MAILTO=me\n# agent-schedules codex-morning-brief-")).toBe(true);
    expect(table).toContain("7 9 * * 1-5 ");

    const saved = (await run(listJobs)).find((job) => job.agent === "codex");
    expect(saved?.access).toBe("edit");
    expect(await run(runJob(saved?.id ?? ""))).toBe(0);
    expect(await readFile(join(cwd, "stdin"), "utf8")).toBe(schedule.prompt);
    expect(await readFile(join(cwd, "args"), "utf8")).toBe(
      'exec --skip-git-repo-check --sandbox workspace-write -c approval_policy="never" --ignore-rules --ignore-user-config\n',
    );
    expect((await run(lastRun(saved?.id ?? "")))?.outcome).toBe("ok");
    const [listed] = await run(adapter.list);
    expect(listed?.lastRun?.outcome).toBe("ok");

    // A job the crontab lost shows up as such rather than as active.
    await writeFile(join(root, "table"), "MAILTO=me\n");
    expect((await run(adapter.list))[0]?.status).toBe("not scheduled");

    if (saved) {
      await run(removeJob(saved));
    }

    expect(await run(listJobs)).toEqual([]);
    expect(await readFile(join(root, "table"), "utf8")).toBe("MAILTO=me\n");
  });

  test("opencode jobs run one at a time", async () => {
    const cwd = join(root, "repo");
    const adapter = await connect(cronHarness("opencode"), { cwd, access: "read", model: "m/m" });
    const timing = { minute: 0, hour: 9, weekdays: null };
    await run(adapter.save({ name: "First", timing, prompt: "one" }));
    await run(adapter.save({ name: "Second", timing, prompt: "two" }));
    const jobs = (await run(listJobs)).filter((job) => job.agent === "opencode");
    expect(jobs).toHaveLength(2);

    const codes = await Promise.all(jobs.map((job) => run(runJob(job.id))));
    expect(codes).toEqual([0, 0]);

    const lines = (await readFile(join(cwd, "opencode-runs"), "utf8")).trim().split("\n");
    expect(lines.map((line) => line.split(" ")[0])).toEqual(["start", "end", "start", "end"]);
    for (const job of jobs) {
      await run(removeJob(job));
    }
    // The second run waits a full poll interval before it starts.
  }, 20_000);

  test("a locked OpenCode database is retried", async () => {
    const cwd = join(root, "retry");
    await mkdir(cwd);
    await writeFile(join(cwd, "fail-once"), "");
    const adapter = await connect(cronHarness("opencode"), { cwd, access: "read", model: "m/m" });
    await run(
      adapter.save({ name: "Retry", timing: { minute: 0, hour: 9, weekdays: null }, prompt: "x" }),
    );
    const job = (await run(listJobs)).find((candidate) => candidate.cwd === cwd);

    expect(await run(runJob(job?.id ?? ""))).toBe(0);
    expect((await run(lastRun(job?.id ?? "")))?.outcome).toBe("ok");
    const logs = await readdir(join(root, "state", "jobs", job?.id ?? "", "logs"));
    expect(logs).toHaveLength(2);
    expect(logs.some((name) => name.endsWith("-attempt-2.log"))).toBe(true);

    if (job) {
      await run(removeJob(job));
    }
  }, 20_000);

  test("retries stop after three attempts", async () => {
    const cwd = join(root, "exhausted");
    await mkdir(cwd);
    await writeFile(join(cwd, "fail-always"), "");
    const adapter = await connect(cronHarness("opencode"), { cwd, access: "read", model: "m/m" });
    await run(
      adapter.save({ name: "Stuck", timing: { minute: 0, hour: 9, weekdays: null }, prompt: "x" }),
    );
    const job = (await run(listJobs)).find((candidate) => candidate.cwd === cwd);

    expect(await run(runJob(job?.id ?? ""))).toBe(1);
    expect((await run(lastRun(job?.id ?? "")))?.outcome).toBe("failed");
    expect(await readdir(join(root, "state", "jobs", job?.id ?? "", "logs"))).toHaveLength(3);

    if (job) {
      await run(removeJob(job));
    }
  }, 20_000);

  test("preflight starts the agent without the shell's variables", async () => {
    const cwd = join(root, "preflight");
    await mkdir(cwd);
    const agent = join(root, "bin", "needs-key");
    await writeFile(
      agent,
      `#!/bin/sh\ncat > /dev/null\n[ -n "$PROFILE_ONLY_KEY" ] && exit 0\necho "Missing API key" >&2\nexit 1\n`,
    );
    await chmod(agent, 0o755);
    process.env.PROFILE_ONLY_KEY = "set";

    try {
      expect(await run(preflight("codex", join(root, "bin", "codex"), cwd, undefined))).toEqual({
        outcome: "ok",
      });
      expect(await run(preflight("claude-code", agent, cwd, undefined))).toEqual({
        outcome: "failed",
        detail: "exit 1: Missing API key",
      });
      expect((await run(preflight("opencode", agent, cwd, undefined))).outcome).toBe("skipped");
    } finally {
      delete process.env.PROFILE_ONLY_KEY;
    }
  });

  test("names that share a slug get different jobs", () => {
    expect(jobId("codex", "/repo", "A B")).not.toBe(jobId("codex", "/repo", "A-B"));
    expect(jobId("codex", "/repo", "A B")).toMatch(/^codex-a-b-[0-9a-f]{12}$/);
  });
});
