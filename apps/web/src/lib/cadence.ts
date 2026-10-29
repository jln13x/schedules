/** The cadences Jev chooses from, each with the cron a schedule gets by default. */
export const CADENCES = {
  daily: { label: "Every day", cron: "0 9 * * *" },
  weekdays: { label: "Every weekday", cron: "0 9 * * 1-5" },
  weekly: { label: "Every week", cron: "0 9 * * 1" },
  monthly: { label: "Every month", cron: "0 9 1 * *" },
} as const;

export type Cadence = keyof typeof CADENCES;

export const isCadence = (value: string | null | undefined): value is Cadence =>
  value !== null && value !== undefined && value in CADENCES;

export const FITS = {
  you: { label: "For you", short: "You" },
  team: { label: "For your team", short: "Team" },
} as const;

export type Fit = keyof typeof FITS;
