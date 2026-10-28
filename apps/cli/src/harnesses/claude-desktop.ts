import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Schema } from "effect";
import {
  type HarnessDefinition,
  type LiveSchedule,
  type Platform,
  Harness,
  HarnessError,
  Workspace,
  exec,
  exists,
  fail,
  listDirectory,
  loose,
  readJson,
  readText,
  writeJsonAtomic,
  writeText,
} from "../harness.ts";
import { type Schedule, formatCron, slug, timingFromCron } from "../schedule.ts";

const DESCRIPTION_LIMIT = 200;
const configDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
const tasksDir = () => join(configDir(), "scheduled-tasks");

// The Desktop app rewrites the manifest from memory, so an outside edit survives only while it is closed.
const PROCESS_NAMES: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "Claude",
  linux: "claude-desktop",
  win32: "Claude.exe",
};

const userDataDir = () => {
  if (process.env.CLAUDE_USER_DATA_DIR) {
    return process.env.CLAUDE_USER_DATA_DIR;
  }

  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library/Application Support/Claude");
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData/Roaming"), "Claude");
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "Claude");
  }
};

const taskSchema = loose({
  id: Schema.String.check(Schema.isPattern(/^[a-z0-9_-]+$/)),
  displayName: Schema.optionalKey(Schema.String),
  cronExpression: Schema.optionalKey(Schema.String),
  fireAt: Schema.optionalKey(Schema.Number),
  enabled: Schema.Boolean,
  filePath: Schema.String,
  createdAt: Schema.Number,
  cwd: Schema.optionalKey(Schema.String),
  lastRunAt: Schema.optionalKey(Schema.Union([Schema.Number, Schema.String])),
});
type ClaudeTask = typeof taskSchema.Type;
const manifestSchema = loose({ scheduledTasks: Schema.Array(taskSchema) });
type Manifest = typeof manifestSchema.Type;

const parseSkill = (text: string) =>
  Effect.gen(function* () {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n+([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));

    if (!match) {
      return yield* fail("SKILL.md has no frontmatter");
    }

    const [, frontmatter = "", body = ""] = match;
    return {
      // Updates only change the prompt; retain all YAML, including keys owned by the app.
      frontmatter,
      prompt: body.trimEnd(),
    };
  });
type Skill = Effect.Success<ReturnType<typeof parseSkill>>;

function serializeSkill({ frontmatter, prompt }: Skill): string {
  return `---\n${frontmatter}\n---\n\n${prompt}\n`;
}

const describe = (prompt: string) => prompt.replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_LIMIT);
const quoteYaml = (value: string) =>
  JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

const appIsRunning = Effect.gen(function* () {
  const name = PROCESS_NAMES[process.platform];

  if (!name) {
    return false;
  }

  const stdout =
    process.platform === "win32"
      ? yield* exec("tasklist", ["/FI", `IMAGENAME eq ${name}`, "/FO", "CSV", "/NH"])
      : yield* exec("ps", ["-A", "-o", "comm="]);
  return stdout
    .split("\n")
    .some((line) =>
      process.platform === "win32"
        ? /^"([^"]*)",/.exec(line.trim())?.[1]?.toLowerCase() === name.toLowerCase()
        : line.trim().split("/").at(-1) === name,
    );
});

const locateManifest = Effect.gen(function* () {
  const sessions = join(userDataDir(), "claude-code-sessions");
  const candidates: Array<string> = [];
  for (const account of yield* listDirectory(sessions)) {
    const orgs = yield* listDirectory(join(sessions, account)).pipe(Effect.orElseSucceed(() => []));
    for (const org of orgs) {
      candidates.push(join(sessions, account, org, "scheduled-tasks.json"));
    }
  }

  const [only] = candidates;

  if (only !== undefined && candidates.length === 1) {
    return only;
  }

  return yield* candidates.length === 0
    ? fail("Claude Desktop has no signed-in account on this machine")
    : fail(
        `Several Claude Desktop accounts are signed in; set CLAUDE_USER_DATA_DIR or sign out of all but one:\n${candidates.join("\n")}`,
      );
});

const skillPath = (id: string) => join(tasksDir(), id, "SKILL.md");
const title = (task: ClaudeTask) => task.displayName ?? task.id;

const OPEN = "Quit Claude Desktop before pushing; it overwrites the task list while open";

const settingsSchema = Schema.Struct({
  permissions: Schema.optionalKey(
    Schema.Struct({ defaultMode: Schema.optionalKey(Schema.String) }),
  ),
});

/** The mode a new task runs in: the app leaves it unset, so Claude Code's settings decide. */
const defaultMode = (cwd: string) =>
  Effect.gen(function* () {
    const files = [
      join(cwd, ".claude/settings.local.json"),
      join(cwd, ".claude/settings.json"),
      join(configDir(), "settings.json"),
    ];
    for (const file of files) {
      const settings = yield* readJson(file, settingsSchema, {}).pipe(
        Effect.orElseSucceed(() => ({})),
      );
      const mode = "permissions" in settings ? settings.permissions?.defaultMode : undefined;

      if (mode) {
        return { mode, source: file.replace(homedir(), "~") };
      }
    }

    return { mode: "default", source: undefined };
  });

// What happens when a run needs a tool you haven't allowed, by permission mode.
const MODES: Record<string, string> = {
  default: "Manual permissions, so a run stops for each tool you haven't allowed",
  acceptEdits: "Accept edits permissions, so a run stops for commands you haven't allowed",
  plan: "Plan mode, so runs can't change anything",
  dontAsk: "Don't ask permissions, so tools you haven't allowed are denied",
  auto: "Auto permissions",
  bypassPermissions: "Bypass permissions, so runs can do anything",
};
const describeMode = (mode: string) => MODES[mode] ?? `${mode} permissions`;
const stalls = (mode: string) => mode === "default" || mode === "acceptEdits";

