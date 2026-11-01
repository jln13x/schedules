import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { isCancel, multiselect } from "@clack/prompts";
import { Effect } from "effect";
import { type LiveSchedule, connect as connectHarness, run } from "./harness.ts";
import {
  type Access,
  COMMAND_LINE_AGENTS,
  DEFINITIONS,
  type HarnessName,
  isCommandLine,
} from "./harnesses/index.ts";
import { display, location } from "./location.ts";
import { type Registration, readRegistrations, register, scheduleHash } from "./registrations.ts";
import { createReport, matching } from "./report.ts";
import {
  type Schedule,
  type ScheduleFile,
  describeTiming,
  readSchedules,
  sameSchedule,
  schedulePath,
  writeSchedule,
} from "./schedule.ts";

export interface SyncOptions {
  readonly global: boolean;
  readonly dryRun: boolean;
  readonly all: boolean;
  readonly model?: string;
  readonly access?: Access;
  /** Pull only: bind the files it writes to their tasks, so later pushes update those tasks. */
  readonly adopt?: boolean;
  /** Push only: replace a task even when it was changed in the scheduler since the last push. */
  readonly force?: boolean;
}

/** A file and the task it drives; recorded after a push, and after a pull that adopts. */
interface Binding {
  readonly id: string;
  readonly source: string;
  readonly schedule: Schedule;
}

export type Plan =
  | {
      readonly name: string;
      readonly action: "create" | "update" | "recreate";
      readonly schedule: Schedule;
      /** Push: the task to update, when there is one. Pull: the task the file comes from. */
      readonly id?: string | undefined;
      /** Push: the file. Pull: where the file goes, when it has a place already. */
      readonly source?: string | undefined;
      /** Pull: whether to record the binding. Push always does. */
      readonly bind?: boolean;
      readonly reason?: string;
    }
  | { readonly name: string; readonly action: "unchanged"; readonly bind?: Binding | undefined }
  | { readonly name: string; readonly action: "skip"; readonly reason: string }
  | { readonly name: string; readonly action: "conflict"; readonly reason: string };

// Registrations name the file a task was pushed from. Every checkout of a repository shares the
// task, so a file is matched by its name within the schedules folder, not its full path.
const sameFile = (registration: Registration, path: string) =>
  basename(registration.source) === basename(path);

const sharedNames = (live: ReadonlyArray<LiveSchedule>) =>
  new Set(
    live.map((task) => task.name).filter((name, index, names) => names.indexOf(name) !== index),
  );

interface PlanInput {
  readonly harness: string;
  readonly files: ReadonlyArray<ScheduleFile>;
  readonly live: ReadonlyArray<LiveSchedule>;
  /** This harness's registrations for this workspace. */
  readonly registrations: ReadonlyArray<Registration>;
}

/**
 * What a push does with each file. A file pushed before updates its task by id, whatever either is
 * called now. Otherwise the task with its name is taken over, as long as no other file drives it.
 */
export function planPush({
  harness,
  files,
  live,
  registrations,
  model,
  access,
  force = false,
}: PlanInput & Pick<SyncOptions, "model" | "access" | "force">): ReadonlyArray<Plan> {
  const shared = sharedNames(live);
  return files.map(({ path, schedule }): Plan => {
    const { name } = schedule;
    const registration = registrations.find((candidate) => sameFile(candidate, path));
    const registered = registration && live.find((task) => task.id === registration.nativeId);

    if (registration && !registered) {
      return {
        name,
        action: "recreate",
        schedule,
        source: path,
        reason: `its ${harness} task is gone`,
      };
    }

    let task = registered;

    if (!task) {
      if (shared.has(name)) {
        return { name, action: "conflict", reason: `several ${harness} tasks share this name` };
      }

      task = live.find((candidate) => candidate.name === name);
      const owner = task && registrations.find((candidate) => candidate.nativeId === task?.id);

      if (owner && existsSync(owner.source)) {
        return {
          name,
          action: "conflict",
          reason: `its ${harness} task is pushed from ${display(owner.source)}`,
        };
      }
    }

    if (!task) {
      return { name, action: "create", schedule, source: path };
    }

    if ("unsupported" in task) {
      return registration && force
        ? { name, action: "update", schedule, id: task.id, source: path }
        : {
            name,
            action: "conflict",
            reason: registration
              ? `its ${harness} task was changed to something a file can't hold (${task.unsupported}); push --force to replace it`
              : `the ${harness} task is not managed: ${task.unsupported}`,
          };
    }

    const settled =
      task.status !== "not scheduled" &&
      (access === undefined || task.access === access) &&
      (model === undefined || task.model === model);

    if (settled && sameSchedule(task.schedule, schedule)) {
      return { name, action: "unchanged", bind: { id: task.id, source: path, schedule } };
    }

    if (
      registration &&
      !force &&
      !sameSchedule(task.schedule, schedule) &&
      scheduleHash(task.schedule) !== registration.pushed
    ) {
      return {
        name,
        action: "conflict",
        reason: `changed in ${harness} since the last push; pull to keep that change, or push --force to replace it`,
      };
    }

    return { name, action: "update", schedule, id: task.id, source: path };
  });
}

