import { cacheLife, cacheTag } from "next/cache";
import { getShowcaseSchedules } from "@/components/showcase/showcase-schedules";
import { getLeaderboard, getRepository, getSchedule, getSponsors } from "@/db";
import { run } from "./runtime";

/** Everything read from the schedules and installs tables. Refreshed when a listing changes. */
export const SCHEDULES_TAG = "schedules";
/** The live sponsor row. Refreshed when Stripe reports a change. */
export const SPONSORS_TAG = "sponsors";

export async function cachedLeaderboard(options: Parameters<typeof getLeaderboard>[0] = {}) {
  "use cache";
  cacheTag(SCHEDULES_TAG);
  cacheLife("minutes");
  return run(getLeaderboard(options));
}

export async function cachedRepository(owner: string, repo: string) {
  "use cache";
  cacheTag(SCHEDULES_TAG);
  cacheLife("minutes");
  return run(getRepository(owner, repo));
}

export async function cachedSchedule(owner: string, repo: string, name: string) {
  "use cache";
  cacheTag(SCHEDULES_TAG);
  cacheLife("minutes");
  return run(getSchedule(owner, repo, name));
}

export async function cachedShowcase() {
  "use cache";
  cacheTag(SCHEDULES_TAG);
  cacheLife("hours");
  return run(getShowcaseSchedules());
}

export async function cachedSponsors() {
  "use cache";
  cacheTag(SPONSORS_TAG);
  cacheLife("hours");
  return run(getSponsors());
}
