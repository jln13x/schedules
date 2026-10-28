import { isAbsolute, join, resolve } from "node:path";
import { Effect, Layer, Option } from "effect";
import {
  type HarnessDefinition,
  type LiveSchedule,
  type Platform,
  Harness,
  Workspace,
  execRaw,
  fail,
  findOnPath,
  makeDirectory,
  readJson,
  readText,
  removePath,
  writeJsonAtomic,
  writeText,
} from "../../harness.ts";
import { type Schedule, describeTiming, formatCron, timingFromCron } from "../../schedule.ts";
import { AGENTS, type CommandLineAgent } from "../agents.ts";
import {
  type Job,
  jobDir,
  jobId,
  jobSchema,
  lastRun,
  listJobs,
  preflight,
  promptPath,
  runnerHome,
} from "./jobs.ts";
import { cronJobIds, cronMissing, installCronJob, removeCronJob, runCommand } from "./crontab.ts";
import { verifiedLine } from "../verified.ts";

export { ACCESS, type Access } from "./agent.ts";
export { type Job, listJobs, runJob } from "./jobs.ts";

/** The jobs in the crontab, or undefined when there is no cron to ask. */
const scheduledIds = cronMissing.pipe(
  Effect.flatMap((missing) => (missing ? Effect.succeed(undefined) : cronJobIds)),
);

const toLive = (job: Job, installed: Set<string> | undefined) =>
  Effect.gen(function* () {
    const timing = timingFromCron(job.schedule);
    const last = yield* lastRun(job.id);
    const base = {
      name: job.name,
      status: installed?.has(job.id) === false ? "not scheduled" : "active",
      lastRun: last && { at: new Date(last.finishedAt), outcome: last.outcome },
      model: job.model,
      access: job.access,
    } as const;
    return typeof timing === "string"
      ? ({ ...base, unsupported: timing } satisfies LiveSchedule)
      : ({
          ...base,
          schedule: { name: job.name, timing, prompt: yield* readText(promptPath(job.id)) },
        } satisfies LiveSchedule);
  });

const findBinary = (agent: CommandLineAgent) =>
  Effect.gen(function* () {
    for (const name of AGENTS[agent].binaries) {
      const found = yield* findOnPath(name);

      if (found) {
        return found;
      }
    }

    return undefined;
  });

const notOnPath = (agent: CommandLineAgent) => {
  const { label, binaries, setup } = AGENTS[agent];
  return `${binaries[0]} isn't on PATH; set up ${label} first: ${setup}`;
};

