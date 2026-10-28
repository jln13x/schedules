import { expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import Stripe from "stripe";
import { Database } from "@/db/database";
import { sponsorDrafts, sponsorships } from "@/db/schema";
import { createSponsorDraft } from "@/db/sponsors";
import { Billing } from "@/lib/stripe";
import { TestServices, testRuntime } from "@/server/testing";
import { createSponsorCheckout } from "@/app/sponsor/checkout";
import { sponsorWebhook } from "./sponsor-webhook";

const INPUT = { name: "Test sponsor", description: "A developer tool", url: "https://example.com" };
const SECRET = "whsec_local_test_fixture";
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

/** Runs with the test database and a Stripe that answers as the test says. */
const withStripe = (stripe: Stripe) =>
  Effect.provideService(Billing, Billing.make(stripe, "price_fixture", SECRET));
const run = <A, E>(effect: Effect.Effect<A, E, Database | Billing>, stripe: Stripe) =>
  runtime.runPromise(effect.pipe(withStripe(stripe)));
const query = <A>(select: Parameters<typeof Database.query<A>>[0]) =>
  runtime.runPromise(Database.query(select));

async function signedRequest(type: string, object: unknown) {
  const body = JSON.stringify({ id: "evt_fixture", object: "event", type, data: { object } });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: {
      "stripe-signature": await Stripe.webhooks.generateTestHeaderStringAsync({
        payload: body,
        secret: SECRET,
      }),
    },
  });
}

it("rejects missing or tampered webhook signatures without contacting Stripe", async () => {
  const stripe = testStripe(() => {
    throw new Error("Stripe must not be called");
  });
  const valid = await signedRequest("invoice.paid", {});
  const deliver = (request: Request) => run(sponsorWebhook(request), stripe);
  expect(
    (await deliver(new Request(valid.url, { method: "POST", body: "{}", headers: valid.headers })))
      .status,
  ).toBe(400);
  expect((await deliver(new Request(valid.url, { method: "POST", body: "{}" }))).status).toBe(400);
});

DATABASE_TEST(
  "signed events activate, renew and cancel once, and never extend unpaid months",
  async () => {
    const draft = await runtime.runPromise(createSponsorDraft(INPUT));
    const now = Math.floor(Date.now() / 1000);
    const month = 30 * 86400;
    const subscriptionId = "sub_lifecycle_fixture";
    let periodEnd = now + month;
    let invoiceStatus = "open";
    let status = "active";
    let endedAt: number | null = null;
    let cancelAtPeriodEnd = false;
    const stripe = testStripe((url) => {
      expect(url).toContain(`/v1/subscriptions/${subscriptionId}`);
      return {
        id: subscriptionId,
        object: "subscription",
        status,
        created: now,
        start_date: now,
        ended_at: endedAt,
        cancel_at_period_end: cancelAtPeriodEnd,
        metadata: { sponsorship_id: draft.id },
        latest_invoice: {
          id: "in_fixture",
          object: "invoice",
          status: invoiceStatus,
          lines: {
            data: [
              {
                parent: {
                  type: "subscription_item_details",
                  subscription_item_details: { proration: false },
                },
                period: { start: now, end: periodEnd },
              },
            ],
          },
        },
      };
    });
    const deliver = async (type: string, object: unknown) =>
      run(sponsorWebhook(await signedRequest(type, object)), stripe);
    const invoice = { parent: { subscription_details: { subscription: subscriptionId } } };
    const subscription = { id: subscriptionId, metadata: { sponsorship_id: draft.id } };
    const rows = () =>
      query((db) =>
        db.select().from(sponsorships).where(eq(sponsorships.stripeSubscriptionId, subscriptionId)),
      );
    try {
      expect(
        (
          await deliver("checkout.session.completed", {
            metadata: { sponsorship_id: draft.id },
            subscription: subscriptionId,
          })
        ).status,
      ).toBe(200);
      expect(await rows()).toHaveLength(0);
      invoiceStatus = "paid";
      const deliveries = await Promise.all([
        deliver("invoice.paid", invoice),
        deliver("invoice.paid", invoice),
      ]);
      expect(deliveries.map((response) => response.status)).toEqual([200, 200]);
      expect(await rows()).toHaveLength(1);
      expect((await rows())[0]).toMatchObject({ ...INPUT, endsAt: new Date(periodEnd * 1000) });
      expect(await run(Effect.flip(createSponsorCheckout(INPUT)), stripe)).toMatchObject({
        _tag: "SponsorSlotUnavailable",
      });
      periodEnd += month;
      invoiceStatus = "open";
      await deliver("customer.subscription.updated", subscription);
      expect((await rows())[0]?.endsAt).toEqual(new Date((periodEnd - month) * 1000));
      invoiceStatus = "paid";
      await deliver("invoice.paid", invoice);
      expect((await rows())[0]?.endsAt).toEqual(new Date(periodEnd * 1000));
      cancelAtPeriodEnd = true;
      await deliver("customer.subscription.updated", subscription);
      expect((await rows())[0]?.endsAt).toEqual(new Date(periodEnd * 1000));
      status = "canceled";
      endedAt = now;
      const cancellation = { ...subscription, ended_at: endedAt, created: now };
      const cancellations = await Promise.all([
        deliver("customer.subscription.deleted", cancellation),
        deliver("customer.subscription.deleted", cancellation),
      ]);
      expect(cancellations.map((response) => response.status)).toEqual([200, 200]);
      expect((await rows())[0]?.endsAt).toEqual(new Date(now * 1000));
      // A late invoice event asks Stripe again, which still says the subscription ended.
      await deliver("invoice.paid", invoice);
      expect((await rows())[0]?.endsAt).toEqual(new Date(now * 1000));
      expect(await rows()).toHaveLength(1);
    } finally {
      await query((db) =>
        db.delete(sponsorships).where(eq(sponsorships.stripeSubscriptionId, subscriptionId)),
      );
      await query((db) => db.delete(sponsorDrafts).where(eq(sponsorDrafts.id, draft.id)));
    }
  },
  60_000,
);

DATABASE_TEST(
  "publishes nothing for a subscription that ended before its first paid invoice arrived",
  async () => {
    const draft = await runtime.runPromise(createSponsorDraft(INPUT));
    const now = Math.floor(Date.now() / 1000);
    const subscriptionId = "sub_canceled_first";
    const subscription = {
      id: subscriptionId,
      status: "canceled",
      created: now,
      start_date: now,
      ended_at: now,
      metadata: { sponsorship_id: draft.id },
      latest_invoice: {
        status: "paid",
        lines: {
          data: [
            {
              parent: {
                type: "subscription_item_details",
                subscription_item_details: { proration: false },
              },
              period: { end: now + 86400 },
            },
          ],
        },
      },
    };
    const stripe = testStripe(() => subscription);
    const deliver = async (type: string, object: unknown) =>
      run(sponsorWebhook(await signedRequest(type, object)), stripe);

    try {
      expect((await deliver("customer.subscription.deleted", subscription)).status).toBe(200);
      expect(
        (
          await deliver("invoice.paid", {
            parent: { subscription_details: { subscription: subscriptionId } },
          })
        ).status,
      ).toBe(200);
      expect(
        await query((db) =>
          db
            .select()
            .from(sponsorships)
            .where(eq(sponsorships.stripeSubscriptionId, subscriptionId)),
        ),
      ).toHaveLength(0);
    } finally {
      await query((db) => db.delete(sponsorDrafts).where(eq(sponsorDrafts.id, draft.id)));
    }
  },
  60_000,
);
