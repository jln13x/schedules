#!/usr/bin/env node
import { Argument, Command, Option } from "commander";
import { Effect } from "effect";
import { description, version } from "../package.json";
import { Workspace, run } from "./harness.ts";
import { control } from "./controls.ts";
import {
  ACCESS,
  COMMAND_LINE_AGENTS,
  DEFINITIONS,
  HARNESSES,
  type HarnessName as Harness,
  runJob,
} from "./harnesses/index.ts";
import { list } from "./inventory.ts";
import { display, location } from "./location.ts";
import { forgetHost, readHosts, rememberHost } from "./registrations.ts";
import { fetchSchedules, formatSearchResults, parseSource, searchSkills } from "./registry.ts";
import { checkHost, runRemote } from "./remote.ts";
import { createReport, line } from "./report.ts";
import {
  SCHEDULES_DIR,
  type Schedule,
  type ScheduleFile,
  describeTiming,
  readSchedules,
  sameSchedule,
  schedulePath,
  timingFromCron,
  writeSchedule,
} from "./schedule.ts";
import { isCommitted, resolveSkill, skillPrompt } from "./skills.ts";
import { type SyncOptions, sync } from "./sync.ts";

interface Options {
  readonly global: boolean;
  readonly dryRun: boolean;
}

const exitWithMessage = (error: unknown) => {
  const cause =
    error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}${cause}`);
  process.exit(1);
};
process.on("uncaughtException", exitWithMessage);
process.on("unhandledRejection", exitWithMessage);

async function search(words: ReadonlyArray<string>) {
  const results = await searchSkills(words.join(" "));
  console.log(
    results.length === 0
      ? "No skills match."
      : `${formatSearchResults(results)}\n\nInstall one, then schedule it:\n  npx skills add <owner/repo> --skill <skill>\n  agent-schedules schedule <skill> "<cron>"`,
  );
}

async function schedule(
  query: string,
  cron: string,
  { global, dryRun, name: requested }: Options & { readonly name?: string },
) {
  const timing = timingFromCron(cron);

  if (typeof timing === "string") {
    throw new Error(timing);
  }

  const { dir, checkout } = await location(global);
  const skill = await resolveSkill(query, global ? null : checkout);
  const files = await readSchedules(dir);
  const name = requested?.trim() || skill.name;
  // Without a name, scheduling a skill again changes the file that already runs it.
  const file = requested
    ? files.find((candidate) => candidate.schedule.name === name)
    : (files.find((candidate) => candidate.schedule.skill === skill.name) ??
      files.find((candidate) => candidate.schedule.name === name));

  if (file && file.schedule.skill !== skill.name) {
    throw new Error(
      `${display(file.path)} already holds "${file.schedule.name}"; pass --name to schedule ${skill.name} under another name`,
    );
  }

  const prompt = skillPrompt(skill);
  // A prompt someone edited is theirs; only the timing follows this command.
  const edited = file !== undefined && file.schedule.prompt !== prompt;
  const next: Schedule = {
    name: file?.schedule.name ?? name,
    timing,
    prompt: edited ? file.schedule.prompt : prompt,
    skill: skill.name,
  };

  if (file && sameSchedule(file.schedule, next)) {
    line("unchanged", next.name, display(file.path));
    return;
  }

  const path = file?.path ?? schedulePath(dir, files, next.name);

  if (!dryRun) {
    await writeSchedule(path, next);
  }

  line(
    file ? "update" : "create",
    next.name,
    `${display(path)}, ${describeTiming(timing)}${edited ? ", kept its edited prompt" : ""}`,
  );

  if (skill.scope === "project" && checkout !== null && !(await isCommitted(skill, checkout))) {
    console.log(
      `note      ${skill.path} isn't committed, so tasks that run in a worktree or another clone won't find it`,
    );
  }

  if (!dryRun) {
    console.log("Run agent-schedules push <harness> to register it.");
  }
}

async function add(value: string, { global, dryRun }: Options) {
  console.error(
    "note      add is deprecated: schedules.sh lists skills now. Install one with npx skills add, then run agent-schedules schedule <skill> <cron>",
  );
  const { dir } = await location(global);
  const files = await readSchedules(dir);
  const report = createReport();
  const { schedules } = await fetchSchedules(parseSource(value));
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

async function doctor(harness: Harness, { global }: Pick<Options, "global">) {
  const { cwd, dir } = await location(global);
  const files = await readSchedules(dir);
  console.log(`schedules ${display(dir)}: ${files.length} files`);
  const lines = await run(
    DEFINITIONS[harness].doctor.pipe(Effect.provideService(Workspace, { cwd })),
  ).catch((error: Error) => [`check failed: ${error.message}`]);
  for (const [index, line] of lines.entries()) {
    console.log(`${(index === 0 ? harness : "").padEnd(Math.max(10, harness.length + 2))}${line}`);
  }
}

async function hosts(action: string | undefined, host: string | undefined) {
  if (action === "forget") {
    if (!host) {
      throw new Error("name the host to forget");
    }

    await run(forgetHost(host));
    line("forget", host);
    return;
  }

  if (action !== undefined) {
    throw new Error(`hosts takes no argument, or forget <host>`);
  }

  const remembered = await run(readHosts);
  console.log(
    remembered.length === 0 ? "No remote hosts yet; pass --ssh to use one." : remembered.join("\n"),
  );
}

const harnessArgument = (description = "the harness to sync with") =>
  new Argument("<harness>", description).choices(HARNESSES);
const GLOBAL = ["-g, --global", `use ~/${SCHEDULES_DIR} even inside a repository`] as const;
const DRY_RUN = ["--dry-run", "preview changes without writing anything"] as const;
const ALL = ["-a, --all", "sync every schedule without asking"] as const;
const NAMES = ["[names...]", "schedules to sync, by name; omit to choose from a list"] as const;
const JSON_OUTPUT = ["--json", "print the result as JSON, for other tools"] as const;
const ID = ["--id <id>", "pick one task by the id list --all shows, in any workspace"] as const;

/** Options every command takes: where to run it. */
const located = (command: Command) =>
  command
    .option("--ssh <host>", "run on this ssh host, which is remembered for list --all")
    .option("--cwd <dir>", "run as if started in this folder");

const program = new Command("agent-schedules")
  .description(description)
  .version(version, "-v, --version")
  .showHelpAfterError()
  .addHelpText(
    "after",
    `\nInside a repository, schedules live in its ${SCHEDULES_DIR}. Outside one, or with --global, they\nlive in ~/${SCHEDULES_DIR} and run in your home folder.`,
  );

/**
 * --ssh runs the same command on the host, with everything but --ssh passed on; --cwd moves into
 * the folder first, here or there. A host is remembered once a command there succeeds.
 */
program.hook("preAction", async (_program, action) => {
  const { ssh, cwd } = action.opts<{ ssh?: string; cwd?: string }>();

  if (ssh === undefined) {
    if (cwd !== undefined) {
      process.chdir(cwd);
    }

    return;
  }

  checkHost(ssh);
  const args = process.argv.slice(2);
  const forwarded = args.filter(
    (arg, index) => arg !== "--ssh" && args[index - 1] !== "--ssh" && !arg.startsWith("--ssh="),
  );
  const { code } = await runRemote(ssh, forwarded);

  if (code === 0) {
    await run(rememberHost(ssh));
  }

  process.exit(code);
});

located(
  program
    .command("search")
    .description("find skills worth scheduling on schedules.sh, best first")
    .argument("[query...]", "words to match against names and descriptions"),
).action(search);

located(
  program
    .command("schedule")
    .description(`run an installed skill on a schedule: writes its file in ${SCHEDULES_DIR}`)
    .argument("<skill>", "the skill's name, owner/repo/skill, or the path to its folder")
    .argument("<cron>", "when it runs, such as '0 8 * * 1-5' or '0 8 1 * *'")
    .option("-n, --name <name>", "name the schedule, to run one skill at several times")
    .option(...GLOBAL)
    .option(...DRY_RUN),
).action(schedule);

located(
  program
    .command("add")
    .description(
      `(deprecated) copy schedules from a public GitHub repository into ${SCHEDULES_DIR}`,
    )
    .argument("<source>", "owner/repo for all of its schedules, or owner/repo/name for one")
    .option(...GLOBAL)
    .option(...DRY_RUN),
).action(add);

located(
  program
    .command("pull")
    .description(`write the harness's scheduled tasks to ${SCHEDULES_DIR}`)
    .addArgument(harnessArgument())
    .argument(...NAMES)
    .option(...ALL)
    .option("--adopt", "bind the files to their tasks, so later pushes update those tasks")
    .option(...GLOBAL)
    .option(...DRY_RUN),
).action((harness: Harness, names: Array<string>, options: SyncOptions) =>
  sync("pull", harness, names, options),
);

