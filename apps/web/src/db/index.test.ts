import { expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { Database } from "./database";
import { installs, repositoryNames, schedules, sponsorships } from "./schema";
import {
  getLeaderboard,
  getRepository,
  getSchedule,
  getSponsors,
  HISTORY_DAYS,
  recordInstall,
  resolveRepository,
  SPONSOR_SLOTS,
  syncRepository,
} from "./index";
import { TestServices, testRuntime } from "@/server/testing";

const runtime = testRuntime(TestServices);
const run = runtime.runPromise;
// PGlite boots, pushes the schema, and seeds the samples first, which exceeds bun's default on CI runners.
const PGLITE_TEST_TIMEOUT_MS = 60_000;
// Never run a persisted-state test against a configured external database.
const DATABASE_TEST = it.skipIf(Boolean(process.env.DATABASE_URL));

const removeOwner = (owner: string) =>
  run(
    Database.query(async (db) => {
      await db.delete(schedules).where(eq(schedules.owner, owner));
      await db.delete(repositoryNames).where(eq(repositoryNames.owner, owner));
    }),
  );

DATABASE_TEST(
  "counts installs per day and syncs listings without losing installs",
  async () => {
    const repository = { id: 1001, owner: "test-owner", repo: "test-repo" };
    const input = {
      name: "test-schedule",
      displayName: "Test Schedule",
      cron: "0 9 * * *",
      prompt: "Review this integration fixture.",
    };
    try {
      const original = await run(recordInstall(repository, input));
      await Promise.all(
        Array.from({ length: 3 }, () =>
          run(recordInstall(repository, { ...input, displayName: "Updated Schedule" })),
        ),
      );
      const updated = await run(getSchedule(repository.owner, repository.repo, input.name));
      expect(updated?.id).toBe(original.id);
      expect(updated?.firstSeenAt).toEqual(original.firstSeenAt);
      expect(updated?.displayName).toBe("Updated Schedule");
      expect(await run(getRepository(repository.owner, repository.repo))).toHaveLength(1);
      const rows = await run(getLeaderboard({ query: "integration fixture" }));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.installs).toBe(4);
      expect(rows[0]?.trendingInstalls).toBe(4);
      expect(rows[0]?.description).toBe(input.prompt);
      expect(await run(getSchedule(repository.owner, repository.repo, "missing"))).toBeUndefined();
      expect(rows[0]?.history).toHaveLength(HISTORY_DAYS);
      expect(rows[0]?.history.at(-1)).toBe(4);
      await run(
        syncRepository(repository, [
          { ...input, displayName: "Resubmitted" },
          { ...input, name: "submitted-only", displayName: "Submitted only" },
        ]),
      );
      const submitted = await run(getRepository(repository.owner, repository.repo));
      expect(submitted.map(({ name, installs: count }) => [name, count])).toEqual([
        ["test-schedule", 4],
        ["submitted-only", 0],
      ]);
      expect(await run(syncRepository(repository, [input]))).toEqual(["submitted-only"]);
      expect(
        await run(getSchedule(repository.owner, repository.repo, "submitted-only")),
      ).toBeUndefined();
      // A file that leaves the repository takes its installs with it.
      expect(await run(syncRepository(repository, []))).toEqual(["test-schedule"]);
      expect(await run(getRepository(repository.owner, repository.repo))).toHaveLength(0);
      await run(syncRepository(repository, [input]));
      expect(
        (await run(getSchedule(repository.owner, repository.repo, input.name)))?.installs,
      ).toBe(0);
    } finally {
      await removeOwner(repository.owner);
    }
  },
  PGLITE_TEST_TIMEOUT_MS,
);

const listing = (repository: { owner: string; repo: string }) =>
  run(getRepository(repository.owner, repository.repo)).then((rows) =>
    rows.map(({ name, installs: count, githubId }) => [name, count, githubId]),
  );

