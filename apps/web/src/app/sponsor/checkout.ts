import { Effect, Schema } from "effect";
import { getSponsors } from "@/db";
import { createSponsorDraft } from "@/db/sponsors";
import { SITE } from "@/lib/site";
import { Billing, StripeError } from "@/lib/stripe";
import type { SponsorInput } from "./sponsor-input";

class SponsorSlotUnavailable extends Schema.TaggedError<SponsorSlotUnavailable>()(
  "SponsorSlotUnavailable",
  {},
) {
  override get message() {
    return "The sponsor slot was just taken. Please get in touch.";
  }
}

export const createSponsorCheckout = Effect.fn("createSponsorCheckout")(function* (
  details: SponsorInput,
) {
  const billing = yield* Billing;

  if ((yield* getSponsors()).length > 0) {
    return yield* new SponsorSlotUnavailable();
  }

  const draft = yield* createSponsorDraft(details);
  const metadata = { sponsorship_id: draft.id };
  const session = yield* billing.call((stripe) =>
    stripe.checkout.sessions.create(
      {
        mode: "subscription",
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        line_items: [{ price: billing.priceId, quantity: 1 }],
        metadata,
        subscription_data: { metadata },
        success_url: `${SITE.origin}/sponsor/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE.origin}/sponsor?canceled=1`,
      },
      { idempotencyKey: draft.id },
    ),
  );

  if (!session.url) {
    return yield* new StripeError({ cause: new Error("Stripe did not return a checkout URL") });
  }

  return session.url;
});
