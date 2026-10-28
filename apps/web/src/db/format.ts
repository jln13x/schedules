import {
  describeTiming,
  formatCron,
  parseSchedule,
  serializeSchedule,
  timingFromCron,
} from "@agent-schedules/format";
import { z } from "zod";

export const IDENTITY_LIMITS = { repositorySegment: 100, scheduleSlug: 200 } as const;

export const REPOSITORY_SEGMENT = z
  .string()
  .min(1)
  .max(IDENTITY_LIMITS.repositorySegment)
  .regex(/^[\w.-]+$/, "Expected a GitHub repository segment")
  .refine((value) => value !== "." && value !== "..", "Invalid repository segment");
export const SCHEDULE_SLUG = z
  .string()
  .min(1)
  .max(IDENTITY_LIMITS.scheduleSlug)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase schedule slug");

const IDENTITY_PART = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9_.-]+$/, "Expected a repository identity segment")
  .refine((value) => value !== "." && value !== "..", "Invalid repository identity segment");

export const SCHEDULE_INPUT_SCHEMA = z.object({
  owner: IDENTITY_PART,
  repo: IDENTITY_PART,
  name: IDENTITY_PART,
  displayName: z.string().trim().min(1).max(120),
  cron: z.string().refine((cron) => typeof timingFromCron(cron) !== "string", "Unsupported cron"),
  prompt: z.string().trim().min(1),
});

export function parseScheduleSource(source: string) {
  const { name, timing, prompt } = parseSchedule(source, "schedule");
  return { displayName: name, cron: formatCron(timing), prompt };
}

/** The schedule as a file, the way `add` writes it into a repository. */
export function scheduleFile(schedule: { displayName: string; cron: string; prompt: string }) {
  return serializeSchedule({
    name: schedule.displayName,
    timing: scheduleTiming(schedule.cron),
    prompt: schedule.prompt,
  });
}

export const descriptionOf = (prompt: string) => prompt.split(/\r?\n/)[0] ?? prompt;

export function scheduleTiming(cron: string) {
  const timing = timingFromCron(cron);

  if (typeof timing === "string") {
    throw new Error(timing);
  }

  return timing;
}

export function formatWhen(cron: string) {
  return describeTiming(scheduleTiming(cron));
}
