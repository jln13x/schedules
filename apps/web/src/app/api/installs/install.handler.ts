import { Effect, Schema } from "effect";
import { z } from "zod";
import { recordInstall, resolveRepository } from "@/db";
import { parseScheduleSource } from "@/db/format";
import { GitHub, REPOSITORY_SEGMENT, SCHEDULE_SLUG } from "@/lib/github";
import { type Limit, RateLimit } from "@/lib/rate-limit";
import { run } from "@/server/runtime";

const INSTALL_SCHEMA = z.strictObject({
  owner: REPOSITORY_SEGMENT.transform((value) => value.toLowerCase()),
  repo: REPOSITORY_SEGMENT.transform((value) => value.toLowerCase()),
  name: SCHEDULE_SLUG,
});
const INSTALL_LIMIT: Limit = { scope: "installs", max: 30, windowMs: 60_000 };
// Installing the same schedule again on the same day doesn't count again, which keeps a loop from
// inflating the ranking.
const COUNT_ONCE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;

class InstallError extends Schema.TaggedError<InstallError>()("InstallError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

const tooLarge = new InstallError({ status: 422, message: "Request body is too large" });

/** The body as text, read no further than the limit. */
const readBody = Effect.fnUntraced(function* (request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES || !request.body) {
    return yield* tooLarge;
  }

  const reader = request.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  const read = Effect.tryPromise({
    try: async () => {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          return new TextDecoder().decode(Buffer.concat(chunks));
        }

        size += value.byteLength;

        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          return undefined;
        }

        chunks.push(value);
      }
    },
    catch: () => new InstallError({ status: 422, message: "Could not read request body" }),
  });
  const body = yield* read;
  return body === undefined ? yield* tooLarge : body;
});

const readInput = Effect.fnUntraced(function* (request: Request) {
  // Browsers always send Origin on a cross-site POST; the CLI never does.
  if (request.headers.has("origin")) {
    return yield* new InstallError({ status: 403, message: "Install reports come from the CLI" });
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return yield* new InstallError({ status: 415, message: "Expected application/json" });
  }

  const body = yield* readBody(request);
  const json = yield* Effect.try({
    try: () => JSON.parse(body) as unknown,
    catch: () => new InstallError({ status: 422, message: "Expected a JSON body" }),
  });
  const input = INSTALL_SCHEMA.safeParse(json);

  if (!input.success) {
    return yield* new InstallError({
      status: 422,
      message: "Expected owner, repo, and a lowercase schedule slug",
    });
  }

  return input.data;
});

const install = Effect.fn("install")(function* (request: Request) {
  const limits = yield* RateLimit;
  const github = yield* GitHub;

  if (!(yield* limits.take(INSTALL_LIMIT, request.headers))) {
    return Response.json(
      { error: "Too many installs. Try again shortly." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const input = yield* readInput(request);
  const subject = `${input.owner}/${input.repo}/${input.name}`;

  if (!(yield* limits.once("installs", COUNT_ONCE_WINDOW_MS, request.headers, subject))) {
    return Response.json({ ok: true });
  }

  // A repository seen before is known by id, so only a new one costs a GitHub lookup.
  const repository =
    (yield* resolveRepository(input)) ??
    (yield* github.fetchRepository(input.owner, input.repo)).repository;
  const source = yield* github.fetchPublicSchedule(repository.owner, repository.repo, input.name);
  const schedule = yield* Effect.try({
    try: () => parseScheduleSource(source),
    catch: () =>
      new InstallError({ status: 422, message: "Schedule frontmatter or prompt is invalid" }),
  });
  yield* recordInstall(repository, { name: input.name, ...schedule }).pipe(
    Effect.catchTag(
      "DatabaseError",
      () => new InstallError({ status: 503, message: "The install could not be saved" }),
    ),
  );
  return Response.json({ ok: true });
});

export function installHandler(request: Request): Promise<Response> {
  return run(
    install(request).pipe(
      Effect.catchTag(["InstallError", "GitHubError"], (error) =>
        Effect.succeed(Response.json({ error: error.message }, { status: error.status })),
      ),
      Effect.catchTag(["DatabaseError", "RateLimitUnavailable"], (error) =>
        Effect.logError("Install failed", error).pipe(
          Effect.as(
            Response.json({ error: "Installs are unavailable right now" }, { status: 503 }),
          ),
        ),
      ),
    ),
  );
}
