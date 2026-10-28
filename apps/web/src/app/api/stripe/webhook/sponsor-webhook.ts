import { Effect, Option } from "effect";
import type Stripe from "stripe";
import { z } from "zod";
import { endSponsorship, syncSponsorship } from "@/db/sponsors";
import { Billing, StripeError } from "@/lib/stripe";

const ended = (subscription: Stripe.Subscription) =>
  subscription.status === "canceled" || subscription.status === "incomplete_expired";

/** Brings the sponsorship in line with what Stripe says about the subscription right now. */
const syncSubscription = Effect.fn("syncSubscription")(function* (subscriptionId: string) {
  const billing = yield* Billing;
  const subscription = yield* billing.call((stripe) =>
    stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] }),
  );
  const draftId = subscription.metadata.sponsorship_id;

  if (!draftId || !z.uuid().safeParse(draftId).success) {
    return;
  }

  if (ended(subscription)) {
    return yield* endSponsorship(
      subscription.id,
      new Date((subscription.ended_at ?? subscription.created) * 1000),
    );
  }

  const invoice = subscription.latest_invoice;

  if (!invoice || typeof invoice === "string" || invoice.status !== "paid") {
    return;
  }

  const line = invoice.lines.data.find(
    (item) =>
      item.parent?.type === "subscription_item_details" &&
      !item.parent.subscription_item_details?.proration,
  );

  if (!line) {
    return yield* new StripeError({
      cause: new Error("Paid sponsorship invoice has no subscription period"),
    });
  }

  yield* syncSponsorship(
    draftId,
    subscription.id,
    new Date(subscription.start_date * 1000),
    new Date(line.period.end * 1000),
  );
});

const subscriptionIdOf = (subscription: string | { id: string }) =>
  typeof subscription === "string" ? subscription : subscription.id;

const handleSponsorEvent = Effect.fn("handleSponsorEvent")(function* (event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;

      if (session.metadata?.sponsorship_id && session.subscription) {
        yield* syncSubscription(subscriptionIdOf(session.subscription));
      }

      return;
    }
    case "invoice.paid": {
      const subscription = event.data.object.parent?.subscription_details?.subscription;

      if (subscription) {
        yield* syncSubscription(subscriptionIdOf(subscription));
      }

      return;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;

      if (!z.uuid().safeParse(subscription.metadata.sponsorship_id).success) {
        return;
      }

      // The event already says the subscription is over; asking Stripe again can't change that.
      if (event.type === "customer.subscription.deleted" || ended(subscription)) {
        return yield* endSponsorship(
          subscription.id,
          new Date((subscription.ended_at ?? subscription.created) * 1000),
        );
      }

      yield* syncSubscription(subscription.id);
    }
  }
});

export const sponsorWebhook = Effect.fn("sponsorWebhook")(function* (request: Request) {
  const billing = yield* Billing;
  const body = yield* Effect.promise(() => request.text());
  const event = yield* Effect.tryPromise(() =>
    billing.stripe.webhooks.constructEventAsync(
      body,
      request.headers.get("stripe-signature") ?? "",
      billing.webhookSecret,
    ),
  ).pipe(Effect.option);

  if (Option.isNone(event)) {
    return Response.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  return yield* handleSponsorEvent(event.value).pipe(
    Effect.as(Response.json({ received: true })),
    Effect.catch((error) =>
      Effect.logError("Sponsor webhook failed", error).pipe(
        Effect.as(Response.json({ error: "Could not update sponsorship" }, { status: 500 })),
      ),
    ),
  );
});
