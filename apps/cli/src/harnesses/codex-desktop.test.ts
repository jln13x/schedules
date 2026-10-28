import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      expect(await run(adapter.save(schedule))).toBe(
        "written; install sqlite3 to confirm the Codex app loaded it",
      );
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
        expect(await run(adapter.save(schedule))).toBe(note);
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
