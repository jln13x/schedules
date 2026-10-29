/** How often Jev suggests running a skill. The schedule format has no day of the month, so no monthly. */
export const CADENCES = {
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
} as const;

export type Cadence = keyof typeof CADENCES;

/** When in the day it should run. Runs happen on the user's machine, so nothing at night. */
export const TIMES = {
  morning: { label: "Start of day", hour: 8 },
  midday: { label: "Midday", hour: 12 },
  evening: { label: "End of day", hour: 17 },
} as const;

export type TimeOfDay = keyof typeof TIMES;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface SuggestedSchedule {
  readonly cron: string;
  readonly hour: number;
  /** Days of the week it runs, 0 for Sunday; null for every day. */
  readonly weekdays: ReadonlyArray<number> | null;
  /** "Every weekday at 08:00" */
  readonly label: string;
  readonly days: string;
  readonly time: string;
}

/** A weekly run at the end of the day reads as a wrap-up, so it lands on Friday; otherwise Monday. */
export function suggestedSchedule(cadence: Cadence, time: TimeOfDay): SuggestedSchedule {
  const { hour } = TIMES[time];
  const weekdays =
    cadence === "daily"
      ? null
      : cadence === "weekdays"
        ? [1, 2, 3, 4, 5]
        : [time === "evening" ? 5 : 1];
  const days =
    cadence === "daily"
      ? "Every day"
      : cadence === "weekdays"
        ? "Every weekday"
        : `Every ${DAY_NAMES[weekdays?.[0] ?? 1]}`;
  const clock = `${String(hour).padStart(2, "0")}:00`;
  const field = weekdays === null ? "*" : cadence === "weekdays" ? "1-5" : String(weekdays[0]);
  return {
    cron: `0 ${hour} * * ${field}`,
    hour,
    weekdays,
    label: `${days} at ${clock}`,
    days,
    time: clock,
  };
}

export const isCadence = (value: string | null | undefined): value is Cadence =>
  value !== null && value !== undefined && value in CADENCES;

export const isTimeOfDay = (value: string | null | undefined): value is TimeOfDay =>
  value !== null && value !== undefined && value in TIMES;

export const FITS = {
  you: {
    badge: "You",
    filter: "For you",
    explanation: "Each person schedules it for their own work and gets a result of their own.",
  },
  team: {
    badge: "Team",
    filter: "For your team",
    explanation:
      "One run covers the whole team, so one person schedules it. Running it for everyone would repeat the work.",
  },
} as const;

export type Fit = keyof typeof FITS;
