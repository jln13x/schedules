import slugify from "@sindresorhus/slugify";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Result, Schema } from "effect";

const WEEKDAY_COUNT = 7;
const NAME_LIMIT = 120;

/**
 * Wall-clock runs on selected weekdays, in the scheduler's local time zone.
 * `weekdays` uses cron numbering (0 is Sunday); null means every day.
 */
export interface Timing {
  readonly minute: number;
  readonly hour: number;
  readonly weekdays: ReadonlyArray<number> | null;
}

export interface Schedule {
  readonly name: string;
  readonly timing: Timing;
  readonly prompt: string;
}

export function wholeNumber(
  text: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (text === undefined || !/^\d+$/.test(text)) {
    return undefined;
  }

  const value = Number(text);
  return value >= min && value <= max ? value : undefined;
}

export function slug(name: string): string {
  const value = slugify(name);

  if (!value) {
    throw new Error(`"${name}" needs a letter or digit to name its file`);
  }

  return value;
}

function parseWeekdays(field: string): ReadonlyArray<number> | null | string {
  if (field === "*") {
    return null;
  }

  const days: Array<number> = [];
  for (const token of field.split(",")) {
    const day = wholeNumber(token, 0, WEEKDAY_COUNT);

    if (day !== undefined) {
      days.push(day % WEEKDAY_COUNT);
      continue;
    }

    const range = /^(\d)-(\d)$/.exec(token);
    const from = Number(range?.[1]);
    const to = Number(range?.[2]);

    if (!range || from > to || to > WEEKDAY_COUNT) {
      return `Weekday ${token} must be 0-7 or a range such as 1-5`;
    }

    for (let next = from; next <= to; next += 1) {
      days.push(next % WEEKDAY_COUNT);
    }
  }

  return normalizeWeekdays(days);
}

// Only the shape every supported scheduler can represent exactly: a time of day on chosen weekdays.
function parseCron(cron: string): Timing | string {
  const fields = cron.trim().split(/\s+/);

  if (fields.length !== 5) {
    return "Expected cron 'minute hour * * weekdays', for example '0 9 * * 1-5'";
  }

  const [minuteField, hourField, dayOfMonth, month, weekdayField = ""] = fields;
  const minute = wholeNumber(minuteField, 0, 59);
  const hour = wholeNumber(hourField, 0, 23);

  if (minute === undefined) {
    return `Minute ${minuteField} must be a number from 0 to 59`;
  }

  if (hour === undefined) {
    return `Hour ${hourField} must be a number from 0 to 23`;
  }

  if (dayOfMonth !== "*") {
    return "Day of month must be *";
  }

  if (month !== "*") {
    return "Month must be *";
  }

  const weekdays = parseWeekdays(weekdayField);
  return typeof weekdays === "string" ? weekdays : { minute, hour, weekdays };
}

export function timingFromCron(cron: string): Timing | string {
  const timing = parseCron(cron);
  return typeof timing === "string"
    ? `cron "${cron}" is not a time of day on chosen weekdays`
    : timing;
}

const decodeFrontmatter = Schema.decodeUnknownResult(
  Schema.Struct({ name: Schema.String, schedule: Schema.String }),
  { onExcessProperty: "error" },
);

export function normalizeWeekdays(days: ReadonlyArray<number>): ReadonlyArray<number> | null {
  const unique = [...new Set(days)].toSorted((left, right) => left - right);
  return unique.length === WEEKDAY_COUNT ? null : unique;
}

export function formatCron({ minute, hour, weekdays }: Timing): string {
  if (weekdays === null) {
    return `${minute} ${hour} * * *`;
  }

  const runs: Array<Array<number>> = [];
  for (const day of weekdays) {
    const run = runs.at(-1);

    if (run && run.at(-1) === day - 1) {
      run.push(day);
    } else {
      runs.push([day]);
    }
  }
  const days = runs
    .flatMap((run) => (run.length >= 3 ? [`${run[0]}-${run.at(-1)}`] : run.map(String)))
    .join(",");
  return `${minute} ${hour} * * ${days}`;
}

const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];
const WORKDAYS = "1,2,3,4,5";

export function describeTiming({ minute, hour, weekdays }: Timing): string {
  const days =
    weekdays === null
      ? "Daily"
      : weekdays.join(",") === WORKDAYS
        ? "Weekdays"
        : weekdays.map((day) => DAY_NAMES[day]).join(", ");
  return `${days} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseSchedule(raw: string, source: string): Schedule {
  // Editors add a byte order mark or CRLF without the content changing.
  const text = raw.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);

  if (!match) {
    throw new Error(`${source}: expected YAML frontmatter between --- lines`);
  }

  const [, frontmatter = "", body = ""] = match;
  const parsed = decodeFrontmatter(parseYaml(frontmatter));

  if (Result.isFailure(parsed)) {
    throw new Error(`${source}: ${parsed.failure.message}`);
  }

  const name = parsed.success.name.trim();

  if (slugify(name) === "") {
    throw new Error(`${source}: name needs a letter or digit`);
  }

  // Names end up in scheduler config files, where a line break would start a new directive.
  if (/\p{Cc}/u.test(name)) {
    throw new Error(`${source}: name must be a single line`);
  }

  // Invisible characters would let two names look the same, and long ones overflow file names.
  if (/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u.test(name)) {
    throw new Error(`${source}: name contains invisible characters`);
  }

  if (name.length > NAME_LIMIT) {
    throw new Error(`${source}: name must be at most ${NAME_LIMIT} characters`);
  }

  const timing = parseCron(parsed.success.schedule);

  if (typeof timing === "string") {
    throw new Error(`${source}: schedule: ${timing}`);
  }

  const prompt = body.trim();

  if (!prompt) {
    throw new Error(`${source}: the prompt body is empty`);
  }

  return { name, timing, prompt };
}

export function serializeSchedule({ name, timing, prompt }: Schedule): string {
  const frontmatter = stringifyYaml({ name, schedule: formatCron(timing) }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${prompt.trim()}\n`;
}

export function sameSchedule(left: Schedule, right: Schedule): boolean {
  return serializeSchedule(left) === serializeSchedule(right);
}
