"use server";

import { Effect } from "effect";
import { headers } from "next/headers";
import { z } from "zod";
import { Discord, feedbackEmbed } from "@/lib/discord";
import { formRateLimitError, type Limit } from "@/lib/rate-limit";
import { run } from "@/server/runtime";
import { FEEDBACK_INPUT } from "./feedback-input";

export type FeedbackState =
  | { status: "idle" | "sent" }
  | { status: "error"; message?: string; fields?: { reason?: string[]; details?: string[] } };

const FEEDBACK_LIMIT: Limit = { scope: "feedback", max: 3, windowMs: 600_000 };

export async function sendFeedback(_: FeedbackState, form: FormData): Promise<FeedbackState> {
  const limitError = await run(
    formRateLimitError(
      FEEDBACK_LIMIT,
      await headers(),
      "Too many messages. Try again in a few minutes.",
    ),
  );

  if (limitError) {
    return { status: "error", message: limitError };
  }

  const input = FEEDBACK_INPUT.safeParse(Object.fromEntries(form));

  if (!input.success) {
    return {
      status: "error",
      fields: z.flattenError(input.error).fieldErrors,
      ...(input.error.issues.some((issue) => !["reason", "details"].includes(String(issue.path[0])))
        ? { message: "This page could not accept the message. Refresh and try again." }
        : {}),
    };
  }

  return run(
    Discord.use((discord) => discord.send(feedbackEmbed(input.data))).pipe(
      Effect.as({ status: "sent" } satisfies FeedbackState),
      Effect.catchTag("DiscordError", (error) =>
        Effect.logError("Feedback delivery failed", error).pipe(
          Effect.as({
            status: "error",
            message: "Your message could not be sent. Try again.",
          } satisfies FeedbackState),
        ),
      ),
    ),
  );
}
