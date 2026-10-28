"use server";

import { Effect } from "effect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { checkoutEmbed, Discord } from "@/lib/discord";
import { formRateLimitError, type Limit } from "@/lib/rate-limit";
import { run } from "@/server/runtime";
import { createSponsorCheckout } from "./checkout";
import { SPONSOR_INPUT } from "./sponsor-input";

const CHECKOUT_LIMIT: Limit = { scope: "sponsor-checkout", max: 5, windowMs: 60_000 };

export interface SponsorState {
  error?: string;
  fields?: { name?: string[]; description?: string[]; url?: string[] };
}

export async function sponsorCheckout(_: SponsorState, form: FormData): Promise<SponsorState> {
  const limitError = await run(
    formRateLimitError(
      CHECKOUT_LIMIT,
      await headers(),
      "Too many attempts. Try again in a minute.",
    ),
  );

  if (limitError) {
    return { error: limitError };
  }

  const input = SPONSOR_INPUT.safeParse(Object.fromEntries(form));

  if (!input.success) {
    return { fields: z.flattenError(input.error).fieldErrors };
  }

  const outcome = await run(
    Effect.gen(function* () {
      const url = yield* createSponsorCheckout(input.data);
      const discord = yield* Discord;
      after(() => run(discord.notify(checkoutEmbed(input.data))));
      return { url };
    }).pipe(
      Effect.catchTag("SponsorSlotUnavailable", (error) =>
        Effect.succeed({ error: error.message }),
      ),
      Effect.catchTag(["DatabaseError", "StripeError"], (error) =>
        Effect.logError("Sponsor checkout failed", error).pipe(
          Effect.as({ error: "Could not open checkout. Please try again." }),
        ),
      ),
    ),
  );

  if ("error" in outcome) {
    return outcome;
  }

  redirect(outcome.url);
}
