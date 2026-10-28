import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Console,
  Data,
  type Duration,
  Effect,
  FileSystem,
  Option,
  Predicate,
  Result,
  Schedule,
  Schema,
  Stream,
} from "effect";
import { ChildProcess } from "effect/process";
import {
  execRaw,
  fail,
  listDirectory,
  makeDirectory,
  readJson,
  readText,
  removePath,
  writeJsonAtomic,
} from "../../harness.ts";
import { slug } from "../../schedule.ts";
import { AGENTS, COMMAND_LINE_AGENTS, type CommandLineAgent } from "../agents.ts";
import { ACCESS } from "./agent.ts";

const TIMEOUT = "1 hour";
const KEEP_LOGS = 20;
// A run that never stops printing would otherwise fill the disk before its timeout.
const LOG_CAP_BYTES = 10 * 1024 * 1024;
// How long a run waits for another run of the same agent to finish, for agents that can't overlap.
const QUEUE_WAIT = "30 minutes";
const QUEUE_POLL = "5 seconds";
const ATTEMPTS = 3;
const retryDelayMs = () => Number(process.env.AGENT_SCHEDULES_RETRY_DELAY_MS ?? 15_000);
// Longer than a queue wait plus every attempt, so a lock this old was left behind by a crash.
const STALE_RUN_LOCK_MS = 4 * 60 * 60 * 1000;
// Prompts and logs can hold anything the agent was told or printed.
const PRIVATE = 0o700;

export const runnerHome = () =>
  process.env.AGENT_SCHEDULES_HOME ??
  (process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/agent-schedules")
    : join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "agent-schedules"));

export const jobSchema = Schema.Struct({
  id: Schema.String,
  agent: Schema.Literals(COMMAND_LINE_AGENTS),
  name: Schema.String,
  cwd: Schema.String,
  schedule: Schema.String,
  access: Schema.Literals(ACCESS),
  model: Schema.optionalKey(Schema.String),
  binary: Schema.String,
  // The PATH at push time: cron starts jobs with a bare one.
  path: Schema.String,
  updatedAt: Schema.String,
});
export type Job = typeof jobSchema.Type;

const lastRunSchema = Schema.Struct({
  startedAt: Schema.String,
  finishedAt: Schema.String,
  outcome: Schema.Literals(["ok", "failed", "timeout"]),
  exitCode: Schema.NullOr(Schema.Number),
  log: Schema.String,
});
type LastRun = typeof lastRunSchema.Type;

export const jobDir = (id: string) => join(runnerHome(), "jobs", id);
export const promptPath = (id: string) => join(jobDir(id), "prompt.md");

// The name is hashed too, since different names can share a slug.
export const jobId = (agent: CommandLineAgent, cwd: string, name: string) =>
  `${agent}-${slug(name)}-${createHash("sha256").update(`${cwd}\0${name}`).digest("hex").slice(0, 12)}`;

/** Every job this CLI has scheduled on this machine, for any repository. */
export const listJobs = Effect.gen(function* () {
  const jobs: Array<Job> = [];
  for (const id of yield* listDirectory(join(runnerHome(), "jobs"))) {
    const job = yield* readJson(join(jobDir(id), "job.json"), jobSchema).pipe(
      Effect.tapError((error) => Console.error(`skipping job ${id}: ${error.message}`)),
      Effect.option,
    );

    if (Option.isSome(job)) {
      jobs.push(job.value);
    }
  }
  return jobs as ReadonlyArray<Job>;
});

export const lastRun = (id: string) =>
  readJson(join(jobDir(id), "last.json"), lastRunSchema).pipe(
    Effect.map((run): LastRun | undefined => run),
    Effect.orElseSucceed(() => undefined),
  );

// Locks ---------------------------------------------------------------------------------------------

const lockAge = (lock: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const modified = Option.flatMap(yield* fs.stat(lock).pipe(Effect.option), (stat) => stat.mtime);
    return Option.isSome(modified) ? Date.now() - modified.value.getTime() : 0;
  });

// How long reclaiming a stale lock may take before its guard is itself considered abandoned.
const RECLAIM_MS = 60_000;

/** Takes a directory lock, treating one older than staleMs as left behind by a crash. */
const tryLock = (
  lock: string,
  staleMs: number,
  retry = true,
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const take = (path: string) =>
      fs.makeDirectory(path).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );

    if (yield* take(lock)) {
      return true;
    }

    if ((yield* lockAge(lock)) < staleMs) {
      return false;
    }

    // Only one contender reclaims at a time, and it checks again under the guard, so a lock that
    // another run has just taken fresh is never mistaken for the stale one it saw before.
    const guard = `${lock}.reclaim`;

    if (!(yield* take(guard))) {
      if (retry && (yield* lockAge(guard)) >= RECLAIM_MS) {
        yield* removePath(guard).pipe(Effect.ignore);
        return yield* tryLock(lock, staleMs, false);
      }

      return false;
    }

    return yield* Effect.gen(function* () {
      if ((yield* lockAge(lock)) < staleMs) {
        return false;
      }

      yield* removePath(lock).pipe(Effect.ignore);
      return yield* take(lock);
    }).pipe(Effect.ensuring(removePath(guard).pipe(Effect.ignore)));
  });