/**
 * What a pull does with each task. A task with a file bound to it writes that file, renamed or
 * not; one without writes the file of its name. A bound task gone from the scheduler is reported.
 */
export function planPull({
  harness,
  files,
  live,
  registrations,
  adopt = false,
}: PlanInput & Pick<SyncOptions, "adopt">): ReadonlyArray<Plan> {
  const shared = sharedNames(live);
  const plans = live.map((task): Plan => {
    const registration = registrations.find((candidate) => candidate.nativeId === task.id);

    if (!registration && shared.has(task.name)) {
      return {
        name: task.name,
        action: "conflict",
        reason: `several ${harness} tasks share this name`,
      };
    }

    if ("unsupported" in task) {
      return { name: task.name, action: "skip", reason: task.unsupported };
    }

    const file = registration
      ? files.find((candidate) => sameFile(registration, candidate.path))
      : files.find((candidate) => candidate.schedule.name === task.name);
    const clash = files.find(
      (candidate) => candidate !== file && candidate.schedule.name === task.name,
    );

    if (clash) {
      return {
        name: task.name,
        action: "conflict",
        reason: `${display(clash.path)} already holds "${task.name}"`,
      };
    }

    const owner =
      file &&
      !registration &&
      registrations.find(
        (candidate) => sameFile(candidate, file.path) && candidate.nativeId !== task.id,
      );

    if (owner) {
      return {
        name: task.name,
        action: "conflict",
        reason: `${display(file.path)} is pushed to another ${harness} task`,
      };
    }

    const bind = adopt || registration !== undefined;
    // The harness doesn't know which skill the prompt runs; the file still does.
    const schedule = { ...task.schedule, skill: file?.schedule.skill };

    if (file && sameSchedule(file.schedule, schedule)) {
      return {
        name: task.name,
        action: "unchanged",
        bind: bind ? { id: task.id, source: file.path, schedule } : undefined,
      };
    }

    return {
      name: task.name,
      action: file ? "update" : "create",
      schedule,
      id: task.id,
      source: file?.path ?? (registration && basename(registration.source)),
      bind,
    };
  });
  const missing = registrations
    .filter((registration) => !live.some((task) => task.id === registration.nativeId))
    .map((registration): Plan => ({
      name: registration.name,
      action: "skip",
      reason: `missing from ${harness}; push recreates it, remove forgets it`,
    }));
  return [...plans, ...missing];
}

async function choose(
  command: "pull" | "push",
  plans: ReadonlyArray<Plan>,
  names: ReadonlyArray<string>,
  { all, dryRun }: SyncOptions,
): Promise<ReadonlyArray<Plan>> {
  if (names.length > 0) {
    const named = names.map((query) => [query, matching(query, plans)] as const);
    const unknown = named.filter(([, found]) => found.length === 0).map(([query]) => query);

    if (unknown.length > 0) {
      throw new Error(`no schedule named ${unknown.join(", ")}`);
    }

    return plans.filter((plan) => named.some(([, found]) => found.includes(plan)));
  }

  const changes = plans.filter((plan) => "schedule" in plan);

  if (all || dryRun || changes.length === 0) {
    return plans;
  }

  if (!process.stdin.isTTY) {
    throw new Error(`no terminal to ask which schedules to ${command}; pass --all or their names`);
  }

  const picked = await multiselect({
    message: `Which schedules should ${command} ${command === "push" ? "send" : "write"}?`,
    options: changes.map((plan) => ({
      value: plan.name,
      label: plan.name,
      hint: `${{ create: "new", update: "changed", recreate: "missing" }[plan.action as "create"]}, ${"schedule" in plan ? describeTiming(plan.schedule.timing) : ""}`,
    })),
    initialValues: changes.map((plan) => plan.name),
    required: false,
  });

  if (isCancel(picked)) {
    console.log("Cancelled.");
    process.exit(0);
  }

  return plans.filter((plan) => !("schedule" in plan) || picked.includes(plan.name));
}

