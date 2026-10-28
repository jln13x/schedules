import { expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import Stripe from "stripe";
import { Database } from "@/db/database";
import { sponsorDrafts, sponsorships } from "@/db/schema";
import { Billing } from "@/lib/stripe";
import { TestServices, testRuntime } from "@/server/testing";
import { createSponsorCheckout } from "./checkout";
import { SPONSOR_INPUT } from "./sponsor-input";

const INPUT = { name: "Test sponsor", description: "A developer tool", url: "https://example.com" };
const DATABASE_TEST = it.skipIf(Boolean(process.env.DATABASE_URL));
const runtime = testRuntime(TestServices);

function testStripe(respond: (url: string, body: URLSearchParams) => unknown) {
  return new Stripe("sk_test_local_fixture", {
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(async (url, init) =>
      Response.json(respond(String(url), new URLSearchParams(String(init?.body ?? "")))),
    ),
  });
}

const run = <A, E>(effect: Effect.Effect<A, E, Database | Billing>, stripe: Stripe) =>
  runtime.runPromise(
    effect.pipe(Effect.provideService(Billing, Billing.make(stripe, "price_fixture", "whsec"))),
  );
const query = <A>(select: Parameters<typeof Database.query<A>>[0]) =>
  runtime.runPromise(Database.query(select));

DATABASE_TEST(
  "checkout saves a hidden draft and passes its ID to the session and subscription",
  async () => {
    let draftId = "";
    const stripe = testStripe((url, body) => {
      expect(url).toEndWith("/v1/checkout/sessions");
      draftId = body.get("metadata[sponsorship_id]") ?? "";
      expect(body.get("subscription_data[metadata][sponsorship_id]")).toBe(draftId);
      expect(body.get("mode")).toBe("subscription");
      expect(body.get("line_items[0][price]")).toBe("price_fixture");
      expect(body.get("line_items[0][quantity]")).toBe("1");
      expect(body.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");
      const expiresAt = Number(body.get("expires_at"));
      expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 30 * 60);
      return { id: "cs_fixture", expires_at: expiresAt, url: "https://checkout.stripe.com/test" };
    });
    try {
      expect(await run(createSponsorCheckout(INPUT), stripe)).toBe(
        "https://checkout.stripe.com/test",
      );
      const [draft] = await query((db) =>
        db.select().from(sponsorDrafts).where(eq(sponsorDrafts.id, draftId)),
      );
      expect(draft).toMatchObject(INPUT);
      expect(
        await query((db) =>
          db.select().from(sponsorships).where(eq(sponsorships.name, INPUT.name)),
        ),
      ).toHaveLength(0);
    } finally {
      if (draftId) {
        await query((db) => db.delete(sponsorDrafts).where(eq(sponsorDrafts.id, draftId)));
      }
    }
  },
  60_000,
);

DATABASE_TEST("rejects checkout before saving a draft when a paid sponsor is live", async () => {
  const stripe = testStripe(() => {
    throw new Error("Stripe must not be called");
  });
  const drafts = await query((db) => db.select({ id: sponsorDrafts.id }).from(sponsorDrafts));

  for (const endsAt of [null, new Date(Date.now() + 86400_000)]) {
    const [sponsor] = await query((db) =>
      db
        .insert(sponsorships)
        .values({ ...INPUT, startsAt: new Date(Date.now() - 1000), endsAt })
        .returning(),
    );

    if (!sponsor) {
      throw new Error("Could not create live sponsor fixture");
    }

    try {
      expect(await run(Effect.flip(createSponsorCheckout(INPUT)), stripe)).toMatchObject({
        _tag: "SponsorSlotUnavailable",
        message: "The sponsor slot was just taken. Please get in touch.",
      });
      expect(await query((db) => db.select({ id: sponsorDrafts.id }).from(sponsorDrafts))).toEqual(
        drafts,
      );
    } finally {
      await query((db) => db.delete(sponsorships).where(eq(sponsorships.id, sponsor.id)));
    }
  }
});

it("rejects invalid text and unsafe URLs", () => {
  for (const input of [
    { ...INPUT, name: " " },
    { ...INPUT, description: "x".repeat(101) },
    { ...INPUT, url: "javascript:alert(1)" },
    { ...INPUT, url: "ftp://example.com" },
  ]) {
    expect(SPONSOR_INPUT.safeParse(input).success).toBe(false);
  }
});
