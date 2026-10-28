import { Effect } from "effect";
import { revalidateTag } from "next/cache";
import { getRepositories } from "@/db";
import { env } from "@/env";
import { GitHubError } from "@/lib/github";
import { refreshRepository } from "@/lib/listing";
import { SCHEDULES_TAG } from "@/server/cached";
import { run } from "@/server/runtime";

export const maxDuration = 300;
const CONCURRENCY = 4;

const syncAll = Effect.gen(function* () {
  const repositories = yield* getRepositories();
  const failed = yield* Effect.forEach(
    repositories,
    ({ owner, repo }) =>
      refreshRepository(owner, repo).pipe(
        Effect.as(undefined),
        // A 404 already removed the repository; anything else leaves it listed for the next run.
        Effect.catchIf(
          (error) => error instanceof GitHubError && error.status === 404,
          () => Effect.succeed(undefined),
        ),
        Effect.catch((error) =>
          Effect.logError(`Sync failed for ${owner}/${repo}`, error).pipe(
            Effect.as(`${owner}/${repo}`),
          ),
        ),
      ),
    { concurrency: CONCURRENCY },
  );
  return { repositories: repositories.length, failed: failed.filter(Boolean) };
});

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await run(syncAll);
  revalidateTag(SCHEDULES_TAG, "max");
  return Response.json(outcome);
}