DATABASE_TEST(
  "moves a renamed repository's listings, merging installs with rows already under the new name",
  async () => {
    const owner = "rename-fixture";
    const schedule = { displayName: "Brief", cron: "0 9 * * *", prompt: "Brief me." };
    const old = { id: 7, owner, repo: "old-name" };
    const current = { id: 7, owner, repo: "new-name" };

    try {
      await run(syncRepository(old, [{ name: "brief", ...schedule }]));
      await run(recordInstall(old, { name: "brief", ...schedule }));
      await run(recordInstall(old, { name: "brief", ...schedule }));
      await run(recordInstall(old, { name: "other", ...schedule }));
      expect(await listing(old)).toEqual([
        ["brief", 2, 7],
        ["other", 1, 7],
      ]);
      // An install under the new name is the first word of the rename, and moves the listing.
      await run(recordInstall(current, { name: "brief", ...schedule }));
      expect(await listing(old)).toEqual([]);
      expect(await listing(current)).toEqual([
        ["brief", 3, 7],
        ["other", 1, 7],
      ]);

      expect(
        await run(
          syncRepository({ ...current, renamedFrom: old }, [
            { name: "brief", ...schedule },
            { name: "other", ...schedule },
          ]),
        ),
      ).toEqual([]);
      expect(await listing(old)).toEqual([]);
      expect(await listing(current)).toEqual([
        ["brief", 3, 7],
        ["other", 1, 7],
      ]);
      expect(await run(resolveRepository(old))).toEqual(current);
      expect(await run(resolveRepository({ owner, repo: "unknown" }))).toBeUndefined();

      // Installs reported under the old name keep landing on the current listing.
      await run(recordInstall(current, { name: "brief", ...schedule }));
      expect(await listing(old)).toEqual([]);
      expect((await run(getSchedule(current.owner, current.repo, "brief")))?.installs).toBe(4);
    } finally {
      await removeOwner(owner);
    }
  },
  PGLITE_TEST_TIMEOUT_MS,
);

DATABASE_TEST(
  "returns only the earliest live sponsor and hides ended or future ones",
  async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const sponsor = { description: "Fixture", url: "https://example.com" };
    const rows = await run(
      Database.query((db) =>
        db
          .insert(sponsorships)
          .values([
            { ...sponsor, name: "Ended", endsAt: new Date(Date.now() - DAY_MS) },
            { ...sponsor, name: "Future", startsAt: new Date(Date.now() + DAY_MS) },
            { ...sponsor, name: "Second", startsAt: new Date(Date.now() - DAY_MS) },
            { ...sponsor, name: "First", startsAt: new Date(Date.now() - 2 * DAY_MS) },
            { ...sponsor, name: "Third", startsAt: new Date(Date.now() - DAY_MS / 2) },
          ])
          .returning({ id: sponsorships.id }),
      ),
    );

    try {
      const live = await run(getSponsors());
      expect(live).toHaveLength(SPONSOR_SLOTS);
      expect(live.map((row) => row.name)).toEqual(["First"]);
    } finally {
      await run(
        Database.query((db) =>
          db
            .delete(sponsorships)
            .where(
              and(
                eq(sponsorships.description, sponsor.description),
                sql`${sponsorships.id} in ${rows.map(({ id }) => id)}`,
              ),
            ),
        ),
      );
    }
  },
  PGLITE_TEST_TIMEOUT_MS,
);

DATABASE_TEST(
  "buckets installs by UTC calendar date across midnight and the history cutoff",
  async () => {
    const owner = "history-owner";
    const row = await run(
      Database.query(async (db) => {
        const [schedule] = await db
          .insert(schedules)
          .values({
            owner,
            repo: "history-repo",
            githubId: 2,
            name: "utc",
            displayName: "UTC history",
            cron: "0 9 * * *",
            prompt: "History",
          })
          .returning();

        if (!schedule) {
          throw new Error("Missing fixture");
        }

        await db.insert(installs).values([
          {
            scheduleId: schedule.id,
            createdAt: sql`((now() at time zone 'UTC')::date::timestamp at time zone 'UTC') - interval '1 millisecond'`,
          },
          {
            scheduleId: schedule.id,
            createdAt: sql`((now() at time zone 'UTC')::date::timestamp at time zone 'UTC')`,
          },
          {
            scheduleId: schedule.id,
            createdAt: sql`(((now() at time zone 'UTC')::date - 29)::timestamp at time zone 'UTC')`,
          },
          {
            scheduleId: schedule.id,
            createdAt: sql`(((now() at time zone 'UTC')::date - 29)::timestamp at time zone 'UTC') - interval '1 millisecond'`,
          },
          { scheduleId: schedule.id, createdAt: sql`now() + interval '1 day'` },
        ]);
        return schedule;
      }),
    );

    try {
      const schedule = await run(getSchedule(row.owner, row.repo, row.name));
      expect(schedule?.history[0]).toBe(1);
      expect(schedule?.history.at(-2)).toBe(1);
      expect(schedule?.history.at(-1)).toBe(1);
      expect(schedule?.history.reduce((sum, count) => sum + count, 0)).toBe(3);
    } finally {
      await removeOwner(owner);
    }
  },
  PGLITE_TEST_TIMEOUT_MS,
);
