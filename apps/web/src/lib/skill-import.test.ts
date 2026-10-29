import { expect, it } from "bun:test";
import { like, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { DecisionModel } from "effect/ai";
import { Database } from "@/db/database";
import { PgliteDatabase } from "@/db/pglite";
import { skills } from "@/db/schema";
import { rankedSkills } from "@/db/skills";
import { fakeFetch, testRuntime, usingFetch } from "@/server/testing";
import { schedulableInput } from "./schedulable";
import { importSkills } from "./skill-import";
import { SkillsSh } from "./skills-sh";

const DATABASE_TEST = it.skipIf(Boolean(process.env.DATABASE_URL));
const API = "https://skills.sh/api/v1";

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
process.env.VERCEL_OIDC_TOKEN = `${encode({ alg: "none" })}.${encode({ exp: 4_102_444_800 })}.signature`;

let decisions = 0;
/** Calls a skill recurring when its name mentions a brief, and answers everything else the same. */
const FakeJev = Layer.effect(
  DecisionModel.DecisionModel,
  DecisionModel.make({
    decide: ({ state }) =>
      Effect.sync(() => {
        decisions += 1;
        const recurring = JSON.stringify(state).includes("brief") ? 0.9 : 0.1;
        return {
          answers: {
            recurring: { _tag: "Probability", probability: recurring },
            usefulness: {
              _tag: "Rate",
              rating: 2,
              probabilities: { marginal: 0, handy: 0, valuable: 1, essential: 0 },
            },
            audience: { _tag: "Classify", label: "each", probabilities: { each: 0.8, once: 0.2 } },
            abuse: { _tag: "Probability", probability: 0.05 },
            cadence: {
              _tag: "Classify",
              label: "weekdays",
              probabilities: { daily: 0, weekdays: 1, weekly: 0, monthly: 0 },
            },
          },
          usage: { inputTokens: 100, outputTokens: 0 },
        };
      }),
  }),
);
const runtime = testRuntime(Layer.mergeAll(PgliteDatabase, SkillsSh.layer, FakeJev));

const skillMd = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: >-\n  ${description}\n---\n\n# ${name}\n`;
const listed = (source: string, slug: string, installs: number, extra: object = {}) => ({
  id: `${source}/${slug}`,
  slug,
  name: slug,
  source,
  installs,
  sourceType: source.includes(".") ? "well-known" : "github",
  ...extra,
});

function skillsSh() {
  const routes = {
    [`${API}/skills?view=all-time&page=0&per_page=10`]: {
      data: [
        listed("test-acme/tools", "morning-brief", 900),
        listed("test-acme/tools", "pdf-tools", 800),
        listed("test-acme/tools", "gone", 700),
        listed("test-fork/tools", "morning-brief", 600, { isDuplicate: true }),
        listed("docs.example.com", "guide", 500),
      ],
      pagination: { hasMore: false, total: 5 },
    },
    [`${API}/skills/test-acme/tools/morning-brief`]: {
      hash: "brief-v1",
      files: [
        { path: "SKILL.md", contents: skillMd("morning-brief", "List what needs me today.") },
      ],
    },
    [`${API}/skills/test-acme/tools/pdf-tools`]: {
      hash: "pdf-v1",
      files: [{ path: "skills/pdf-tools/SKILL.md", contents: skillMd("pdf-tools", "Edit PDFs.") }],
    },
    [`${API}/skills/audit/test-acme/tools/morning-brief`]: {
      audits: [{ status: "pass" }, { status: "warn" }],
    },
  };
  return fakeFetch(routes);
}

const run = <A, E>(
  effect: Effect.Effect<A, E, Database | SkillsSh | DecisionModel.DecisionModel>,
  fetch: typeof globalThis.fetch,
) => runtime.runPromise(effect.pipe(usingFetch(fetch)));
const options = { pages: 1, perPage: 10, budget: 10 };
const requested = (fetch: ReturnType<typeof fakeFetch>) =>
  fetch.mock.calls.map(([url]) => String(url).replace(API, ""));

DATABASE_TEST(
  "classifies due GitHub skills once, audits only listable ones, and skips forks and other sources",
  async () => {
    const fetch = skillsSh();
    decisions = 0;

    try {
      expect(await run(importSkills(options), fetch)).toEqual({
        seen: 4,
        due: 3,
        classified: 2,
        unchanged: 0,
        missing: 1,
        failed: 0,
      });
      expect(decisions).toBe(2);
      expect(requested(fetch)).not.toContain("/skills/audit/test-acme/tools/pdf-tools");
      expect(requested(fetch).some((path) => path.includes("test-fork"))).toBe(false);

      const ranked = await run(
        rankedSkills().pipe(Effect.map((rows) => rows.filter((row) => row.owner === "test-acme"))),
        fetch,
      );
      expect(ranked).toMatchObject([
        {
          id: "test-acme/tools/morning-brief",
          description: "List what needs me today.",
          usefulness: 67,
          forTeam: 0.2,
          cadence: "weekdays",
          audit: "warn",
        },
      ]);

      await run(
        Database.query((db) =>
          db
            .update(skills)
            .set({ fetchedAt: sql`now() - interval '8 days'` })
            .where(like(skills.id, "test-%")),
        ),
        fetch,
      );
      expect(await run(importSkills(options), fetch)).toMatchObject({
        due: 3,
        classified: 0,
        unchanged: 2,
        missing: 1,
      });
      expect(decisions).toBe(2);
      expect(await run(importSkills(options), fetch)).toMatchObject({ due: 0 });
    } finally {
      await run(
        Database.query((db) => db.delete(skills).where(like(skills.id, "test-%"))),
        fetch,
      );
    }
  },
  60_000,
);

it("reads name and description from folded, quoted, or broken frontmatter", () => {
  expect(schedulableInput(skillMd("standup", "Generate my\n  daily standup."))).toMatchObject({
    name: "standup",
    description: "Generate my daily standup.",
  });
  expect(schedulableInput('---\nname: x\ndescription: "Quoted: desc"\n---\nbody')).toEqual({
    name: "x",
    description: "Quoted: desc",
    instructions: "body",
  });
  expect(schedulableInput("---\n: : [\n---\nbody")).toMatchObject({ name: "", description: "" });
  expect(schedulableInput("no frontmatter").instructions).toBe("no frontmatter");
});
