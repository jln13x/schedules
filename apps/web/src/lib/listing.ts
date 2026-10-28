import { Effect } from "effect";
import { removeRepository, syncRepository } from "@/db";
import { GitHub } from "@/lib/github";
import type { Limit } from "@/lib/rate-limit";

export const REFRESH_LIMIT: Limit = { scope: "submissions", max: 5, windowMs: 60_000 };

/** Reads the repository's schedules from GitHub and makes the listing match. */
export const refreshRepository = Effect.fn("refreshRepository")(function* (
  owner: string,
  repo: string,
) {
  const github = yield* GitHub;
  const { repository, files } = yield* github.fetchRepositorySchedules(owner, repo).pipe(
    // A repository GitHub no longer has is taken down; any other failure keeps the last listing.
    Effect.tapError((error) =>
      error.status === 404 ? removeRepository({ owner, repo }) : Effect.void,
    ),
  );
  const parsed = files.flatMap((file) => ("schedule" in file ? [file] : []));
  const removed = yield* syncRepository(
    repository,
    parsed.map(({ name, schedule }) => ({ name, ...schedule })),
  );
  return {
    repository,
    listed: parsed.map(({ name, schedule }) => ({ name, displayName: schedule.displayName })),
    skipped: files.flatMap((file) => ("reason" in file ? [file] : [])),
    removed,
  };
});
