"use server";

import { Effect } from "effect";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { Discord, submissionEmbed } from "@/lib/discord";
import { REPOSITORY_SEGMENT } from "@/lib/github";
import { REFRESH_LIMIT, refreshRepository } from "@/lib/listing";
import { formRateLimitError } from "@/lib/rate-limit";
import { RESERVED_OWNERS } from "@/lib/site";
import { SCHEDULES_TAG } from "@/server/cached";
import { run } from "@/server/runtime";

export type SubmitState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "listed";
      owner: string;
      repo: string;
      listed: Array<{ name: string; displayName: string }>;
      skipped: Array<{ file: string; reason: string }>;
      removed: string[];
    };

const REPOSITORY_INPUT = z
  .string()
  .trim()
  .transform((value) =>
    value.replace(/^(https?:\/\/)?(www\.)?github\.com\//, "").replace(/\.git$/, ""),
  )
  .transform((value) => value.split("/").slice(0, 2))
  .pipe(
    z.tuple([
      REPOSITORY_SEGMENT.transform((value) => value.toLowerCase()),
      REPOSITORY_SEGMENT.transform((value) => value.toLowerCase()),
    ]),
  );

export async function submitRepository(_: SubmitState, form: FormData): Promise<SubmitState> {
  const limitError = await run(
    formRateLimitError(
      REFRESH_LIMIT,
      await headers(),
      "Too many submissions. Try again in a minute.",
    ),
  );

  if (limitError) {
    return { status: "error", message: limitError };
  }

  const input = REPOSITORY_INPUT.safeParse(form.get("repository") ?? "");

  if (!input.success) {
    return { status: "error", message: "Enter a repository as owner/repo or a GitHub URL." };
  }

  const [owner, repo] = input.data;

  if (RESERVED_OWNERS.includes(owner)) {
    return {
      status: "error",
      message: "This GitHub owner name is reserved by schedules.sh routes.",
    };
  }

  return run(
    Effect.gen(function* () {
      const { repository, ...result } = yield* refreshRepository(owner, repo);
      const discord = yield* Discord;
      updateTag(SCHEDULES_TAG);
      after(() => run(discord.notify(submissionEmbed({ ...repository, ...result }))));
      return { status: "listed", ...repository, ...result } satisfies SubmitState;
    }).pipe(
      Effect.catchTag("GitHubError", (error) =>
        Effect.succeed({ status: "error", message: error.message } satisfies SubmitState),
      ),
      Effect.catchTag("DatabaseError", (error) =>
        Effect.logError("Repository submission failed", error).pipe(
          Effect.as({
            status: "error",
            message: "The submission could not be saved. Try again.",
          } satisfies SubmitState),
        ),
      ),
    ),
  );
}
