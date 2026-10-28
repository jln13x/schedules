#!/usr/bin/env node
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { isCancel, multiselect } from "@clack/prompts";
import { Argument, Command, Option } from "commander";
import { Effect } from "effect";
import { description, version } from "../package.json";
import { type LiveSchedule, Workspace, connect as connectHarness, run } from "./harness.ts";
import {
  fetchSchedules,
  formatSearchResults,
  parseSource,
  reportInstall,
  searchSchedules,
} from "./registry.ts";
import {
  SCHEDULES_DIR,
  type Schedule,
  type ScheduleFile,
  describeTiming,
  readSchedules,
  sameSchedule,
  schedulePath,
  slug,
  writeSchedule,
} from "./schedule.ts";
import {
  ACCESS,
  type Access,
  DEFINITIONS,
  HARNESSES,
  type HarnessName as Harness,
  COMMAND_LINE_AGENTS,
  isCommandLine,
  listJobs,
  removeJob,
  runJob,
} from "./harnesses/index.ts";

interface Options {
  readonly global: boolean;
  readonly dryRun: boolean;
}

interface SyncOptions extends Options {
  readonly all: boolean;
  readonly model?: string;
  readonly access?: Access;
}

const execFileAsync = promisify(execFile);
const git = async (...args: Array<string>) => (await execFileAsync("git", args)).stdout.trim();

