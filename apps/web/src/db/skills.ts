import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { ABUSE_THRESHOLD } from "@/lib/schedulable";
import type { ListedSkill } from "@/lib/skills-sh";
import { Database } from "./database";
import { skills } from "./schema";

/** How long a fetched skill is trusted before the import looks at skills.sh again. */
const REFETCH_AFTER = "7 days";
const UPSERT_CHUNK = 500;

/** Only GitHub skills have the owner/repo/skill shape the directory's pages are built on. */
function identity(skill: ListedSkill) {
  const [owner, repo, ...rest] = skill.source.split("/");

  if (skill.sourceType !== "github" || !owner || !repo || rest.length > 0) {
    return undefined;
  }

  return { id: skill.id, owner, repo, slug: skill.slug };
}

export const upsertListedSkills = Effect.fn("upsertListedSkills")(function* (
  listed: ReadonlyArray<ListedSkill>,
) {
  const rows = listed.flatMap((skill) => {
    const key = identity(skill);
    return key
      ? [
          {
            ...key,
            name: skill.name,
            installs: skill.installs,
            duplicate: skill.isDuplicate ?? false,
          },
        ]
      : [];
  });

  for (let start = 0; start < rows.length; start += UPSERT_CHUNK) {
    const chunk = rows.slice(start, start + UPSERT_CHUNK);
    yield* Database.query((db) =>
      db
        .insert(skills)
        .values(chunk)
        .onConflictDoUpdate({
          target: skills.id,
          set: {
            name: sql`excluded.name`,
            installs: sql`excluded.installs`,
            duplicate: sql`excluded.duplicate`,
          },
        }),
    );
  }

  return rows.length;
});

/** Skills never fetched, or not fetched for a week, most installed first. */
export const skillsDue = Effect.fn("skillsDue")(function* (limit: number) {
  return yield* Database.query((db) =>
    db
      .select({ id: skills.id, classifiedHash: skills.classifiedHash })
      .from(skills)
      .where(
        and(
          eq(skills.duplicate, false),
          or(
            isNull(skills.fetchedAt),
            lt(skills.fetchedAt, sql`now() - ${REFETCH_AFTER}::interval`),
          ),
        ),
      )
      .orderBy(desc(skills.installs), skills.id)
      .limit(limit),
  );
});

export const markFetched = Effect.fn("markFetched")(function* (
  id: string,
  fetched: { hash: string; description: string } | undefined,
) {
  yield* Database.query((db) =>
    db
      .update(skills)
      .set({ fetchedAt: sql`now()`, ...(fetched ?? { hash: null }) })
      .where(eq(skills.id, id)),
  );
});

export const saveClassification = Effect.fn("saveClassification")(function* (
  id: string,
  classification: {
    hash: string;
    model: string;
    recurring: number;
    usefulness: number;
    forTeam: number;
    abuse: number;
    cadence: string;
    audit: string | null;
  },
) {
  const { hash, ...rest } = classification;
  yield* Database.query((db) =>
    db
      .update(skills)
      .set({ ...rest, classifiedHash: hash })
      .where(eq(skills.id, id)),
  );
});

export interface SkillRanking {
  readonly minRecurring: number;
  readonly limit?: number;
}

/**
 * Listed skills, best first: usefulness weighted by the log of installs, so neither a huge generic
 * skill nor an unknown one the model happens to like can top the list alone.
 */
export const rankedSkills = Effect.fn("rankedSkills")(function* ({
  minRecurring,
  limit = 100,
}: SkillRanking) {
  const score = sql<number>`${skills.usefulness} * log(${skills.installs} + 10)`.mapWith(Number);
  return yield* Database.query((db) =>
    db
      .select({
        id: skills.id,
        owner: skills.owner,
        repo: skills.repo,
        slug: skills.slug,
        name: skills.name,
        description: skills.description,
        installs: skills.installs,
        recurring: skills.recurring,
        usefulness: skills.usefulness,
        forTeam: skills.forTeam,
        cadence: skills.cadence,
        audit: skills.audit,
        score,
      })
      .from(skills)
      .where(
        and(
          eq(skills.duplicate, false),
          sql`${skills.recurring} >= ${minRecurring}`,
          sql`${skills.abuse} < ${ABUSE_THRESHOLD}`,
          isNull(skills.hidden),
          or(isNull(skills.audit), ne(skills.audit, "fail")),
        ),
      )
      .orderBy(desc(score), skills.id)
      .limit(limit),
  );
});
