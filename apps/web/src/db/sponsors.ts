import { eq, sql } from "drizzle-orm";
import { Effect, Schema } from "effect";
import { Database } from "./database";
import { sponsorDrafts, sponsorships } from "./schema";

class SponsorDraftNotFound extends Schema.TaggedError<SponsorDraftNotFound>()(
  "SponsorDraftNotFound",
  { draftId: Schema.String },
) {}

export const createSponsorDraft = Effect.fn("createSponsorDraft")(function* (
  input: Pick<typeof sponsorDrafts.$inferInsert, "name" | "description" | "url">,
) {
  return yield* Database.query(async (db) => {
    const [draft] = await db.insert(sponsorDrafts).values(input).returning();

    if (!draft) {
      throw new Error("Could not save sponsor details");
    }

    return draft;
  });
});

/**
 * Publishes the draft as the subscription's sponsorship, or moves its end. Every caller passes
 * what Stripe currently says, so the latest write is the latest truth.
 */
export const syncSponsorship = Effect.fn("syncSponsorship")(function* (
  draftId: string,
  subscriptionId: string,
  startsAt: Date,
  endsAt: Date,
) {
  const draft = yield* Database.query(async (db) => {
    const [row] = await db.select().from(sponsorDrafts).where(eq(sponsorDrafts.id, draftId));
    return row;
  });

  if (!draft) {
    return yield* new SponsorDraftNotFound({ draftId });
  }

  yield* Database.query((db) =>
    db
      .insert(sponsorships)
      .values({
        name: draft.name,
        description: draft.description,
        url: draft.url,
        stripeSubscriptionId: subscriptionId,
        startsAt,
        endsAt,
      })
      .onConflictDoUpdate({
        target: sponsorships.stripeSubscriptionId,
        set: { endsAt },
      }),
  );
});

/** Ends a published sponsorship; one that was never published has nothing to end. */
export const endSponsorship = Effect.fn("endSponsorship")(function* (
  subscriptionId: string,
  endedAt: Date,
) {
  yield* Database.query((db) =>
    db
      .update(sponsorships)
      .set({ endsAt: sql`least(coalesce(${sponsorships.endsAt}, ${endedAt}), ${endedAt})` })
      .where(eq(sponsorships.stripeSubscriptionId, subscriptionId)),
  );
});
