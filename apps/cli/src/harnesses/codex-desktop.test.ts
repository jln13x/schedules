import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { codexDesktop, fromRrule, toRrule } from "./codex-desktop.ts";
import { connect, run } from "../harness.ts";

test("Codex rules convert both ways", () => {
  const daily = { minute: 0, hour: 9, weekdays: null };
  expect(toRrule(daily)).toBe(
    "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
  );
  expect(fromRrule(toRrule(daily))).toEqual(daily);
  expect(fromRrule("RRULE:FREQ=WEEKLY;BYDAY=SU,TU;BYHOUR=17;BYMINUTE=30")).toEqual({
    minute: 30,
    hour: 17,
    weekdays: [0, 2],
  });
  const monthly = { minute: 0, hour: 9, weekdays: null, monthDay: 1 };
  expect(toRrule(monthly)).toBe("FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0;BYSECOND=0");
  expect(fromRrule("RRULE:FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=9;BYMINUTE=0")).toEqual(monthly);
  expect(typeof fromRrule("FREQ=MONTHLY;BYMONTHDAY=31;BYHOUR=9;BYMINUTE=0")).toBe("string");
  expect(typeof fromRrule("FREQ=MONTHLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0")).toBe("string");
  expect(typeof fromRrule("FREQ=WEEKLY;BYMONTHDAY=1;BYDAY=MO;BYHOUR=9;BYMINUTE=0")).toBe("string");
  expect(typeof fromRrule("FREQ=HOURLY;BYMINUTE=10")).toBe("string");
  expect(typeof fromRrule("FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0")).toBe("string");
  expect(typeof fromRrule("FREQ=DAILY;BYHOUR=;BYMINUTE=0")).toBe("string");
});

test.skipIf(process.platform !== "linux")(
  "Codex confirmation preserves each polling outcome",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-desktop-"));
    const saved = { codexHome: process.env.CODEX_HOME, path: process.env.PATH };
    const bin = join(root, "bin");

    try {
      process.env.CODEX_HOME = root;
      process.env.PATH = bin;
      await mkdir(bin);
      await mkdir(join(root, "sqlite"));
      await writeFile(join(root, "sqlite/codex-dev.db"), "");
      const adapter = await connect(codexDesktop, { cwd: join(root, "repo") });
      const schedule = {
        name: "Audit",
        timing: { minute: 0, hour: 8, weekdays: null },
        prompt: "Audit",
      };
      expect(await run(adapter.save(schedule))).toEqual({
        id: "audit",
        note: "written; install sqlite3 to confirm the Codex app loaded it",
      });
      await writeFile(
        join(bin, "sqlite3"),
        `#!/bin/sh
state_dir="\${0%/*}"
read -r mode < "$state_dir/mode"
read -r count < "$state_dir/count"
printf '%s\\n' "$((count + 1))" > "$state_dir/count"
case "$mode" in
  unreadable) exit 1 ;;
  loaded) printf '%s\\n' '[{"id":"audit"}]' ;;
  delayed) if test "$count" -gt 0; then printf '%s\\n' '[{"id":"audit"}]'; else printf '%s\\n' '[]'; fi ;;
  missing) printf '%s\\n' '[]' ;;
esac
`,
        { mode: 0o755 },
      );

      for (const [mode, note, attempts] of [
        [
          "unreadable",
          "written; couldn't read the Codex app's database to confirm it loaded the task",
          1,
        ],
        ["loaded", "loaded by the Codex app", 1],
        ["delayed", "loaded by the Codex app", 2],
        [
          "missing",
          "written, but the Codex app hasn't loaded it yet; open the app and check Scheduled",
          10,
        ],
      ] as const) {
        await writeFile(join(bin, "mode"), `${mode}\n`);
        await writeFile(join(bin, "count"), "0\n");
        expect((await run(adapter.save(schedule))).note).toBe(note);
        expect(Number(await readFile(join(bin, "count"), "utf8"))).toBe(attempts);
      }
    } finally {
      process.env.CODEX_HOME = saved.codexHome;
      process.env.PATH = saved.path;
      await rm(root, { recursive: true, force: true });
    }
  },
  15_000,
);

test("Codex automations pause, update and remove by id, and shared ones are left to the app", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-desktop-"));
  const saved = { codexHome: process.env.CODEX_HOME };
  const write = (id: string, cwds: ReadonlyArray<string>) =>
    mkdir(join(root, "automations", id), { recursive: true }).then(() =>
      writeFile(
        join(root, "automations", id, "automation.toml"),
        `version = 1\nid = "${id}"\nkind = "cron"\nname = "${id}"\nprompt = "Run ${id}."\nstatus = "ACTIVE"\nrrule = "FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=0"\nexecution_environment = "worktree"\ncwds = [${cwds.map((cwd) => `"${cwd}"`).join(", ")}]\n`,
      ),
    );

  try {
    process.env.CODEX_HOME = root;
    await write("audit", [join(root, "repo")]);
    await write("shared", ["/a", "/b"]);

    const all = await run(codexDesktop.inventory);
    expect(all.find((live) => live.id === "audit")).toMatchObject({
      workspace: join(root, "repo"),
      settings: { kind: "cron", execution_environment: "worktree" },
    });
    expect(all.find((live) => live.id === "shared")).toMatchObject({
      workspace: undefined,
      settings: { workspaces: "/a, /b" },
    });

    await run(codexDesktop.setEnabled?.("audit", false) ?? Effect.succeed(undefined));
    const adapter = await connect(codexDesktop, { cwd: join(root, "repo") });
    await run(
      adapter.save(
        { name: "Renamed", timing: { minute: 0, hour: 9, weekdays: null }, prompt: "Run it." },
        "audit",
      ),
    );
    const record = await readFile(join(root, "automations/audit/automation.toml"), "utf8");
    // Renamed and rescheduled, still paused, still in its worktree.
    expect(record).toContain('name = "Renamed"');
    expect(record).toContain('status = "PAUSED"');
    expect(record).toContain('execution_environment = "worktree"');

    expect(run(codexDesktop.remove?.("shared") ?? Effect.succeed(undefined))).rejects.toThrow(
      "shared by 2",
    );
    await run(codexDesktop.remove?.("audit") ?? Effect.succeed(undefined));
    expect((await run(codexDesktop.inventory)).map((live) => live.id)).toEqual(["shared"]);
  } finally {
    process.env.CODEX_HOME = saved.codexHome;
    await rm(root, { recursive: true, force: true });
  }
});
