import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { Effect } from "effect";
import {
  type ControlName,
  type LiveSchedule,
  connect as connectHarness,
  controlsOf,
  run,
} from "./harness.ts";
import { DEFINITIONS, type HarnessName, isCommandLine } from "./harnesses/index.ts";
import { display, location } from "./location.ts";
import { type Registration, readRegistrations, unregister } from "./registrations.ts";
import { line, matching } from "./report.ts";
import { readSchedules } from "./schedule.ts";

export interface ControlOptions {
  readonly id?: string;
  readonly global: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
  /** Remove only: delete the schedule file too, unless another task is pushed from it. */
  readonly deleteSource?: boolean;
}

interface Target {
  readonly id: string;
  readonly name: string;
  /** Missing when the scheduler no longer has the task a file was pushed to. */
  readonly task?: LiveSchedule | undefined;
  readonly registration?: Registration | undefined;
  /** The schedule file in this checkout, when the task was picked by name here. */
  readonly file?: string | undefined;
}

interface Result {
  readonly harness: HarnessName;
  readonly id: string;
  readonly name: string;
  readonly action: ControlName;
  readonly outcome: "done" | "planned" | "failed";
  readonly message: string | null;
}

/** Why a harness lacks a control, in terms of what to do instead. */
function unsupported(harness: HarnessName, action: ControlName): string {
  if (action === "run-now") {
    return `${harness} starts its own runs; use Run now in the app`;
  }

  return `${harness} can't ${action === "remove" ? "remove" : "pause or resume"} tasks from outside`;
}

const PAST: Record<ControlName, string> = {
  enable: "enabled",
  disable: "paused",
  "run-now": "started",
  remove: "removed",
};

async function targets(
  harness: HarnessName,
  names: ReadonlyArray<string>,
  { id, global }: Pick<ControlOptions, "id" | "global">,
  registrations: ReadonlyArray<Registration>,
): Promise<ReadonlyArray<Target>> {
  const definition = DEFINITIONS[harness];

  if (id !== undefined) {
    const task = (await run(definition.inventory)).find((candidate) => candidate.id === id);
    const registration = registrations.find((candidate) => candidate.nativeId === id);

    if (!task && !registration) {
      throw new Error(`${harness} has no task ${id}`);
    }

    return [{ id, name: task?.name ?? registration?.name ?? id, task, registration }];
  }

  const { cwd, dir } = await location(global);
  const adapter = await connectHarness(definition, { cwd });
  const live = await Effect.runPromise(adapter.list);
  const own = registrations.filter((registration) => registration.workspace === cwd);
  const candidates: ReadonlyArray<Target> = [
    ...live.map((task) => ({
      id: task.id,
      name: task.name,
      task,
      registration: own.find((registration) => registration.nativeId === task.id),
    })),
    // Tasks deleted in the scheduler can still be removed, which forgets them.
    ...own
      .filter((registration) => !live.some((task) => task.id === registration.nativeId))
      .map((registration) => ({
        id: registration.nativeId,
        name: registration.name,
        registration,
      })),
  ];
  // Only needed to find files; a folder with a broken file shouldn't block removing a task.
  const files = await readSchedules(dir).catch(() => []);
  return names.map((name) => {
    const [found] = matching(name, candidates);

    if (!found) {
      throw new Error(`no ${harness} task named ${name} for ${display(cwd)}`);
    }

    return {
      ...found,
      file: found.registration
        ? join(dir, basename(found.registration.source))
        : files.find((file) => file.schedule.name === found.name)?.path,
    };
  });
}

/** Another task pushed from the same file, which keeps the file from being deleted. */
const sharer = (
  harness: HarnessName,
  target: Target,
  path: string,
  registrations: ReadonlyArray<Registration>,
) => {
  const workspace = target.registration?.workspace ?? target.task?.workspace;
  return registrations.find(
    (registration) =>
      !(registration.harness === harness && registration.nativeId === target.id) &&
      (registration.source === path ||
        (registration.workspace === workspace && basename(registration.source) === basename(path))),
  );
};

export async function control(
  action: ControlName,
  harness: HarnessName,
  names: ReadonlyArray<string>,
  options: ControlOptions,
) {
  const definition = DEFINITIONS[harness];

  if (!controlsOf(definition).includes(action)) {
    throw new Error(unsupported(harness, action));
  }

  if ((names.length === 0) === (options.id === undefined)) {
    throw new Error("name the tasks, or pass --id for one");
  }

  if (options.deleteSource && action !== "remove") {
    throw new Error("--delete-source is for remove");
  }

  const registrations = await run(readRegistrations);
  const chosen = await targets(
    harness,
    names,
    options,
    registrations.filter((registration) => registration.harness === harness),
  );
  const results: Array<Result> = [];
  for (const target of chosen) {
    const result = (outcome: Result["outcome"], message: string | null = null) =>
      results.push({ harness, id: target.id, name: target.name, action, outcome, message });
    const source = target.file ?? target.registration?.source;

    try {
      if (!target.task && action !== "remove") {
        throw new Error(`${harness} no longer has this task; remove forgets it`);
      }

      if (action === "remove" && options.deleteSource && source && existsSync(source)) {
        const other = sharer(harness, target, source, registrations);

        // Checked first, so a refusal leaves the task and the file both in place.
        if (other) {
          throw new Error(
            `kept everything: ${display(source)} is also pushed to ${other.harness} task ${other.name}; remove that first, or remove without --delete-source`,
          );
        }
      }

      if (options.dryRun) {
        result("planned", `would be ${PAST[action]}`);
        continue;
      }

      let note: string | undefined;

      if (target.task) {
        note =
          action === "enable" || action === "disable"
            ? await run(
                definition.setEnabled?.(target.id, action === "enable") ?? Effect.void,
              ).then(() => undefined)
            : action === "run-now"
              ? await run(definition.runNow?.(target.id) ?? Effect.succeed(undefined))
              : await run(definition.remove?.(target.id) ?? Effect.succeed(undefined));
      }

      if (action === "remove") {
        await run(unregister({ harness, nativeId: target.id }));

        if (options.deleteSource && source && existsSync(source)) {
          await unlink(source);
          note = [note, `deleted ${display(source)}`].filter(Boolean).join(", ");
        } else if (!target.task) {
          note = "its task was already gone; forgotten";
        }
      }

      result("done", note ?? null);
    } catch (error) {
      result("failed", error instanceof Error ? error.message : String(error));
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ version: 1, results }, null, 2));
  } else {
    for (const { name, outcome, message } of results) {
      line(
        outcome === "failed" ? "failed" : outcome === "planned" ? "would" : PAST[action],
        name,
        message ?? "",
      );
    }

    if (
      action === "remove" &&
      isCommandLine(harness) &&
      results.some((r) => r.outcome === "done")
    ) {
      console.log("A run already going finishes.");
    }
  }

  process.exit(results.some((result) => result.outcome === "failed") ? 1 : 0);
}
