import { expect, it } from "bun:test";
import { like } from "drizzle-orm";
import { TestServices, testRuntime } from "@/server/testing";
import { Database } from "./database";
import { skills } from "./schema";
import { getSkill, listedSkillPaths, listingOf, rankedSkills } from "./skills";

const run = testRuntime(TestServices).runPromise;

const base = {
  owner: "rank-fixture",
  repo: "tools",
  recurring: 0.9,
  usefulness: 80,
  forTeam: 0.5,
  abuse: 0.02,
  cadence: "weekly",
  time: "morning",
  installs: 1000,
};
const row = (slug: string, overrides: Partial<typeof skills.$inferInsert> = {}) => ({
  ...base,
  id: `${base.owner}/${base.repo}/${slug}`,
  slug,
  name: slug,
  description: `${slug} does things`,
  ...overrides,
});

it.skipIf(Boolean(process.env.DATABASE_URL))(
  "lists skills by usefulness weighted with installs, filtered by fit and search, hiding the rest",
  async () => {
    await run(
      Database.query((db) =>
        db
          .insert(skills)
          .values([
            row("popular-handy", { usefulness: 40, installs: 1_000_000 }),
            row("niche-essential", { usefulness: 100, installs: 10 }),
            row("daily-recap", { forTeam: 0.05, cadence: "daily", time: "evening" }),
            row("issue-triage", { forTeam: 0.95 }),
            row("not-recurring", { recurring: 0.2 }),
            row("abusive", { abuse: 0.9 }),
            row("hidden-by-hand", { hidden: "spam" }),
            row("failed-audit", { audit: "fail" }),
            row("a-fork", { duplicate: true }),
            row("unclassified", { recurring: null, usefulness: null }),
          ]),
      ),
    );

    try {
      const ranked = (await run(rankedSkills())).map(listingOf);
      expect(ranked.map((skill) => skill.slug)).toEqual([
        "daily-recap",
        "issue-triage",
        "popular-handy",
        "niche-essential",
      ]);
      expect(ranked[0]).toMatchObject({
        schedule: { cron: "0 17 * * *", label: "Every day at 17:00" },
        fits: { you: true, team: false },
      });
      expect(ranked[1]?.schedule.cron).toBe("0 8 * * 1");
      expect(ranked[1]?.fits).toEqual({ you: false, team: true });
      expect(ranked[2]?.fits).toEqual({ you: true, team: true });

      expect((await run(rankedSkills({ fit: "you" }))).map((skill) => skill.slug)).toEqual([
        "daily-recap",
        "popular-handy",
        "niche-essential",
      ]);
      expect((await run(rankedSkills({ fit: "team" }))).map((skill) => skill.slug)).toEqual([
        "issue-triage",
        "popular-handy",
        "niche-essential",
      ]);
      expect((await run(rankedSkills({ query: "TRIAGE" }))).map((skill) => skill.slug)).toEqual([
        "issue-triage",
      ]);
      expect(await run(rankedSkills({ query: "100%_" }))).toEqual([]);

      expect(await run(getSkill(base.owner, base.repo, "daily-recap"))).toMatchObject({
        name: "daily-recap",
        usefulness: 80,
      });
      expect(await run(getSkill(base.owner, base.repo, "abusive"))).toBeUndefined();
      expect(await run(getSkill(base.owner, base.repo, "missing"))).toBeUndefined();

      const paths = await run(listedSkillPaths());
      expect(paths.filter((path) => path.owner === base.owner)).toHaveLength(4);
    } finally {
      await run(
        Database.query((db) => db.delete(skills).where(like(skills.id, `${base.owner}/%`))),
      );
    }
  },
  60_000,
);
