import { existsSync } from "node:fs";
import { Effect, Schema } from "effect";
import {
  type ControlName,
  type LiveSchedule,
  connect as connectHarness,
  controlsOf,
  run,
} from "./harness.ts";
import {
  ACCESS,
  DEFINITIONS,
  HARNESSES,
  type HarnessName,
  isCommandLine,
} from "./harnesses/index.ts";
import { display, location } from "./location.ts";
import { type Registration, readHosts, readRegistrations } from "./registrations.ts";
import { runRemote } from "./remote.ts";
import { table, when } from "./report.ts";
import { describeTiming, formatCron } from "./schedule.ts";

type Action = ControlName | "push" | "pull";

/**
 * One task as `list --json` reports it. The shape is versioned: fields are added, never renamed or
 * removed, without a new version. Unknown values are null rather than missing.
 */
export interface TaskJson {
  /** The scheduler's own id, which --id takes. */
  readonly id: string;
  readonly harness: string;
  /** The ssh host it was listed from, or null for this machine. */
  readonly host: string | null;
  readonly workspace: string | null;
  readonly name: string;
  /** The prompt as the scheduler has it, which may differ from the file until the next push. */
  readonly prompt: string | null;
  readonly timing: { readonly cron: string; readonly description: string } | null;
  /** Why the timing has no cron form, such as an interval or a webhook trigger. */
  readonly unsupported: string | null;
  readonly status: "active" | "paused" | "not scheduled" | "missing";
  readonly lastRun: { readonly at: string; readonly outcome: string | null } | null;
  readonly model: string | null;
  readonly access: string | null;
  /** What a push can set for this harness: whether it takes --model, and the --access levels. */
  readonly options: { readonly model: boolean; readonly access: ReadonlyArray<string> };
  readonly settings: Readonly<Record<string, string>>;
  /** The schedule file a push or pull binds to the task on the machine that holds it. */
  readonly source: { readonly path: string; readonly exists: boolean } | null;
  readonly actions: ReadonlyArray<Action>;
}

export interface Warning {
  readonly harness: string | null;
  readonly host: string | null;
  readonly message: string;
}

export interface Inventory {
  readonly version: 1;
  readonly tasks: ReadonlyArray<TaskJson>;
  readonly warnings: ReadonlyArray<Warning>;
}

const taskSchema = Schema.Struct({
  id: Schema.String,
  harness: Schema.String,
  host: Schema.NullOr(Schema.String),
  workspace: Schema.NullOr(Schema.String),
  name: Schema.String,
  prompt: Schema.NullOr(Schema.String),
  timing: Schema.NullOr(Schema.Struct({ cron: Schema.String, description: Schema.String })),
  unsupported: Schema.NullOr(Schema.String),
  status: Schema.Literals(["active", "paused", "not scheduled", "missing"]),
  lastRun: Schema.NullOr(
    Schema.Struct({ at: Schema.String, outcome: Schema.NullOr(Schema.String) }),
  ),
  model: Schema.NullOr(Schema.String),
  access: Schema.NullOr(Schema.String),
  options: Schema.Struct({ model: Schema.Boolean, access: Schema.Array(Schema.String) }),
  settings: Schema.Record(Schema.String, Schema.String),
  source: Schema.NullOr(Schema.Struct({ path: Schema.String, exists: Schema.Boolean })),
  actions: Schema.Array(
    Schema.Literals(["enable", "disable", "run-now", "remove", "push", "pull"]),
  ),
});
const decodeInventory = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      version: Schema.Literal(1),
      tasks: Schema.Array(taskSchema),
      warnings: Schema.Array(
        Schema.Struct({
          harness: Schema.NullOr(Schema.String),
          host: Schema.NullOr(Schema.String),
          message: Schema.String,
        }),
      ),
    }),
  ),
);

const optionsOf = (harness: HarnessName) => ({
  model: harness === "t3" || isCommandLine(harness),
  access: isCommandLine(harness) ? ACCESS : [],
});