/** Desktop has written both epoch milliseconds and ISO strings for times. */
const toDate = (value: number | string) =>
  new Date(typeof value === "number" ? (value < 1e12 ? value * 1000 : value) : value);

const toLive = (task: ClaudeTask) =>
  Effect.gen(function* () {
    const name = title(task);
    const base = {
      name,
      status: task.enabled ? "active" : "paused",
      lastRun: task.lastRunAt === undefined ? undefined : { at: toDate(task.lastRunAt) },
    } as const;

    if (task.cronExpression === undefined) {
      return {
        ...base,
        unsupported:
          task.fireAt === undefined
            ? "manual tasks have no schedule"
            : "one-time tasks have no cron form",
      } satisfies LiveSchedule;
    }

    const timing = timingFromCron(task.cronExpression);

    if (typeof timing === "string") {
      return { ...base, unsupported: timing } satisfies LiveSchedule;
    }

    const skill = yield* parseSkill(yield* readText(skillPath(task.id)));
    return { ...base, schedule: { name, timing, prompt: skill.prompt } } satisfies LiveSchedule;
  });

const make = Effect.gen(function* () {
  const { cwd } = yield* Workspace;
  const services = yield* Effect.context<Platform>();
  const manifestPath = yield* locateManifest;

  let manifest: Manifest | undefined;
  const loadManifest = readJson(manifestPath, manifestSchema, { scheduledTasks: [] }).pipe(
    Effect.tap((loaded) =>
      Effect.sync(() => {
        manifest = loaded;
      }),
    ),
  );
  const mine = (tasks: ReadonlyArray<ClaudeTask>) => tasks.filter((task) => task.cwd === cwd);

  const save = Effect.fn(function* ({ name, timing, prompt }: Schedule) {
    if (yield* appIsRunning) {
      return yield* fail(OPEN);
    }

    const current = manifest ?? (yield* loadManifest);
    const existing = mine(current.scheduledTasks).find((task) => title(task) === name);
    const cronExpression = formatCron(timing);

    if (existing) {
      const skill = yield* parseSkill(yield* readText(skillPath(existing.id)));
      yield* writeText(skillPath(existing.id), serializeSkill({ ...skill, prompt }));
      const { fireAt: _fireAt, ...rest } = existing;
      const updated = { ...rest, displayName: name, cronExpression };
      manifest = {
        ...current,
        scheduledTasks: current.scheduledTasks.map((task) => (task === existing ? updated : task)),
      };
      yield* writeJsonAtomic(manifestPath, manifest);
      return undefined;
    }

    const taken = new Set(current.scheduledTasks.map((task) => task.id));
    const base = slug(name);
    const id = taken.has(base) ? `${base}-${Date.now()}` : base;
    yield* writeText(
      skillPath(id),
      serializeSkill({
        frontmatter: `name: ${quoteYaml(id)}\ndescription: ${quoteYaml(describe(prompt))}`,
        prompt,
      }),
    );
    // The manifest's permission field isn't documented, so the mode is left to Claude Code's settings.
    manifest = {
      ...current,
      scheduledTasks: [
        ...current.scheduledTasks,
        {
          id,
          displayName: name,
          cronExpression,
          enabled: true,
          filePath: skillPath(id),
          createdAt: Date.now(),
          cwd,
        },
      ],
    };
    yield* writeJsonAtomic(manifestPath, manifest);
    const { mode } = yield* defaultMode(cwd);
    return stalls(mode)
      ? `${describeMode(mode)}: click Run now in the app and choose Always allow, or change the task's mode`
      : describeMode(mode);
  });

  return Harness.of({
    caveat:
      "Claude Desktop support is experimental: it edits the app's task list, which only works while the app is closed.",
    setup: [],
    list: loadManifest.pipe(
      Effect.flatMap(({ scheduledTasks }) => Effect.forEach(mine(scheduledTasks), toLive)),
      Effect.provideContext(services),
    ),
    check: () =>
      appIsRunning.pipe(
        Effect.map((open) => (open ? OPEN : undefined)),
        Effect.provideContext(services),
      ),
    save: (schedule) => save(schedule).pipe(Effect.provideContext(services)),
  });
});

const doctor = Effect.gen(function* () {
  const { cwd } = yield* Workspace;

  if (!(yield* exists(join(userDataDir(), "claude-code-sessions")))) {
    return [
      `no Claude Desktop data at ${userDataDir()}; the app has not run here or uses another location`,
    ];
  }

  const { mode, source } = yield* defaultMode(cwd);
  const lines = [
    `app ${(yield* appIsRunning) ? "running; quit it before pushing" : "not running"}`,
    `new tasks run with ${describeMode(mode)} (${source ? `from ${source}` : "no defaultMode set"})`,
  ];
  const manifestPath = yield* locateManifest.pipe(
    Effect.catchTag("HarnessError", (error) => Effect.succeed(error)),
  );

  if (manifestPath instanceof HarnessError) {
    return [...lines, manifestPath.message];
  }

  const { scheduledTasks } = yield* readJson(manifestPath, manifestSchema, { scheduledTasks: [] });
  return [
    ...lines,
    `manifest ${manifestPath}: ${scheduledTasks.length} tasks, ${scheduledTasks.filter((task) => task.cwd === cwd).length} for ${cwd}`,
  ];
});

export const claudeDesktop: HarnessDefinition = { layer: Layer.effect(Harness, make), doctor };