/** Holds a lock until the scope closes; false when another process has it. */
const holdLock = (lock: string, staleMs: number) =>
  Effect.acquireRelease(tryLock(lock, staleMs), (held) =>
    held ? removePath(lock).pipe(Effect.ignore) : Effect.void,
  );

/** Like holdLock, but keeps trying for a while before giving up. */
const waitForLock = (lock: string, staleMs: number, wait: Duration.Input) =>
  holdLock(lock, staleMs).pipe(
    Effect.repeat({ until: (held) => held, schedule: Schedule.spaced(QUEUE_POLL) }),
    Effect.timeoutOption(wait),
    Effect.map(Option.getOrElse(() => false)),
  );

const locksDir = () => join(runnerHome(), "locks");

/** Runs an effect while holding a named lock, so two CLI processes don't edit one store at once. */
export const withLock = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* makeDirectory(locksDir(), PRIVATE);

      if (!(yield* waitForLock(join(locksDir(), name), 60_000, "30 seconds"))) {
        return yield* fail(`another agent-schedules process is still using ${name}; try again`);
      }

      return yield* effect;
    }),
  );

// Running ------------------------------------------------------------------------------------------

interface Run {
  readonly outcome: "ok" | "failed" | "timeout";
  readonly exitCode: number | null;
  readonly output: string;
  readonly log: string;
}

class RetryableRun extends Data.TaggedError("RetryableRun")<{ readonly run: Run }> {}

const execute = (job: Job, prompt: string, log: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spec = AGENTS[job.agent];
    const invocation = spec.invoke(prompt, job.access, job.model);
    const decoder = new TextDecoder();
    const stdoutDecoder = new TextDecoder();
    let output = "";
    let carry = "";
    let failed = false;
    let logged = 0;

    const run = Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* ChildProcess.make(job.binary, invocation.args, {
          cwd: job.cwd,
          // A PWD inherited from whoever started the run would point some agents, OpenCode among
          // them, at that folder instead of the repo.
          env: { PATH: job.path, PWD: job.cwd, ...invocation.env },
          extendEnv: true,
          // Closed when there is no prompt to send, so nothing waits for input.
          stdin:
            invocation.stdin === undefined
              ? "ignore"
              : Stream.make(new TextEncoder().encode(invocation.stdin)),
          killSignal: "SIGTERM",
          forceKillAfter: "10 seconds",
        });
        // Checked as it arrives, so an error early in a long run isn't lost to the cap, and on
        // stdout alone, so a stderr line can't land in the middle of one of its lines.
        const stdout = handle.stdout.pipe(
          Stream.tap((chunk) =>
            Effect.sync(() => {
              if (spec.failed) {
                const lines = (carry + stdoutDecoder.decode(chunk, { stream: true })).split("\n");
                carry = lines.pop() ?? "";
                failed ||= spec.failed(lines.join("\n"));
              }
            }),
          ),
        );
        const drain = Stream.merge(stdout, handle.stderr).pipe(
          Stream.tap((chunk) =>
            Effect.sync(() => {
              output = (output + decoder.decode(chunk, { stream: true })).slice(-1_000_000);
            }),
          ),
          Stream.filter((chunk) => (logged += chunk.byteLength) <= LOG_CAP_BYTES),
          Stream.run(fs.sink(log, { mode: 0o600 })),
        );
        const [, exitCode] = yield* Effect.all([drain, handle.exitCode], {
          concurrency: "unbounded",
        });
        return Number(exitCode);
      }),
    );

    const result = yield* run.pipe(Effect.timeoutOption(TIMEOUT), Effect.result);

    if (logged > LOG_CAP_BYTES) {
      yield* fs
        .writeFileString(log, `\n[log cut off after ${LOG_CAP_BYTES} bytes]\n`, { flag: "a" })
        .pipe(Effect.ignore);
    }

    if (Result.isFailure(result)) {
      yield* fs
        .writeFileString(log, `\n${result.failure.message}\n`, { flag: "a" })
        .pipe(Effect.ignore);
      return { outcome: "failed", exitCode: null, output, log } satisfies Run;
    }

    if (Option.isNone(result.success)) {
      return { outcome: "timeout", exitCode: null, output, log } satisfies Run;
    }

    failed ||= spec.failed?.(carry) ?? false;
    const exitCode = result.success.value;
    const outcome: Run["outcome"] = exitCode === 0 && !failed ? "ok" : "failed";
    return { outcome, exitCode, output, log };
  });

