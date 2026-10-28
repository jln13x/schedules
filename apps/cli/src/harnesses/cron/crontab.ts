import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { Effect, FileSystem } from "effect";
import {
  HarnessError,
  exec,
  execRaw,
  fail,
  findOnPath,
  makeDirectory,
  removePath,
} from "../../harness.ts";
import { type Job, runnerHome, withLock } from "./jobs.ts";

const CRON_TAG = "# agent-schedules ";
// An override is how tests and the sandbox keep the real crontab out of it.
const crontabOverride = () => process.env.AGENT_SCHEDULES_CRONTAB;
const crontabCommand = () => crontabOverride() ?? "crontab";
const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** The tag and entry lines for a job; cron reads an unescaped % as a newline. */
export const cronLines = (job: Job, command: ReadonlyArray<string>) => [
  `${CRON_TAG}${job.id}`,
  `${job.schedule} ${command.map(shellQuote).join(" ").replaceAll("%", "\\%")}`,
];

export function withoutCronJob(lines: ReadonlyArray<string>, id: string): Array<string> {
  const kept: Array<string> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] === `${CRON_TAG}${id}`) {
      index += 1;
      continue;
    }

    kept.push(lines[index] ?? "");
  }
  return kept;
}

const readCrontab = Effect.gen(function* () {
  const { exitCode, stdout, stderr } = yield* execRaw(crontabCommand(), ["-l"]);

  if (exitCode !== 0) {
    return /no crontab/i.test(stderr)
      ? []
      : yield* fail(`crontab -l failed: ${stderr.trim() || `exit code ${exitCode}`}`);
  }

  const lines = stdout.split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
});

const writeCrontab = (lines: ReadonlyArray<string>) =>
  exec(crontabCommand(), ["-"], { input: lines.length === 0 ? "" : `${lines.join("\n")}\n` });

/** Why runs can't be scheduled on this machine, or undefined when cron is there to run them. */
export const cronMissing = Effect.gen(function* () {
  if (crontabOverride()) {
    return undefined;
  }

  if (process.platform === "win32") {
    return "scheduled runs need cron, on macOS or Linux";
  }

  return (yield* findOnPath("crontab"))
    ? undefined
    : "cron isn't installed; install a cron daemon, such as cronie, to schedule runs";
});

// Two pushes editing the crontab at once would each drop the other's entry.
export const installCronJob = (job: Job, command: ReadonlyArray<string>) =>
  withLock(
    "crontab",
    // cron pairs a backslash with a following %, so a path holding both can't be escaped.
    command.some((part) => part.includes("\\"))
      ? fail("cron can't run a command from a path containing a backslash")
      : readCrontab.pipe(
          Effect.flatMap((lines) =>
            writeCrontab([...withoutCronJob(lines, job.id), ...cronLines(job, command)]),
          ),
        ),
  );

export const removeCronJob = (id: string) =>
  withLock(
    "crontab",
    readCrontab.pipe(Effect.flatMap((lines) => writeCrontab(withoutCronJob(lines, id)))),
  );

/** Which jobs the crontab actually has, so a job missing from it can be flagged. */
export const cronJobIds = readCrontab.pipe(
  Effect.map(
    (lines) =>
      new Set(
        lines
          .filter((line) => line.startsWith(CRON_TAG))
          .map((line) => line.slice(CRON_TAG.length)),
      ),
  ),
);

/**
 * What cron runs: this CLI's `run` command. A copy keeps it working after npx cleans its cache, and
 * the state folder is spelled out because cron starts jobs with almost no environment.
 */
export const runCommand = (id: string) =>
  Effect.gen(function* () {
    // npm's bin entry is a symlink to the bundle; the copy below needs the bundle itself.
    const script = realpathSync(resolve(process.argv[1] ?? ""));
    const args = ["run", id, "--home", runnerHome()];

    if (!/\.[cm]?js$/.test(script)) {
      return [process.execPath, script, ...args];
    }

    const fs = yield* FileSystem.FileSystem;
    const copy = join(runnerHome(), "agent-schedules.mjs");
    yield* makeDirectory(runnerHome(), 0o700);
    // Replaced rather than overwritten, so a link planted at that name can't redirect the copy.
    yield* removePath(copy);
    yield* fs
      .copyFile(script, copy)
      .pipe(
        Effect.mapError(
          (error) =>
            new HarnessError({ message: `copy ${script}: ${error.message}`, cause: error }),
        ),
      );
    return [process.execPath, copy, ...args];
  });
