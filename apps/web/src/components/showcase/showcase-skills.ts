import { Effect } from "effect";
import { listingOf, rankedSkills } from "@/db/skills";
import { skillPath } from "@/lib/site";

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

export interface ShowcaseSkill {
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
function summaryOf(text: string) {
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? text;

  if (sentence.length <= SUMMARY_LENGTH) {
    return sentence;
  }

  const cut = sentence.slice(0, SUMMARY_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), SUMMARY_LENGTH - 20)).trimEnd()}…`;
}

export const getShowcaseSkills = Effect.fn("getShowcaseSkills")(function* () {
  const listed = yield* rankedSkills({ limit: SHOWCASE_SIZE });
  return listed.map(listingOf).map((skill): ShowcaseSkill => {
    const { time, weekdays } = skill.schedule;
    return {
      key: skillPath(skill),
      name: skill.name,
      time,
      cadence: cadenceOf(weekdays),
      days: WEEK.map((day) => weekdays === null || weekdays.includes(day)),
      summary: summaryOf(skill.description || skill.name),
    };
  });
});