/** What can be done to a task now: controls that change its state, and a push or pull. */
function actionsOf(
  harness: HarnessName,
  task: LiveSchedule | undefined,
  source: TaskJson["source"],
): ReadonlyArray<Action> {
  const controls = controlsOf(DEFINITIONS[harness]);

  if (!task) {
    return source?.exists ? ["push", "remove"] : ["remove"];
  }

  return [
    ...controls.filter(
      (control) =>
        (control !== "enable" || task.status !== "active") &&
        (control !== "disable" || task.status !== "paused"),
    ),
    ...(source?.exists ? (["push"] as const) : []),
    ...("schedule" in task ? (["pull"] as const) : []),
  ];
}

function taskJson(
  harness: HarnessName,
  task: LiveSchedule,
  registration: Registration | undefined,
): TaskJson {
  const source = registration
    ? { path: registration.source, exists: existsSync(registration.source) }
    : null;
  return {
    id: task.id,
    harness,
    host: null,
    workspace: task.workspace ?? null,
    name: task.name,
    prompt: "schedule" in task ? task.schedule.prompt : (task.prompt ?? null),
    timing:
      "schedule" in task
        ? {
            cron: formatCron(task.schedule.timing),
            description: describeTiming(task.schedule.timing),
          }
        : null,
    unsupported: "unsupported" in task ? task.unsupported : null,
    status: task.status,
    lastRun: task.lastRun
      ? { at: task.lastRun.at.toISOString(), outcome: task.lastRun.outcome ?? null }
      : null,
    model: task.model ?? null,
    access: task.access ?? null,
    options: optionsOf(harness),
    settings: task.settings ?? {},
    source,
    actions: actionsOf(harness, task, source),
  };
}

/** A task pushed from a file that its scheduler no longer has. */
function missingJson(registration: Registration & { readonly harness: HarnessName }): TaskJson {
  const source = { path: registration.source, exists: existsSync(registration.source) };
  return {
    id: registration.nativeId,
    harness: registration.harness,
    host: null,
    workspace: registration.workspace,
    name: registration.name,
    prompt: null,
    timing: null,
    unsupported: null,
    status: "missing",
    lastRun: null,
    model: null,
    access: null,
    options: optionsOf(registration.harness),
    settings: {},
    source,
    actions: actionsOf(registration.harness, undefined, source),
  };
}

const isHarness = (name: string): name is HarnessName =>
  (HARNESSES as ReadonlyArray<string>).includes(name);

export interface ListOptions {
  readonly global: boolean;
  readonly all: boolean;
  readonly json: boolean;
  /** Leaves remembered hosts out; what a remote list is asked for, so hosts aren't asked twice. */
  readonly localOnly?: boolean;
}

/**
 * What this machine's harnesses have: every task in every workspace with --all, or this
 * repository's. A harness that can't be read adds a warning and the rest still list.
 */
