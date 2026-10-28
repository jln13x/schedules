import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  min,
  not,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Effect } from "effect";
import type { z } from "zod";
import type { LeaderboardEntry } from "@/components/leaderboard";
import type { SponsorEntry } from "@/components/sponsor-row";
import { type Db, Database } from "./database";
import { descriptionOf, SCHEDULE_INPUT_SCHEMA } from "./format";
import { installs, repositoryNames, schedules, sponsorships } from "./schema";

export * from "./schema";

export const HISTORY_DAYS = 30;

async function installHistory(db: Db, scheduleIds: number[]) {
  const history = new Map(
    scheduleIds.map((id) => [id, Array.from({ length: HISTORY_DAYS }, () => 0)]),
  );

  if (scheduleIds.length === 0) {
    return history;
  }

  const age =
    sql<number>`(now() at time zone 'UTC')::date - (${installs.createdAt} at time zone 'UTC')::date`.mapWith(
      Number,
    );
  const rows = await db
    .select({ scheduleId: installs.scheduleId, age, count: sql<number>`count(*)`.mapWith(Number) })
    .from(installs)
    .where(
      and(
        inArray(installs.scheduleId, scheduleIds),
        sql`${installs.createdAt} >= (((now() at time zone 'UTC')::date - (${HISTORY_DAYS} - 1))::timestamp at time zone 'UTC')`,
        lte(installs.createdAt, sql`now()`),
      ),
    )
    .groupBy(installs.scheduleId, age);
  for (const row of rows) {
    const days = history.get(row.scheduleId);

    if (days && row.age >= 0 && row.age < HISTORY_DAYS) {
      days[HISTORY_DAYS - 1 - row.age] = row.count;
    }
  }

  return history;
}

type Period = "all" | "trending";

interface Ranking {
  period?: Period;
  limit?: number;
}

const rankedSchedules = (filter?: SQL, ranking: Ranking = {}) =>
  Database.query(async (db) => {
    const rows = await rankedRows(db, filter, ranking);
    const history = await installHistory(
      db,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      Object.assign(row, {
        description: descriptionOf(row.prompt),
        history: history.get(row.id) ?? [],
      }),
    );
  });

function rankedRows(db: Db, filter: SQL | undefined, { period = "all", limit }: Ranking) {
  const totals = db
    .select({
      scheduleId: installs.scheduleId,
      installs: sql<number>`count(*)`.mapWith(Number).as("install_count"),
      trendingInstalls:
        sql<number>`count(*) filter (where ${installs.createdAt} >= now() - interval '7 days')`
          .mapWith(Number)
          .as("trending_count"),
    })
    .from(installs)
    .groupBy(installs.scheduleId)
    .as("totals");
  return db
    .select({
      ...getTableColumns(schedules),
      installs: sql<number>`coalesce(${totals.installs}, 0)`.mapWith(Number),
      trendingInstalls: sql<number>`coalesce(${totals.trendingInstalls}, 0)`.mapWith(Number),
    })
    .from(schedules)
    .leftJoin(totals, eq(schedules.id, totals.scheduleId))
    .where(filter)
    .orderBy(
      ...(period === "trending" ? [desc(sql`coalesce(${totals.trendingInstalls}, 0)`)] : []),
      desc(sql`coalesce(${totals.installs}, 0)`),
      schedules.owner,
      schedules.repo,
      schedules.name,
    )
    .limit(limit ?? Number.MAX_SAFE_INTEGER);
}

export type RankedSchedule = Effect.Success<ReturnType<typeof rankedSchedules>>[number];

/** What the leaderboard shows, so the prompt and the rest stay on the server. */
export const leaderboardEntry = ({
  id,
  owner,
  repo,
  name,
  displayName,
  installs,
  trendingInstalls,
  history,
}: RankedSchedule): LeaderboardEntry => ({
  id,
  owner,
  repo,
  name,
  displayName,
  installs,
  trendingInstalls,
  history,
});

export const sponsorEntry = ({
  id,
  name,
  description,
  url,
}: typeof sponsorships.$inferSelect): SponsorEntry => ({ id, name, description, url });

export const getLeaderboard = Effect.fn("getLeaderboard")(function* ({
  query,
  ...ranking
}: Ranking & { query?: string } = {}) {
  const search = query?.trim();
  return yield* rankedSchedules(
    search
      ? or(
          ...[
            schedules.owner,
            schedules.repo,
            schedules.name,
            schedules.displayName,
            schedules.prompt,
          ].map((column) => ilike(column, `%${search.replace(/[\\%_]/g, "\\$&")}%`)),
        )
      : undefined,
    ranking,
  );
});

export const getSchedule = Effect.fn("getSchedule")(function* (
  owner: string,
  repo: string,
  name: string,
) {
  const [schedule] = yield* rankedSchedules(
    and(eq(schedules.owner, owner), eq(schedules.repo, repo), eq(schedules.name, name)),
  );
  return schedule;
});

export const getRepository = Effect.fn("getRepository")(function* (owner: string, repo: string) {
  return yield* rankedSchedules(and(eq(schedules.owner, owner), eq(schedules.repo, repo)));
});

type ScheduleInput = z.input<typeof SCHEDULE_INPUT_SCHEMA>;
export type ScheduleFields = Omit<ScheduleInput, "owner" | "repo">;

export interface RepositoryName {
  owner: string;
  repo: string;
}

export interface Repository extends RepositoryName {
  /** GitHub's id, which a rename keeps. */
  id: number;
  /** The name GitHub was asked under, when it was an old one. */
  renamedFrom?: RepositoryName;
}

