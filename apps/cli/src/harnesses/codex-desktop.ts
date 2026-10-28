import { homedir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, Option, Schedule as EffectSchedule, Schema } from "effect";
import { parse, stringify } from "smol-toml";
import {
  type HarnessDefinition,
  type LiveSchedule,
  type Platform,
  Harness,
  Workspace,
  decode,
  exec,
  exists,
  fail,
  findOnPath,
  listDirectory,
  loose,
  parseJson,
  readTextIfExists,
  writeText,
} from "../harness.ts";
import { type Schedule, type Timing, normalizeWeekdays, slug, wholeNumber } from "../schedule.ts";

const codexHome = () => process.env.CODEX_HOME ?? join(homedir(), ".codex");
const appDatabase = () => join(codexHome(), "sqlite/codex-dev.db");
const automationsDir = () => join(codexHome(), "automations");
const recordPath = (id: string) => join(automationsDir(), id, "automation.toml");

/**
 * Values in the app's automations table, or undefined when it can't be read here. The app
 * schedules from this table and loads the TOML files into it, so a file only counts once its id
 * shows up. Row values are searched rather than a known column, because the schema is the app's own.
 */
const appAutomations = Effect.gen(function* () {
  if (!(yield* exists(appDatabase())) || !(yield* findOnPath("sqlite3"))) {
    return undefined;
  }

  const stdout = yield* exec("sqlite3", [
    "-readonly",
    "-json",
    appDatabase(),
    "select * from automations",
  ]);
  const rows = yield* decode(
    Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
    yield* parseJson(stdout.trim() || "[]", "Codex app database"),
    "Codex app database",
  );
  return new Set(rows.flatMap((row) => Object.values(row).map(String)));
});

const NO_APP =
  "the Codex desktop app hasn't run on this machine, so nothing would run this task; use the codex harness to schedule the Codex CLI instead";

const confirmLoaded = (id: string) =>
  Effect.gen(function* () {
    // The file is written either way; an unreadable database only means it can't be confirmed.
    const loaded = yield* appAutomations.pipe(
      Effect.orElseSucceed(() => null),
      Effect.repeat({
        schedule: EffectSchedule.spaced("500 millis"),
        times: 9,
        until: (rows) => rows === null || rows === undefined || rows.has(id),
      }),
    );

    if (loaded === null) {
      return "written; couldn't read the Codex app's database to confirm it loaded the task";
    }

    if (!loaded) {
      return "written; install sqlite3 to confirm the Codex app loaded it";
    }

    if (loaded.has(id)) {
      return "loaded by the Codex app";
    }

    return "written, but the Codex app hasn't loaded it yet; open the app and check Scheduled";
  });

// Codex writes BYDAY Monday first, so this order keeps rewritten rules identical to the app's own.
const RRULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const CRON_WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 } as const;

const recordSchema = loose({
  id: Schema.String,
  kind: Schema.String,
  name: Schema.String,
  prompt: Schema.String,
  status: Schema.Literals(["ACTIVE", "PAUSED"]),
  rrule: Schema.String,
  cwds: Schema.Array(Schema.String),
});
type CodexRecord = typeof recordSchema.Type;

const isRruleDay = (day: string): day is (typeof RRULE_DAYS)[number] =>
  (RRULE_DAYS as ReadonlyArray<string>).includes(day);
const RRULE_FIELDS = new Set(["FREQ", "BYDAY", "BYHOUR", "BYMINUTE", "BYSECOND", "INTERVAL"]);

export function fromRrule(rrule: string): Timing | string {
  const unsupported = `rule ${rrule} is not a time of day on chosen weekdays`;
  const fields = new Map(
    rrule
      .replace(/^RRULE:/, "")
      .split(";")
      .map((field) => {
        const [key = "", value = ""] = field.split("=");
        return [key, value] as const;
      }),
  );
  const frequency = fields.get("FREQ");
  const hour = wholeNumber(fields.get("BYHOUR"), 0, 23);
  const minute = wholeNumber(fields.get("BYMINUTE"), 0, 59);
  const days = fields.get("BYDAY")?.split(",");

  if (
    [...fields.keys()].some((key) => !RRULE_FIELDS.has(key)) ||
    (frequency !== "DAILY" && frequency !== "WEEKLY") ||
    hour === undefined ||
    minute === undefined ||
    (fields.has("BYSECOND") && fields.get("BYSECOND") !== "0") ||
    (fields.has("INTERVAL") && fields.get("INTERVAL") !== "1") ||
    (days !== undefined && !days.every(isRruleDay)) ||
    // Without BYDAY a weekly rule repeats on its start date's weekday, which the rule alone does not say.
    (frequency === "WEEKLY" && days === undefined)
  ) {
    return unsupported;
  }

  return {
    minute,
    hour,
    weekdays: days
      ? normalizeWeekdays(days.filter(isRruleDay).map((day) => CRON_WEEKDAY[day]))
      : null,
  };
}

