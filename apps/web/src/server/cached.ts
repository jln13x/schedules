import { cacheLife, cacheTag } from "next/cache";
import { getShowcaseSkills } from "@/components/showcase/showcase-skills";
import { getSponsors } from "@/db";
import { getSkill, listedSkillPaths, rankedSkills, type SkillQuery } from "@/db/skills";
import { run } from "./runtime";

/** Everything read from the skills table. Refreshed after each import. */
export const SKILLS_TAG = "skills";
/** The live sponsor row. Refreshed when Stripe reports a change. */
export const SPONSORS_TAG = "sponsors";

export async function cachedSkills(options: SkillQuery = {}) {
  "use cache";
  cacheTag(SKILLS_TAG);
  cacheLife("minutes");
  return run(rankedSkills(options));
}

export async function cachedSkill(owner: string, repo: string, slug: string) {
  "use cache";
  cacheTag(SKILLS_TAG);
  cacheLife("minutes");
  return run(getSkill(owner, repo, slug));
}

export async function cachedSkillPaths() {
  "use cache";
  cacheTag(SKILLS_TAG);
  cacheLife("hours");
  return run(listedSkillPaths());
}

export async function cachedShowcase() {
  "use cache";
  cacheTag(SKILLS_TAG);
  cacheLife("hours");
  return run(getShowcaseSkills());
}

export async function cachedSponsors() {
  "use cache";
  cacheTag(SPONSORS_TAG);
  cacheLife("hours");
  return run(getSponsors());
}