export async function sync(
  command: "pull" | "push",
  harness: HarnessName,
  names: ReadonlyArray<string>,
  options: SyncOptions,
) {
  if (options.model !== undefined && harness !== "t3" && !isCommandLine(harness)) {
    throw new Error(`--model isn't supported for ${harness}; the app uses its own default`);
  }

  if (options.access !== undefined && !isCommandLine(harness)) {
    throw new Error(
      `--access is for ${COMMAND_LINE_AGENTS.join(", ")}; ${harness} runs tasks itself`,
    );
  }

  const { cwd, dir } = await location(options.global);
  const files = await readSchedules(dir);
  const report = createReport();
  const adapter = await connectHarness(DEFINITIONS[harness], {
    cwd,
    model: options.model,
    access: options.access,
  });
  const live = await Effect.runPromise(adapter.list);
  const registrations = (await run(readRegistrations)).filter(
    (registration) => registration.harness === harness && registration.workspace === cwd,
  );
  const input = { harness, files, live, registrations };
  const plans =
    command === "pull" ? planPull({ ...input, ...options }) : planPush({ ...input, ...options });
  const chosen = await choose(command, plans, names, options);
  const record = (binding: Binding) =>
    options.dryRun
      ? Promise.resolve()
      : run(
          register({
            harness,
            nativeId: binding.id,
            workspace: cwd,
            source: binding.source,
            name: binding.schedule.name,
            schedule: binding.schedule,
          }),
        );
  // Includes files created during this run, so two names with the same slug cannot share a file.
  const written: Array<ScheduleFile> = [...files];
  let prepared = false;
  for (const plan of chosen) {
    if (plan.action === "unchanged") {
      report.unchanged();

      // Refreshes what was last pushed, and binds a task a push or an adopting pull matched by name.
      if (plan.bind) {
        await record(plan.bind);
      }

      continue;
    }

    if (plan.action === "skip") {
      report.line(plan.reason.startsWith("missing") ? "missing" : "skip", plan.name, plan.reason);
      continue;
    }

    if (plan.action === "conflict") {
      report.fail(plan.name, plan.reason);
      continue;
    }

    try {
      if (command === "pull") {
        const path = plan.source
          ? join(dir, basename(plan.source))
          : schedulePath(dir, written, plan.name);

        if (!options.dryRun) {
          await writeSchedule(path, plan.schedule);

          if (plan.bind && plan.id) {
            await record({ id: plan.id, source: path, schedule: plan.schedule });
          }
        }

        written.push({ path, schedule: plan.schedule });
        report.line(plan.action, plan.name, display(path));
        continue;
      }

      const problem = await Effect.runPromise(adapter.check(plan.schedule, plan.id !== undefined));

      if (problem) {
        report.fail(plan.name, problem, "blocked");
        continue;
      }

      if (!prepared) {
        prepared = true;
        for (const step of adapter.setup) {
          report.line("create", step.description);

          if (!options.dryRun) {
            await Effect.runPromise(step.run);
          }
        }

        if (adapter.caveat) {
          console.log(`note      ${adapter.caveat}`);
        }
      }

      const saved = options.dryRun
        ? undefined
        : await Effect.runPromise(adapter.save(plan.schedule, plan.id));

      if (saved && plan.source) {
        await record({ id: saved.id, source: plan.source, schedule: plan.schedule });
      }

      report.line(
        plan.action,
        plan.name,
        [plan.source && display(plan.source), plan.reason, saved?.note].filter(Boolean).join(", "),
      );
    } catch (error) {
      report.fail(plan.name, error);
    }
  }

  report.finish(options.dryRun);
}
