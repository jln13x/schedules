import { and, desc, eq, ilike, isNull, lt, ne, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { type Fit, isCadence, isTimeOfDay, suggestedSchedule } from "@/lib/cadence";
import { ABUSE_THRESHOLD, FIT_THRESHOLD, SCHEDULABLE_THRESHOLD } from "@/lib/schedulable";
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
    time: string;
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

/** Usefulness weighted by the log of installs, so neither a huge generic skill nor an unknown one the model happens to like can top the list alone. */
const score = sql<number>`${skills.usefulness} * log(${skills.installs} + 10)`.mapWith(Number);

const LISTED = and(
  eq(skills.duplicate, false),
  sql`${skills.recurring} >= ${SCHEDULABLE_THRESHOLD}`,
  sql`${skills.abuse} < ${ABUSE_THRESHOLD}`,
  isNull(skills.hidden),
  or(isNull(skills.audit), ne(skills.audit, "fail")),
);

const fitsYou = sql`${skills.forTeam} <= ${1 - FIT_THRESHOLD}`;
const fitsTeam = sql`${skills.forTeam} >= ${FIT_THRESHOLD}`;

const LISTING_COLUMNS = {
  id: skills.id,
  owner: skills.owner,
  repo: skills.repo,
  slug: skills.slug,
  name: skills.name,
  description: skills.description,
  installs: skills.installs,
  usefulness: skills.usefulness,
  forTeam: skills.forTeam,
  cadence: skills.cadence,
  time: skills.time,
  audit: skills.audit,
  firstSeenAt: skills.firstSeenAt,
};

export interface SkillQuery {
  readonly query?: string;
  readonly fit?: Fit;
  readonly limit?: number;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/** What one row of the directory needs; the fit flags save every reader from knowing the threshold. */
export function listingOf(row: Effect.Success<ReturnType<typeof rankedSkills>>[number]) {
  return {
    ...row,
    schedule: suggestedSchedule(
      isCadence(row.cadence) ? row.cadence : "weekly",
      isTimeOfDay(row.time) ? row.time : "morning",
    ),
    usefulness: row.usefulness ?? 0,
    fits: {
      you: (row.forTeam ?? 0) <= 1 - FIT_THRESHOLD,
      team: (row.forTeam ?? 0) >= FIT_THRESHOLD,
    },
  };
}

/** Listed skills, best first. */
export const rankedSkills = Effect.fn("rankedSkills")(function* ({
  query,
  fit,
  limit = 100,
}: SkillQuery = {}) {
  const search = query?.trim();
  return yield* Database.query((db) =>
    db
      .select({ ...LISTING_COLUMNS, score })
      .from(skills)
      .where(
        and(
          LISTED,
          fit === "you" ? fitsYou : fit === "team" ? fitsTeam : undefined,
          search
            ? or(
                ...[skills.id, skills.name, skills.description].map((column) =>
                  ilike(column, `%${escapeLike(search)}%`),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(score), skills.id)
      .limit(limit),
  );
});

export const getSkill = Effect.fn("getSkill")(function* (
  owner: string,
  repo: string,
  slug: string,
) {
  const [row] = yield* Database.query((db) =>
    db
      .select({ ...LISTING_COLUMNS, score })
      .from(skills)
      .where(and(LISTED, eq(skills.owner, owner), eq(skills.repo, repo), eq(skills.slug, slug)))
      .limit(1),
  );
  return row && listingOf(row);
});

/** Every listed skill's path, for the sitemap. */
export const listedSkillPaths = Effect.fn("listedSkillPaths")(function* () {
  return yield* Database.query((db) =>
    db
      .select({ owner: skills.owner, repo: skills.repo, slug: skills.slug })
      .from(skills)
      .where(LISTED)
      .orderBy(desc(score), skills.id),
  );
});