export function toRrule({ minute, hour, weekdays }: Timing): string {
  const days = RRULE_DAYS.filter(
    (day) => weekdays === null || weekdays.includes(CRON_WEEKDAY[day]),
  );
  return `FREQ=WEEKLY;BYDAY=${days.join(",")};BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`;
}

const decodeWorkspaces = Schema.decodeUnknownOption(
  Schema.Struct({
    cwds: Schema.optionalKey(Schema.Array(Schema.String)),
    name: Schema.optionalKey(Schema.String),
  }),
);
const decodeRecord = Schema.decodeUnknownOption(recordSchema);

interface Entry {
  readonly id: string;
  readonly name: string;
  readonly cwds: ReadonlyArray<string>;
  /** Missing when the file isn't an automation this tool can read. */
  readonly record?: CodexRecord | undefined;
}

const readEntries = Effect.gen(function* () {
  const entries: Array<Entry> = [];
  for (const id of yield* listDirectory(automationsDir())) {
    const text = yield* readTextIfExists(recordPath(id));

    if (text === undefined) {
      continue;
    }

    const raw = yield* Effect.try({
      try: () => parse(text),
      catch: () => undefined,
    }).pipe(Effect.orElseSucceed(() => ({})));
    const { cwds = [], name = id } = Option.getOrElse(
      decodeWorkspaces(raw),
      (): { readonly cwds?: ReadonlyArray<string>; readonly name?: string } => ({}),
    );
    entries.push({ id, name, cwds, record: Option.getOrUndefined(decodeRecord(raw)) });
  }
  return entries;
});

const toLive = ({ name, record }: Entry): LiveSchedule => {
  if (!record) {
    return {
      name,
      status: "active",
      unsupported: "automation.toml is not a Codex automation this tool can read",
    };
  }

  const status = record.status === "PAUSED" ? "paused" : "active";
  const timing =
    record.kind === "cron"
      ? fromRrule(record.rrule)
      : `${record.kind} automations belong to a thread`;
  return typeof timing === "string"
    ? { name: record.name, status, unsupported: timing }
    : { name: record.name, status, schedule: { name: record.name, timing, prompt: record.prompt } };
};

const make = Effect.gen(function* () {
  const { cwd } = yield* Workspace;
  const services = yield* Effect.context<Platform>();
  const mine = readEntries.pipe(
    Effect.map((entries) => entries.filter((entry) => entry.cwds.includes(cwd))),
  );

  const save = Effect.fn(function* ({ name, timing, prompt }: Schedule) {
    const now = Date.now();
    const definition = { name, prompt, rrule: toRrule(timing), updated_at: now };
    const existing = (yield* mine).find((entry) => entry.name === name)?.record;

    if (existing) {
      // One automation can serve several workspaces; a push from one would rewrite them all.
      if (existing.cwds.length > 1) {
        return yield* fail(
          `Codex automation ${existing.id} is shared by ${existing.cwds.length} workspaces; edit it in the Codex app`,
        );
      }

      yield* writeText(recordPath(existing.id), stringify({ ...existing, ...definition }));
      return yield* confirmLoaded(existing.id);
    }

    const id = slug(name);

    if (yield* exists(recordPath(id))) {
      return yield* fail(`Codex automation ${id} already exists for another workspace or name`);
    }

    yield* writeText(
      recordPath(id),
      stringify({
        version: 1,
        id,
        kind: "cron",
        status: "ACTIVE",
        ...definition,
        execution_environment: "local",
        cwds: [cwd],
        created_at: now,
      }),
    );
    return yield* confirmLoaded(id);
  });

  return Harness.of({
    caveat:
      "Codex desktop support is experimental: it writes the app's automation files and checks that the app loaded them. Tasks run while the app is open.",
    setup: [],
    check: () =>
      exists(appDatabase()).pipe(
        Effect.map((found) => (found ? undefined : NO_APP)),
        Effect.provideContext(services),
      ),
    list: mine.pipe(
      Effect.map((entries) => entries.map(toLive)),
      Effect.provideContext(services),
    ),
    save: (schedule) => save(schedule).pipe(Effect.provideContext(services)),
  });
});

const doctor = Effect.gen(function* () {
  const { cwd } = yield* Workspace;
  const entries = yield* readEntries;
  const mine = entries.filter((entry) => entry.cwds.includes(cwd));
  const lines = [
    `${entries.length} automation files in ${automationsDir()}, ${mine.length} for ${cwd}`,
  ];

  if (!(yield* exists(appDatabase()))) {
    return [...lines, `not ready: ${NO_APP}`];
  }

  const loaded = yield* appAutomations;

  if (!loaded) {
    return [
      ...lines,
      `app database at ${appDatabase()}; install sqlite3 to compare it with the files`,
    ];
  }

  return [
    ...lines,
    ...mine.map(
      ({ id }) =>
        `${id}: ${loaded.has(id) ? "loaded by the app" : "file only, the app hasn't loaded it"}`,
    ),
  ];
});

export const codexDesktop: HarnessDefinition = { layer: Layer.effect(Harness, make), doctor };
