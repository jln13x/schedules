import { Context, Effect, Layer, Schema } from "effect";
import Stripe from "stripe";
import { env } from "@/env";

export class StripeError extends Schema.TaggedError<StripeError>()("StripeError", {
  cause: Schema.Defect(),
}) {}

export class Billing extends Context.Service<
  Billing,
  {
    readonly stripe: Stripe;
    readonly priceId: string;
    readonly webhookSecret: string;
    readonly call: <A>(run: (stripe: Stripe) => Promise<A>) => Effect.Effect<A, StripeError>;
  }
>()("schedules/lib/Billing") {
  static readonly make = (stripe: Stripe, priceId: string, webhookSecret: string) =>
    Billing.of({
      stripe,
      priceId,
      webhookSecret,
      call: (run) =>
        Effect.tryPromise({ try: () => run(stripe), catch: (cause) => new StripeError({ cause }) }),
    });

  static readonly layer = Layer.sync(Billing, () =>
    Billing.make(
      new Stripe(env.STRIPE_SECRET_KEY),
      env.STRIPE_SPONSOR_PRICE_ID,
      env.STRIPE_WEBHOOK_SECRET,
    ),
  );
}