const exitWithMessage = (error: unknown) => {
  const cause =
    error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}${cause}`);
  process.exit(1);
};
process.on("uncaughtException", exitWithMessage);
process.on("unhandledRejection", exitWithMessage);

async function location(global: boolean) {
  const checkout = global ? null : await git("rev-parse", "--show-toplevel").catch(() => null);
  // Worktrees share one repository, and schedulers know it by its main checkout, which git lists
  // first.
  const main =
    checkout === null
      ? null
      : await git("worktree", "list", "--porcelain")
          .then((list) => list.split("\n")[0]?.replace(/^worktree /, "") || null)
          .catch(() => null);
  return {
    cwd: checkout === null ? homedir() : (main ?? checkout),
    dir: join(checkout ?? homedir(), SCHEDULES_DIR),
  };
}

const display = (path: string) => {
  const local = relative(process.cwd(), path);

  if (!local.startsWith("..")) {
    return local;
  }

  return path.startsWith(homedir() + sep) ? `~${path.slice(homedir().length)}` : path;
};

const line = (action: string, name: string, detail = "") =>
  console.log(`${action.padEnd(10)}${name}${detail ? ` - ${detail}` : ""}`);

function createReport() {
  let unchanged = 0;
  let failed = 0;
  return {
    line,
    unchanged: () => {
      unchanged += 1;
    },
    fail: (name: string, reason: unknown, label = "conflict") => {
      line(label, name, reason instanceof Error ? reason.message : String(reason));
      failed += 1;
    },
    failed: () => failed > 0,
    finish: (dryRun: boolean) => {
      console.log(`${unchanged} unchanged${dryRun ? " (dry run, nothing written)" : ""}`);
      process.exit(failed > 0 ? 1 : 0);
    },
  };
}

async function search(words: ReadonlyArray<string>) {
  const results = await searchSchedules(words.join(" "));
  console.log(
    results.length === 0
      ? "No schedules match."
      : `${formatSearchResults(results)}\n\nInstall one with: agent-schedules add <owner/repo/name>`,
  );
}

async function add(value: string, { global, dryRun }: Options) {
  const { dir } = await location(global);
  const files = await readSchedules(dir);
  const report = createReport();
  const { schedules, isPublic, source } = await fetchSchedules(parseSource(value));
  const written: Array<ScheduleFile> = [...files];
  for (const schedule of schedules) {
    const file = files.find((candidate) => candidate.schedule.name === schedule.name);

    if (file && sameSchedule(file.schedule, schedule)) {
      report.unchanged();
      continue;
    }

    try {
      const path = schedulePath(dir, written, schedule.name);

      if (!dryRun) {
        await writeSchedule(path, schedule);

        if (isPublic) {
          await reportInstall(source, schedule.name);
        }
      }

      written.push({ path, schedule });
      report.line(file ? "update" : "create", schedule.name, display(path));
    } catch (error) {
      report.fail(schedule.name, error);
    }
  }

  if (!dryRun && !report.failed()) {
    console.log("Run agent-schedules push <harness> to register it.");
  }

  report.finish(dryRun);
}

const workspace = (cwd: string, options: Pick<SyncOptions, "model" | "access"> = {}) => ({
  cwd,
  model: options.model,
  access: options.access,
});

const connect = (harness: Harness, cwd: string, options?: Pick<SyncOptions, "model" | "access">) =>
  connectHarness(DEFINITIONS[harness], workspace(cwd, options));

type Plan =
  | { readonly name: string; readonly action: "create" | "update"; readonly schedule: Schedule }
  | { readonly name: string; readonly action: "unchanged" }
  | { readonly name: string; readonly action: "skip"; readonly reason: string }
  | { readonly name: string; readonly action: "conflict"; readonly reason: string };

const sameSlug = (query: string, name: string) => {
  try {
    return slug(query) === slug(name);
  } catch {
    return false;
  }
};

/** What a query names: the exact name, or else the one item with that filename form. */
function matching<T extends { readonly name: string }>(
  query: string,
  items: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const exact = items.filter((item) => item.name === query);
  const found = exact.length > 0 ? exact : items.filter((item) => sameSlug(query, item.name));

  if (found.length > 1) {
    throw new Error(
      `${query} could mean ${found.map((item) => item.name).join(" or ")}; use the exact name`,
    );
  }

  return found;
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
      hint: `${plan.action === "create" ? "new" : "changed"}, ${"schedule" in plan ? describeTiming(plan.schedule.timing) : ""}`,
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

async function sync(
  command: "pull" | "push",
  harness: Harness,
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
  const adapter = await connect(harness, cwd, options);
  const live = await Effect.runPromise(adapter.list);
  const sharedNames = new Set(
    live.map((task) => task.name).filter((name, index, names) => names.indexOf(name) !== index),
  );
  const shared = `several ${harness} tasks share this name`;

  const plans: ReadonlyArray<Plan> =
    command === "pull"
      ? live.map((task): Plan => {
          if (sharedNames.has(task.name)) {
            return { name: task.name, action: "conflict", reason: shared };
          }

          if ("unsupported" in task) {
            return { name: task.name, action: "skip", reason: task.unsupported };
          }

          const file = files.find((candidate) => candidate.schedule.name === task.name);

          if (file && sameSchedule(file.schedule, task.schedule)) {
            return { name: task.name, action: "unchanged" };
          }

          return { name: task.name, action: file ? "update" : "create", schedule: task.schedule };
        })
      : files.map(({ schedule }): Plan => {
          const task = live.find((candidate) => candidate.name === schedule.name);

          if (sharedNames.has(schedule.name)) {
            return { name: schedule.name, action: "conflict", reason: shared };
          }

          if (task && "unsupported" in task) {
            return {
              name: schedule.name,
              action: "conflict",
              reason: `the ${harness} task is not managed: ${task.unsupported}`,
            };
          }

          const settled =
            task &&
            task.status !== "not scheduled" &&
            (options.access === undefined || task.access === options.access) &&
            (options.model === undefined || task.model === options.model);

          if (task && settled && sameSchedule(task.schedule, schedule)) {
            return { name: schedule.name, action: "unchanged" };
          }

          return { name: schedule.name, action: task ? "update" : "create", schedule };
        });

  const chosen = await choose(command, plans, names, options);
  // Includes files created during this run, so two names with the same slug cannot share a file.
  const written: Array<ScheduleFile> = [...files];
  let prepared = false;
  for (const plan of chosen) {
    if (plan.action === "unchanged") {
      report.unchanged();
      continue;
    }

    if (plan.action === "skip") {
      report.line("skip", plan.name, plan.reason);
      continue;
    }

    if (plan.action === "conflict") {
      report.fail(plan.name, plan.reason);
      continue;
    }

    try {
      if (command === "pull") {
        const path = schedulePath(dir, written, plan.name);

        if (!options.dryRun) {
          await writeSchedule(path, plan.schedule);
        }

        written.push({ path, schedule: plan.schedule });
        report.line(plan.action, plan.name, display(path));
        continue;
      }

      const problem = await Effect.runPromise(
        adapter.check(plan.schedule, plan.action === "update"),
      );

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

      const note = options.dryRun
        ? undefined
        : await Effect.runPromise(adapter.save(plan.schedule));
      const file = files.find((candidate) => candidate.schedule.name === plan.name);
      report.line(
        plan.action,
        plan.name,
        [file && display(file.path), note].filter(Boolean).join(", "),
      );
    } catch (error) {
      report.fail(plan.name, error);
    }
  }

  report.finish(options.dryRun);
}

async function doctor(harness: Harness, { global }: Pick<Options, "global">) {
  const { cwd, dir } = await location(global);
  const files = await readSchedules(dir);
  console.log(`schedules ${display(dir)}: ${files.length} files`);
  const lines = await run(
    DEFINITIONS[harness].doctor.pipe(Effect.provideService(Workspace, workspace(cwd))),
  ).catch((error: Error) => [`check failed: ${error.message}`]);
  for (const [index, line] of lines.entries()) {
    console.log(`${(index === 0 ? harness : "").padEnd(Math.max(10, harness.length + 2))}${line}`);
  }
}

const when = (date: Date) =>
  date.toLocaleString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

function table(rows: ReadonlyArray<ReadonlyArray<string>>) {
  const widths =
    rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  for (const row of rows) {
    console.log(
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    );
  }
}

const lastRunCell = ({ lastRun }: LiveSchedule) =>
  lastRun === undefined ? "-" : `${lastRun.outcome ?? "started"}, ${when(lastRun.at)}`;

async function list(
  harness: Harness | undefined,
  { global, all }: { global: boolean; all: boolean },
) {
  const { cwd } = await location(global);
  // Every repository means every one this CLI schedules runs for; the apps are listed per repository.
  const targets: ReadonlyArray<readonly [Harness, string]> = all
    ? [...new Set((await run(listJobs)).map((job) => `${job.agent}\0${job.cwd}`))]
        .map((key) => key.split("\0") as [Harness, string])
        .filter(([agent]) => !harness || agent === harness)
    : HARNESSES.filter((name) => !harness || name === harness).map((name) => [name, cwd] as const);

  const rows: Array<Array<string>> = [];
  const skipped: Array<string> = [];
  for (const [name, repository] of targets) {
    const tasks = await connect(name, repository)
      .then((adapter) => Effect.runPromise(adapter.list))
      .catch((error: Error) => {
        // Without a harness named, the ones that aren't set up here are skipped, but said so.
        if (harness) {
          throw error;
        }

        skipped.push(name);
        return [];
      });
    for (const task of tasks) {
      rows.push([
        name,
        task.name,
        "schedule" in task ? describeTiming(task.schedule.timing) : task.unsupported,
        task.status,
        lastRunCell(task),
        ...(all ? [display(repository)] : []),
      ]);
    }
  }

  if (rows.length === 0) {
    console.log(
      all ? "No scheduled runs on this machine." : `Nothing scheduled for ${display(cwd)}.`,
    );
  } else {
    table([
      ["HARNESS", "NAME", "WHEN", "STATUS", "LAST RUN", ...(all ? ["REPOSITORY"] : [])],
      ...rows,
    ]);
  }

  if (skipped.length > 0) {
    console.error(`skipped ${skipped.join(", ")}: not set up here, or unreadable; try doctor`);
  }
}

async function remove(
  harness: Harness,
  names: ReadonlyArray<string>,
  { global }: { global: boolean },
) {
  if (!isCommandLine(harness)) {
    throw new Error(`${harness} keeps its own schedule; remove the task in the app`);
  }

  const { cwd } = await location(global);
  const jobs = (await run(listJobs)).filter((job) => job.agent === harness && job.cwd === cwd);
  let missing = 0;
  for (const name of names) {
    const [job] = matching(name, jobs);

    if (job) {
      await run(removeJob(job));
      line("remove", job.name);
    } else {
      line("missing", name, `no ${harness} schedule with this name for ${display(cwd)}`);
      missing += 1;
    }
  }

  process.exit(missing > 0 ? 1 : 0);
}

const harnessArgument = (description = "the harness to sync with") =>
  new Argument("<harness>", description).choices(HARNESSES);
const GLOBAL = ["-g, --global", `use ~/${SCHEDULES_DIR} even inside a repository`] as const;
const DRY_RUN = ["--dry-run", "preview changes without writing anything"] as const;
const ALL = ["-a, --all", "sync every schedule without asking"] as const;
const NAMES = ["[names...]", "schedules to sync, by name; omit to choose from a list"] as const;

const program = new Command("agent-schedules")
  .description(description)
  .version(version, "-v, --version")
  .showHelpAfterError()
  .addHelpText(
    "after",
    `\nInside a repository, schedules live in its ${SCHEDULES_DIR}. Outside one, or with --global, they\nlive in ~/${SCHEDULES_DIR} and run in your home folder.`,
  );

program
  .command("search")
  .description("find schedules on schedules.sh, most installed first")
  .argument("[query...]", "words to match against names and prompts")
  .action(search);

program
  .command("add")
  .description(`copy schedules from a public GitHub repository into ${SCHEDULES_DIR}`)
  .argument("<source>", "owner/repo for all of its schedules, or owner/repo/name for one")
  .option(...GLOBAL)
  .option(...DRY_RUN)
  .action(add);

program
  .command("pull")
  .description(`write the harness's scheduled tasks to ${SCHEDULES_DIR}`)
  .addArgument(harnessArgument())
  .argument(...NAMES)
  .option(...ALL)
  .option(...GLOBAL)
  .option(...DRY_RUN)
  .action((harness: Harness, names: Array<string>, options: SyncOptions) =>
    sync("pull", harness, names, options),
  );