function makeHarness(agent: CommandLineAgent) {
  const spec = AGENTS[agent];
  return Effect.gen(function* () {
    const { cwd, model: requested, access } = yield* Workspace;
    const services = yield* Effect.context<Platform>();
    const mine = listJobs.pipe(
      Effect.map((jobs) => jobs.filter((job) => job.agent === agent && job.cwd === cwd)),
    );
    const missing = yield* cronMissing;
    const binary = yield* findBinary(agent);

    const save = Effect.fn(function* (schedule: Schedule) {
      if (missing) {
        return yield* fail(missing);
      }

      if (!binary) {
        return yield* fail(notOnPath(agent));
      }

      const existing = (yield* mine).find((job) => job.name === schedule.name);
      const id = existing?.id ?? jobId(agent, cwd, schedule.name);
      const model = requested ?? existing?.model;
      const home = runnerHome();
      // These land in crontab lines, where a line break starts a new entry.
      for (const [what, value] of [
        ["the repository path", cwd],
        [`the ${agent} path`, binary],
        ["PATH", process.env.PATH ?? ""],
        ["the state folder", home],
      ] as const) {
        if (/\p{Cc}/u.test(value)) {
          return yield* fail(`${what} contains a control character, which cron can't run`);
        }
      }

      if (!existing) {
        const other = yield* readJson(join(jobDir(id), "job.json"), jobSchema).pipe(Effect.option);

        if (Option.isSome(other)) {
          return yield* fail(
            `"${schedule.name}" would share its job with "${other.value.name}" in ${other.value.cwd}; rename it`,
          );
        }
      }
      const job: Job = {
        id,
        agent,
        name: schedule.name,
        cwd,
        schedule: formatCron(schedule.timing),
        access: access ?? existing?.access ?? "read",
        ...(model === undefined ? {} : { model }),
        binary: isAbsolute(binary) ? binary : resolve(binary),
        path: process.env.PATH ?? "",
        updatedAt: new Date().toISOString(),
      };
      // cron goes first: if it refuses, the saved state still describes what it runs.
      yield* installCronJob(job, yield* runCommand(id));
      // Prompts and logs can hold anything the agent was told or printed, so they stay private.
      yield* makeDirectory(jobDir(id), 0o700);
      yield* writeText(promptPath(id), schedule.prompt, 0o600);
      yield* writeJsonAtomic(join(jobDir(id), "job.json"), job);
      const limit = spec.limits?.[job.access];
      return `${describeTiming(schedule.timing)} via cron, ${job.access} access${limit ? ` (${limit})` : ""}`;
    });

    const check = Effect.fn(function* (schedule: Schedule) {
      if (missing) {
        return missing;
      }

      if (!binary) {
        return notOnPath(agent);
      }

      const existing = (yield* mine).find((job) => job.name === schedule.name);
      return spec.requiresModel && !requested && !existing?.model
        ? `${spec.label} needs --model provider/model, or it falls back to a free hosted model`
        : undefined;
    });

    return Harness.of({
      caveat: `${spec.label} runs from cron, with the access set by --access (read unless you choose). It can't see API keys that only your shell profile sets.`,
      setup: [],
      list: Effect.gen(function* () {
        const installed = yield* scheduledIds;
        return yield* Effect.forEach(yield* mine, (job) => toLive(job, installed));
      }).pipe(Effect.provideContext(services)),
      check: (schedule) => check(schedule).pipe(Effect.provideContext(services)),
      save: (schedule) => save(schedule).pipe(Effect.provideContext(services)),
    });
  });
}

/** Removes a job from the crontab and deletes its prompt, settings, and logs. */
export const removeJob = (job: Job) =>
  Effect.gen(function* () {
    if (!(yield* cronMissing)) {
      yield* removeCronJob(job.id);
    }

    yield* removePath(jobDir(job.id));
  });

function doctor(agent: CommandLineAgent) {
  const spec = AGENTS[agent];
  return Effect.gen(function* () {
    const { cwd } = yield* Workspace;
    const binary = yield* findBinary(agent);
    const missing = yield* cronMissing;
    const version = binary
      ? yield* execRaw(binary, ["--version"]).pipe(
          Effect.timeoutOption("15 seconds"),
          Effect.map((result) =>
            Option.isSome(result) ? result.value.stdout.trim().split("\n").at(-1) : undefined,
          ),
          Effect.orElseSucceed(() => undefined),
        )
      : undefined;
    const jobs = (yield* listJobs).filter((job) => job.agent === agent && job.cwd === cwd);
    const installed = yield* scheduledIds;
    const ready = binary
      ? yield* preflight(agent, binary, cwd, jobs.find((job) => job.model)?.model)
      : undefined;
    const lines = [
      binary
        ? `${spec.label}: ${binary}${version ? ` (${version})` : ""}`
        : `${spec.label}: not ready, ${notOnPath(agent)}`,
      ...(binary ? [verifiedLine(agent, version)] : []),
      ...(ready === undefined
        ? []
        : [
            ready.outcome === "failed"
              ? `preflight: failed, ${ready.detail}; scheduled runs will fail the same way. They see none of your shell profile's variables, so sign in with the agent itself`
              : `preflight: ${ready.outcome}${ready.detail ? `, ${ready.detail}` : ""}`,
          ]),
      `cron: ${missing ?? "ready"}`,
      `jobs: ${jobs.length} for ${cwd}, stored in ${runnerHome()}`,
    ];
    for (const job of jobs) {
      const last = yield* lastRun(job.id);
      const scheduled = installed?.has(job.id) === false ? ", missing from the crontab" : "";
      lines.push(
        `${job.name}: ${job.access} access${scheduled}, last run ${last ? `${last.outcome} at ${last.finishedAt}` : "never"}`,
      );
    }
    return lines as ReadonlyArray<string>;
  });
}

export const cronHarness = (agent: CommandLineAgent): HarnessDefinition => ({
  layer: Layer.effect(Harness, makeHarness(agent)),
  doctor: doctor(agent),
});
