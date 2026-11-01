import type { MetadataRoute } from "next";
import { SITE, skillPath } from "@/lib/site";
import { cachedSkillPaths } from "@/server/cached";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const skills = await cachedSkillPaths();
  const paths = [
    "/",
    "/docs",
    "/docs/cli",
    "/docs/format",
    "/docs/harnesses",
    "/docs/faq",
    "/sponsor",
    ...skills.map(skillPath),
  ];
  return paths.map((path) => ({ url: `${SITE.origin}${path}` }));
}
