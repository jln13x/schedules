import { describeTiming, timingFromCron } from "@agent-schedules/format";
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
