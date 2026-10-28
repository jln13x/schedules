import { Effect } from "effect";
import { headers } from "next/headers";
import Link from "next/link";
import Stripe from "stripe";
import { env } from "@/env";
import { type Limit, RateLimit } from "@/lib/rate-limit";
import { Billing } from "@/lib/stripe";
import { pageMetadata } from "@/lib/site";
import { run } from "@/server/runtime";

const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]{10,200}$/;
const LOOKUP_LIMIT: Limit = { scope: "sponsor-success", max: 10, windowMs: 60_000 };

/** The checkout session, null when Stripe has no such session, undefined when we couldn't ask. */
const lookupSession = Effect.fn("lookupSession")(function* (sessionId: string, headers: Headers) {
  const limits = yield* RateLimit;
  const billing = yield* Billing;

  if (!(yield* limits.take(LOOKUP_LIMIT, headers))) {
    return undefined;
  }

  return yield* billing
    .call((stripe) => stripe.checkout.sessions.retrieve(sessionId))
    .pipe(
      Effect.catchTag("StripeError", (error) =>
        Effect.succeed(
          error.cause instanceof Stripe.errors.StripeInvalidRequestError &&
            error.cause.code === "resource_missing"
            ? null
            : undefined,
        ),
      ),
    );
});

export const metadata = {
  ...pageMetadata({
    title: "Sponsorship checkout",
    path: "/sponsor/success",
    description: "Your sponsorship checkout status.",
  }),
  robots: { index: false, follow: false },
};

export default async function SponsorSuccess({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string | string[] }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const session =
    typeof sessionId === "string" && SESSION_ID.test(sessionId)
      ? await run(
          lookupSession(sessionId, await headers()).pipe(
            Effect.catchTag("RateLimitUnavailable", () => Effect.succeed(undefined)),
          ),
        )
      : null;

  if (session === undefined) {
    return (
      <div className="mx-auto grid max-w-xl gap-5 pt-16 text-center sm:pt-28">
        <h1 className="text-3xl font-semibold tracking-tight">Payment status unavailable</h1>
        <p className="text-muted-foreground">
          We could not check your payment right now. Refresh this page in a moment. If you already
          paid, avoid starting another checkout.
        </p>
        <Link href="/" className="text-sm underline">
          Back to schedules
        </Link>
      </div>
    );
  }

  if (
    !session ||
    session.status === "expired" ||
    session.mode !== "subscription" ||
    !session.metadata?.sponsorship_id
  ) {
    return (
      <div className="mx-auto grid max-w-xl gap-5 pt-16 text-center sm:pt-28">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout unavailable</h1>
        <p className="text-muted-foreground">
          This checkout link is invalid or has expired. Return to the sponsor page to check
          availability.
        </p>
        <Link href="/sponsor" className="text-sm underline">
          Back to sponsorship
        </Link>
      </div>
    );
  }

  const paid =
    session.status === "complete" &&
    (session.payment_status === "paid" || session.payment_status === "no_payment_required");

  return (
    <div className="mx-auto grid max-w-xl gap-5 pt-16 text-center sm:pt-28">
      <h1 className="text-3xl font-semibold tracking-tight">
        {paid ? "Thanks for supporting schedules.sh" : "Checking your payment"}
      </h1>
      <p className="text-muted-foreground">
        {paid
          ? "Your payment is confirmed. Your sponsor row will appear once Stripe finishes sending the confirmation."
          : "We haven't confirmed a payment yet. If you completed checkout, confirmation may take a moment. Refresh this page in a moment, or finish your open Stripe checkout."}
      </p>
      <a href={env.STRIPE_CUSTOMER_PORTAL_URL} className="text-sm underline">
        Manage your subscription
      </a>
      <Link href="/" className="text-sm underline">
        Back to schedules
      </Link>
    </div>
  );
}