const sameRepository = ({ owner, repo }: RepositoryName) =>
  sql`(${schedules.owner} = ${owner} and ${schedules.repo} = ${repo})`;

function upsertSchedules(tx: Db, repository: Repository, inputs: ScheduleFields[]) {
  return tx
    .insert(schedules)
    .values(
      inputs.map((input) => ({
        ...SCHEDULE_INPUT_SCHEMA.parse({
          ...input,
          owner: repository.owner,
          repo: repository.repo,
        }),
        githubId: repository.id,
      })),
    )
    .onConflictDoUpdate({
      target: [schedules.owner, schedules.repo, schedules.name],
      set: {
        githubId: repository.id,
        displayName: sql`excluded.display_name`,
        cron: sql`excluded.cron`,
        prompt: sql`excluded.prompt`,
        fetchedAt: sql`now()`,
      },
    })
    .returning();
}

/**
 * Records the names this repository is known under, and moves rows left under a previous name to
 * the current one, folding their installs into a row that already carries it.
 */
async function adoptRepository(tx: Db, repository: Repository) {
  const names = [repository, ...(repository.renamedFrom ? [repository.renamedFrom] : [])];
  await tx
    .insert(repositoryNames)
    .values(names.map(({ owner, repo }) => ({ owner, repo, githubId: repository.id })))
    .onConflictDoUpdate({
      target: [repositoryNames.owner, repositoryNames.repo],
      set: { githubId: repository.id },
    });
  const moved = await tx
    .select({ id: schedules.id, name: schedules.name, firstSeenAt: schedules.firstSeenAt })
    .from(schedules)
    .where(and(eq(schedules.githubId, repository.id), not(sameRepository(repository))));
  for (const row of moved) {
    const [target] = await tx
      .select({ id: schedules.id })
      .from(schedules)
      .where(and(sameRepository(repository), eq(schedules.name, row.name)));

    if (!target) {
      await tx
        .update(schedules)
        .set({ owner: repository.owner, repo: repository.repo })
        .where(eq(schedules.id, row.id));
      continue;
    }

    await tx.update(installs).set({ scheduleId: target.id }).where(eq(installs.scheduleId, row.id));
    await tx
      .update(schedules)
      .set({ firstSeenAt: sql`least(${schedules.firstSeenAt}, ${row.firstSeenAt})` })
      .where(eq(schedules.id, target.id));
    await tx.delete(schedules).where(eq(schedules.id, row.id));
  }
}

/** The repository a name was last seen to belong to, under its current name. */
async function findRepository(db: Db, name: RepositoryName): Promise<Repository | undefined> {
  const [known] = await db
    .select({ id: repositoryNames.githubId })
    .from(repositoryNames)
    .where(and(eq(repositoryNames.owner, name.owner), eq(repositoryNames.repo, name.repo)));

  if (!known) {
    return undefined;
  }

  const [current] = await db
    .select({ owner: schedules.owner, repo: schedules.repo })
    .from(schedules)
    .where(eq(schedules.githubId, known.id))
    .limit(1);
  return { ...(current ?? name), id: known.id };
}

export const resolveRepository = Effect.fn("resolveRepository")(function* (name: RepositoryName) {
  return yield* Database.query((db) => findRepository(db, name));
});

/** Lists the repository's current files and removes the rows for files it no longer has. */
export const syncRepository = Effect.fn("syncRepository")(function* (
  repository: Repository,
  inputs: ScheduleFields[],
) {
  return yield* Database.transaction(async (tx) => {
    await adoptRepository(tx, repository);

    if (inputs.length > 0) {
      await upsertSchedules(tx, repository, inputs);
    }

    return removeExcept(
      tx,
      repository,
      inputs.map((input) => input.name),
    );
  });
});

export const removeRepository = Effect.fn("removeRepository")(function* (name: RepositoryName) {
  return yield* Database.query((db) => removeExcept(db, name, []));
});

// Installs go with their schedule, so a file that comes back starts over.
async function removeExcept(db: Db, repository: RepositoryName, names: string[]) {
  const removed = await db
    .delete(schedules)
    .where(
      and(
        sameRepository(repository),
        names.length > 0 ? notInArray(schedules.name, names) : undefined,
      ),
    )
    .returning({ name: schedules.name });
  return removed.map((row) => row.name);
}

/** Every listed repository, the least recently refreshed first. */
export const getRepositories = Effect.fn("getRepositories")(function* () {
  return yield* Database.query((db) =>
    db
      .select({ owner: schedules.owner, repo: schedules.repo })
      .from(schedules)
      .groupBy(schedules.owner, schedules.repo)
      .orderBy(min(schedules.fetchedAt)),
  );
});

export const recordInstall = Effect.fn("recordInstall")(function* (
  repository: Repository,
  input: ScheduleFields,
) {
  return yield* Database.transaction(async (tx) => {
    await adoptRepository(tx, repository);
    const [schedule] = await upsertSchedules(tx, repository, [input]);

    if (!schedule) {
      throw new Error("Failed to record schedule");
    }

    await tx.insert(installs).values({ scheduleId: schedule.id });
    return schedule;
  });
});

export const SPONSOR_SLOTS = 1;

export const getSponsors = Effect.fn("getSponsors")(function* () {
  return yield* Database.query((db) =>
    db
      .select()
      .from(sponsorships)
      .where(
        and(
          lte(sponsorships.startsAt, sql`now()`),
          or(isNull(sponsorships.endsAt), gt(sponsorships.endsAt, sql`now()`)),
        ),
      )
      .orderBy(sponsorships.startsAt, sponsorships.id)
      .limit(SPONSOR_SLOTS),
  );
});
