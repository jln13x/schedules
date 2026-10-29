import { Context, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { env } from "@/env";
import { type FeedbackInput, REPORT_REASONS } from "@/components/feedback/feedback-input";
import { SITE } from "./site";

export interface Embed {
  title: string;
  url: string;
  description?: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

const REPORT_COLOR = 0xf97316;
const FEEDBACK_COLOR = 0x737373;
const CHECKOUT_COLOR = 0x3b82f6;

export function feedbackEmbed(input: FeedbackInput): Embed {
  const url = `${SITE.origin}${input.page}`;
  const base = { url, fields: [{ name: "Page", value: input.page, inline: true }] };

  if (input.kind === "report") {
    return {
      ...base,
      title: "Schedule report",
      color: REPORT_COLOR,
      fields: [
        ...base.fields,
        { name: "Reason", value: REPORT_REASONS[input.reason], inline: true },
      ],
      ...(input.details ? { description: input.details } : {}),
    };
  }

  return { ...base, title: "Feedback", color: FEEDBACK_COLOR, description: input.details };
}

/**
 * A sponsor checkout was opened, not yet paid. Only the listing the sponsor asked to publish; the
 * buyer's billing details stay with Stripe.
 */
export function checkoutEmbed(listing: { name: string; description: string; url: string }): Embed {
  return {
    title: `Checkout started: ${listing.name}`,
    url: `${SITE.origin}/sponsor`,
    color: CHECKOUT_COLOR,
    description: listing.description,
    fields: [{ name: "Website", value: listing.url }],
  };
}

export class DiscordError extends Schema.TaggedError<DiscordError>()("DiscordError", {
  cause: Schema.Defect(),
}) {}

export class Discord extends Context.Service<
  Discord,
  {
    /** Fails when no webhook is configured or Discord refused the embed. */
    readonly send: (embed: Embed) => Effect.Effect<void, DiscordError>;
    /** Never fails: a notification must not fail the action that triggered it. */
    readonly notify: (embed: Embed) => Effect.Effect<void>;
  }
>()("schedules/lib/Discord") {
  static readonly make = (webhookUrl: string | undefined) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      // Mentions are disabled so submitted text can never ping anyone.
      const send = Effect.fn("Discord.send")(function* (embed: Embed) {
        if (!webhookUrl) {
          return yield* new DiscordError({ cause: new Error("No Discord webhook is configured") });
        }

        yield* HttpClientRequest.post(webhookUrl).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            username: SITE.name,
            embeds: [{ ...embed, timestamp: new Date().toISOString() }],
            allowed_mentions: { parse: [] },
          }),
          client.execute,
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.mapError((cause) => new DiscordError({ cause })),
        );
      });
      const notify = (embed: Embed) =>
        webhookUrl
          ? send(embed).pipe(
              Effect.catch((error) => Effect.logError("Discord notification failed", error)),
            )
          : Effect.void;
      return Discord.of({ send, notify });
    });

  static readonly layer = Layer.effect(Discord, Discord.make(env.DISCORD_WEBHOOK_URL)).pipe(
    Layer.provide(FetchHttpClient.layer),
  );
}