const PREFLIGHT_PROMPT = "Reply with the single word ok.";
const PREFLIGHT_TIMEOUT = "2 minutes";

interface Preflight {
  readonly outcome: "ok" | "skipped" | "failed";
  readonly detail?: string;
}
const skipped = (detail: string): Preflight => ({ outcome: "skipped", detail });
const failed = (detail: string): Preflight => ({ outcome: "failed", detail });

/**
 * Runs the agent once with a short read-only prompt, started the way cron starts it: from the
 * repository, with the PATH a push saves and none of the shell profile's variables. A missing login
 * or an API key only the profile sets shows up now rather than at the first scheduled run.
 */
export const preflight = (
  agent: CommandLineAgent,
  binary: string,
  cwd: string,
  model: string | undefined,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spec = AGENTS[agent];

      if (spec.requiresModel && !model) {
        return skipped("until a push sets --model");
      }

      // Running beside a scheduled run would trip the agent's own lock, and maybe fail that run.
      if (spec.oneAtATime) {
        yield* makeDirectory(locksDir(), PRIVATE);

        if (!(yield* waitForLock(join(locksDir(), agent), STALE_RUN_LOCK_MS, "30 seconds"))) {
          return skipped(`a scheduled ${spec.label} run is still going`);
        }
      }

      const invocation = spec.invoke(PREFLIGHT_PROMPT, "read", model);
      const result = yield* execRaw(binary, invocation.args, {
        cwd,
        env: {
          HOME: process.env.HOME,
          USER: process.env.USER,
          LOGNAME: process.env.LOGNAME ?? process.env.USER,
          SHELL: "/bin/sh",
          PATH: process.env.PATH,
          PWD: cwd,
          ...invocation.env,
        },
        extendEnv: false,
        input: invocation.stdin,
      }).pipe(Effect.timeoutOption(PREFLIGHT_TIMEOUT));

      if (Option.isNone(result)) {
        return failed(`no answer within ${PREFLIGHT_TIMEOUT}`);
      }

      const { exitCode, stdout, stderr } = result.value;

      if (exitCode === 0 && !spec.failed?.(stdout)) {
        return { outcome: "ok" } satisfies Preflight;
      }

      const last = `${stdout}\n${stderr}`.trim().split("\n").at(-1)?.trim().slice(0, 200);
      return failed(`exit ${exitCode}${last ? `: ${last}` : ""}`);
    }),
  ).pipe(Effect.catchTag("HarnessError", (error) => Effect.succeed(failed(error.message))));

export const runJob = (id: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const dir = jobDir(id);
      const job = yield* readJson(join(dir, "job.json"), jobSchema);
      const prompt = yield* readText(promptPath(id));
      const spec = AGENTS[job.agent];

      // An earlier run of this job that hasn't finished keeps this one from starting.
      if (!(yield* holdLock(join(dir, "lock"), STALE_RUN_LOCK_MS))) {
        return 0;
      }

      // Some agents can't run twice at once, so their jobs queue behind one shared lock.
      if (spec.oneAtATime) {
        yield* makeDirectory(locksDir(), PRIVATE);

        if (!(yield* waitForLock(join(locksDir(), job.agent), STALE_RUN_LOCK_MS, QUEUE_WAIT))) {
          return 1;
        }
      }

      const startedAt = new Date();
      const logs = join(dir, "logs");
      const stamp = startedAt.toISOString().replaceAll(":", "-");
      yield* makeDirectory(logs, PRIVATE);
      let attempt = 0;
      const run = yield* Effect.gen(function* () {
        attempt += 1;
        const log = join(logs, attempt === 1 ? `${stamp}.log` : `${stamp}-attempt-${attempt}.log`);
        const result = yield* execute(job, prompt, log);
        return result.outcome === "failed" && spec.retryable?.(result.output)
          ? yield* Effect.fail(new RetryableRun({ run: result }))
          : result;
      }).pipe(
        Effect.retry({
          while: Predicate.isTagged("RetryableRun"),
          times: ATTEMPTS - 1,
          schedule: Schedule.spaced(retryDelayMs()),
        }),
        Effect.catchTag("RetryableRun", (error) => Effect.succeed(error.run)),
      );
      yield* writeJsonAtomic(join(dir, "last.json"), {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        outcome: run.outcome,
        exitCode: run.exitCode,
        log: run.log,
      } satisfies LastRun);
      const old = (yield* listDirectory(logs)).toSorted().slice(0, -KEEP_LOGS);
      yield* Effect.forEach(old, (name) => removePath(join(logs, name)));
      return run.outcome === "ok" ? 0 : 1;
    }),
  );