program
  .command("push")
  .description(`create or update the harness's scheduled tasks from ${SCHEDULES_DIR}`)
  .addArgument(harnessArgument())
  .argument(...NAMES)
  .option(...ALL)
  .option(
    "-m, --model <model>",
    "model for the tasks this push creates or updates, such as codex/gpt-6-astra for t3",
  )
  .addOption(
    new Option("--access <level>", `what scheduled runs may do (${COMMAND_LINE_AGENTS.join(", ")})`)
      .choices(ACCESS)
      .default(undefined, "read for new tasks"),
  )
  .option(...GLOBAL)
  .option(...DRY_RUN)
  .action((harness: Harness, names: Array<string>, options: SyncOptions) =>
    sync("push", harness, names, options),
  );

program
  .command("list")
  .description("show what is scheduled, whether it is active, and its last run")
  .addArgument(new Argument("[harness]", "only this harness").choices(HARNESSES))
  .option("-a, --all", "every repository on this machine, for the harnesses this CLI schedules")
  .option(...GLOBAL)
  .action(list);

program
  .command("remove")
  .description(`stop and delete scheduled runs (${COMMAND_LINE_AGENTS.join(", ")})`)
  .addArgument(harnessArgument("the harness that runs them"))
  .argument("<names...>", "the schedules to remove")
  .option(...GLOBAL)
  .action(remove);

program
  .command("run", { hidden: true })
  .description("run one scheduled job now; the scheduler calls this")
  .argument("<id>")
  .option("--home <dir>", "where the job's files are")
  .action(async (id: string, { home }: { home?: string }) => {
    if (home) {
      process.env.AGENT_SCHEDULES_HOME = home;
    }

    process.exit(await run(runJob(id)));
  });

program
  .command("doctor")
  .description("check a harness's setup, without changing anything")
  .addArgument(harnessArgument("the harness to check"))
  .option(...GLOBAL)
  .action(doctor);

await program.parseAsync();