located(
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
      new Option(
        "--access <level>",
        `what scheduled runs may do (${COMMAND_LINE_AGENTS.join(", ")})`,
      )
        .choices(ACCESS)
        .default(undefined, "read for new tasks"),
    )
    .option("--force", "replace tasks that were changed in the harness since the last push")
    .option(...GLOBAL)
    .option(...DRY_RUN),
).action((harness: Harness, names: Array<string>, options: SyncOptions) =>
  sync("push", harness, names, options),
);

located(
  program
    .command("list")
    .description("show what is scheduled, whether it is active, and its last run")
    .addArgument(new Argument("[harness]", "only this harness").choices(HARNESSES))
    .option(
      "-a, --all",
      "every task in every workspace, here and on the hosts --ssh has used, including ones made in the apps",
    )
    .option(...JSON_OUTPUT)
    .addOption(new Option("--local-only").hideHelp())
    .option(...GLOBAL),
).action(list);

const controlCommand = (
  name: "enable" | "disable" | "run-now" | "remove",
  summary: string,
  extra: (command: Command) => Command = (command) => command,
) =>
  located(
    extra(
      program
        .command(name)
        .description(summary)
        .addArgument(harnessArgument("the harness that has the tasks"))
        .argument("[names...]", "the tasks, by name, in this repository")
        .option(...ID)
        .option(...JSON_OUTPUT)
        .option(...GLOBAL)
        .option(...DRY_RUN),
    ),
  ).action((harness: Harness, names: Array<string>, options) =>
    control(name, harness, names, options),
  );

controlCommand("enable", "resume paused tasks");
controlCommand("disable", "pause tasks; pushes and one-off runs keep them paused");
controlCommand("run-now", "start one run of each task now, without changing its schedule");
controlCommand(
  "remove",
  "delete tasks from the harness and forget them; schedule files stay",
  (command) =>
    command
      .alias("delete")
      .option(
        "--delete-source",
        "delete the schedule file too, unless another task is pushed from it",
      ),
);

program
  .command("hosts")
  .description("show the ssh hosts list --all reads, or forget one")
  .argument("[action]", "forget")
  .argument("[host]", "the host to forget")
  .action(hosts);

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

located(
  program
    .command("doctor")
    .description("check a harness's setup, without changing anything")
    .addArgument(harnessArgument("the harness to check"))
    .option(...GLOBAL),
).action(doctor);

await program.parseAsync();
