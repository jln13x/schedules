import { Effect } from "effect";
import { getLeaderboard } from "@/db";
import { scheduleTiming } from "@/db/format";
import { SAMPLE_SCHEDULES } from "@/db/samples";
import { schedulePath } from "@/lib/site";

const SHOWCASE_SIZE = 8;
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

export interface ShowcaseSchedule {
  key: string;
  name: string;
  time: string;
  cadence: string;
  days: boolean[];
  summary: string;
}

function cadenceOf(weekdays: ReadonlyArray<number> | null) {
  if (weekdays === null) {
    return "Every day";
  }

  if (weekdays.join(",") === "1,2,3,4,5") {
    return "Every weekday";
  }

  const names = WEEK.filter((day) => weekdays.includes(day)).map((day) => DAY_NAMES[day]);
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}

const SUMMARY_LENGTH = 150;

/** The first sentence, cut at a word boundary so no card needs more than three lines. */
function summaryOf(prompt: string) {
  const sentence = prompt.split(/(?<=[.!?])\s/)[0]?.trim() ?? prompt;

  if (sentence.length <= SUMMARY_LENGTH) {
    return sentence;
  }

  const cut = sentence.slice(0, SUMMARY_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), SUMMARY_LENGTH - 20)).trimEnd()}…`;
}

export const getShowcaseSchedules = Effect.fn("getShowcaseSchedules")(function* () {
  const listed = yield* getLeaderboard({ limit: SHOWCASE_SIZE });
  const entries =
    listed.length >= 5
      ? listed.map((entry) => ({
          key: schedulePath(entry),
          name: entry.displayName,
          cron: entry.cron,
          prompt: entry.prompt,
        }))
      : SAMPLE_SCHEDULES.map((entry) => ({
          key: entry.name,
          name: entry.displayName,
          cron: entry.cron,
          prompt: entry.prompt,
        }));
  return entries.slice(0, SHOWCASE_SIZE).map(({ key, name, cron, prompt }): ShowcaseSchedule => {
    const { minute, hour, weekdays } = scheduleTiming(cron);
    const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return {
      key,
      name,
      time,
      cadence: cadenceOf(weekdays),
      days: WEEK.map((day) => weekdays === null || weekdays.includes(day)),
      summary: summaryOf(prompt),
    };
  });
});