async function localInventory(
  harnesses: ReadonlyArray<HarnessName>,
  { all, global }: Pick<ListOptions, "all" | "global">,
): Promise<{ tasks: Array<TaskJson>; warnings: Array<Warning>; cwd: string }> {
  const { cwd } = await location(global);
  const registrations = await run(readRegistrations);
  const results = await Promise.all(
    harnesses.map(async (harness) => {
      try {
        const live = all
          ? await run(DEFINITIONS[harness].inventory)
          : await connectHarness(DEFINITIONS[harness], { cwd }).then((adapter) =>
              Effect.runPromise(adapter.list),
            );
        const own = registrations.filter(
          (registration) =>
            registration.harness === harness && (all || registration.workspace === cwd),
        );
        // Only a harness that answered can say a registered task is gone.
        const missing = own.filter(
          (registration) => !live.some((task) => task.id === registration.nativeId),
        );
        return {
          tasks: [
            ...live.map((task) =>
              taskJson(
                harness,
                task,
                own.find((registration) => registration.nativeId === task.id),
              ),
            ),
            ...missing.map((registration) => missingJson({ ...registration, harness })),
          ],
          warnings: [],
        };
      } catch (error) {
        return {
          tasks: [],
          warnings: [
            {
              harness,
              host: null,
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    }),
  );
  return {
    tasks: results.flatMap((result) => result.tasks),
    warnings: results.flatMap((result) => result.warnings),
    cwd,
  };
}

/** One ssh call per remembered host, all at once; a host that fails becomes a warning. */
async function remoteInventory(harness: HarnessName | undefined): Promise<Inventory> {
  const hosts = await run(readHosts);
  const results = await Promise.all(
    hosts.map(async (host): Promise<Inventory> => {
      try {
        const { code, stdout, stderr } = await runRemote(
          host,
          ["list", "--all", "--json", "--local-only", ...(harness ? [harness] : [])],
          { capture: true },
        );
        // A list that ran prints its JSON even when some of it failed; otherwise ssh, the remote
        // shell or the CLI there says why on stderr, the CLI on a line of its own.
        const reason = () => {
          const lines = stderr.trim().split("\n");
          return (
            lines.find((line) => line.startsWith("error:")) ?? lines.at(-1) ?? `exit code ${code}`
          );
        };

        if (code !== 0 && !stdout.trim()) {
          throw new Error(reason());
        }

        const remote = (() => {
          try {
            return decodeInventory(stdout);
          } catch {
            throw new Error(
              code === 0 ? `${host} answered with something other than a list` : reason(),
            );
          }
        })();

        return {
          version: 1,
          // Freshly decoded, so labelling them with the host in place changes nothing else.
          tasks: remote.tasks.map((task) => Object.assign(task, { host })),
          warnings: remote.warnings.map((warning) => Object.assign(warning, { host })),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { version: 1, tasks: [], warnings: [{ harness: null, host, message }] };
      }
    }),
  );
  return {
    version: 1,
    tasks: results.flatMap((result) => result.tasks),
    warnings: results.flatMap((result) => result.warnings),
  };
}

const lastRunCell = ({ lastRun }: TaskJson) =>
  lastRun === null ? "-" : `${lastRun.outcome ?? "started"}, ${when(new Date(lastRun.at))}`;

export async function list(harness: string | undefined, options: ListOptions) {
  if (harness !== undefined && !isHarness(harness)) {
    throw new Error(`no harness named ${harness}`);
  }

  const harnesses = harness ? [harness] : HARNESSES;
  const local = await localInventory(harnesses, options);
  const [failure] = local.warnings;

  // A harness asked for by name has to answer, outside of JSON, where partial results are the point.
  if (harness && failure && !options.json) {
    throw new Error(failure.message);
  }

  const remote =
    options.all && !options.localOnly
      ? await remoteInventory(harness)
      : { version: 1 as const, tasks: [], warnings: [] };
  const inventory: Inventory = {
    version: 1,
    tasks: [...local.tasks, ...remote.tasks],
    warnings: [...local.warnings, ...remote.warnings],
  };

  if (options.json) {
    console.log(JSON.stringify(inventory, null, 2));
    return;
  }

  if (inventory.tasks.length === 0) {
    console.log(
      options.all
        ? "Nothing scheduled anywhere this CLI can see."
        : `Nothing scheduled for ${display(local.cwd)}.`,
    );
  } else {
    const hosts = inventory.tasks.some((task) => task.host !== null);
    table([
      [
        "HARNESS",
        "NAME",
        "WHEN",
        "STATUS",
        "LAST RUN",
        ...(options.all ? ["WORKSPACE", "ID"] : []),
        ...(hosts ? ["HOST"] : []),
      ],
      ...inventory.tasks.map((task) =>
        [
          task.harness,
          task.name,
          task.timing?.description ?? task.unsupported ?? "-",
          task.status,
          lastRunCell(task),
        ].concat(
          options.all ? [task.workspace ? display(task.workspace) : "-", task.id] : [],
          hosts ? [task.host ?? "this machine"] : [],
        ),
      ),
    ]);
  }

  // Harnesses that aren't set up here are expected without one named, so they share a line.
  const unset = local.warnings.map((warning) => warning.harness);
  if (unset.length > 0) {
    console.error(`skipped ${unset.join(", ")}: not set up here, or unreadable; try doctor`);
  }

  for (const warning of remote.warnings) {
    console.error(
      `skipped ${[warning.host, warning.harness].filter(Boolean).join(" ")}: ${warning.message}`,
    );
  }
}
