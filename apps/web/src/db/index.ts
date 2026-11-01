import { and, gt, isNull, lte, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { SponsorEntry } from "@/components/sponsor-row";
import { Database } from "./database";
import { sponsorships } from "./schema";

export * from "./schema";

export const sponsorEntry = ({
  id,
  name,
  description,
  url,
}: typeof sponsorships.$inferSelect): SponsorEntry => ({ id, name, description, url });

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
