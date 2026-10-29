import { expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { TestServices, testRuntime } from "@/server/testing";
import { Database } from "./database";
import { getSponsors, SPONSOR_SLOTS } from "./index";
import { sponsorships } from "./schema";

const run = testRuntime(TestServices).runPromise;

it.skipIf(Boolean(process.env.DATABASE_URL))(
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
  60_000,
);
