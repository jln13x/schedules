import type { MetadataRoute } from "next";
import { schedulePath, SITE } from "@/lib/site";
import { cachedLeaderboard } from "@/server/cached";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const schedules = await cachedLeaderboard();
  const paths = [
    "/",
    "/docs",
    "/docs/cli",
    "/docs/format",
    "/docs/harnesses",
    "/docs/faq",
    "/submit",
    "/sponsor",
    ...new Set(schedules.map((entry) => `/${entry.owner}/${entry.repo}`)),
    ...schedules.map(schedulePath),
  ];
  return paths.map((path) => ({ url: `${SITE.origin}${path}` }));
}
