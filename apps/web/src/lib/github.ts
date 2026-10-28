import { slug } from "@agent-schedules/format";
import { Context, Effect, Layer, Option, Schema, Stream } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import type { Repository } from "@/db";
import { parseScheduleSource, REPOSITORY_SEGMENT, SCHEDULE_SLUG } from "@/db/format";
import { env } from "@/env";
import { RESERVED_OWNERS } from "./site";

export { REPOSITORY_SEGMENT, SCHEDULE_SLUG } from "@/db/format";

const TIMEOUT = "8 seconds";
const MAX_SCHEDULE_BYTES = 100_000;
const MAX_FILES = 50;
const FILE_CONCURRENCY = 8;

const RepositoryPayload = Schema.Struct({
  id: Schema.Int,
  private: Schema.Boolean,
  default_branch: Schema.String,
  owner: Schema.Struct({ login: Schema.String }),
  name: Schema.String,
});
const EntriesPayload = Schema.Array(Schema.Struct({ name: Schema.String, type: Schema.String }));

/** Carries the HTTP status the site answers with, so handlers can pass it on. */
export class GitHubError extends Schema.TaggedError<GitHubError>()("GitHubError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

export type RepositoryFile =
  | { file: string; name: string; schedule: ReturnType<typeof parseScheduleSource> }
  | { file: string; reason: string };

export class GitHub extends Context.Service<
  GitHub,
  {
    /** The repository under its current name; GitHub answers an old name with the renamed one. */
    readonly fetchRepository: (
      owner: string,
      repo: string,
    ) => Effect.Effect<{ repository: Repository; defaultBranch: string }, GitHubError>;
    readonly fetchRepositorySchedules: (
      owner: string,
      repo: string,
    ) => Effect.Effect<{ repository: Repository; files: RepositoryFile[] }, GitHubError>;
    readonly fetchPublicSchedule: (
      owner: string,
      repo: string,
      name: string,
    ) => Effect.Effect<string, GitHubError>;
  }
>()("schedules/lib/GitHub") {
  static readonly layer = Layer.effect(GitHub, make()).pipe(Layer.provide(FetchHttpClient.layer));
}

const unreachable = new GitHubError({ status: 502, message: "GitHub could not be reached" });

const validRepositoryName = Effect.fnUntraced(function* (owner: string, repo: string) {
  if (RESERVED_OWNERS.includes(owner.toLowerCase())) {
    return yield* new GitHubError({
      status: 422,
      message: "This GitHub owner name is reserved by schedules.sh routes.",
    });
  }

  if (!REPOSITORY_SEGMENT.safeParse(owner).success || !REPOSITORY_SEGMENT.safeParse(repo).success) {
    return yield* new GitHubError({
      status: 422,
      message: "Expected a GitHub owner and repository name",
    });
  }
});

function make() {
  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const send = (request: HttpClientRequest.HttpClientRequest) =>
      client.execute(request).pipe(
        Effect.timeoutOption(TIMEOUT),
        Effect.flatMap(Option.match({ onNone: () => unreachable, onSome: Effect.succeed })),
        Effect.catchTag("HttpClientError", () => unreachable),
      );

    const api = Effect.fnUntraced(function* <A>(
      path: string,
      schema: Schema.Decoder<A>,
      missing: string,
    ) {
      const response = yield* send(
        HttpClientRequest.get(`https://api.github.com${path}`).pipe(
          HttpClientRequest.setHeaders({
            accept: "application/vnd.github+json",
            "user-agent": "schedules.sh",
            authorization: `Bearer ${env.GITHUB_TOKEN}`,
          }),
        ),
      );

      if (response.status === 404) {
        return yield* new GitHubError({ status: 404, message: missing });
      }

      if (response.status === 403 || response.status === 429) {
        return yield* new GitHubError({
          status: 503,
          message: "GitHub's rate limit was reached. Try again in a few minutes.",
        });
      }

      if (response.status < 200 || response.status >= 300) {
        return yield* new GitHubError({ status: 502, message: "GitHub verification failed" });
      }

      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.catch(() => new GitHubError({ status: 502, message: "GitHub verification failed" })),
      );
    });

    // Read as it streams and stop at the limit, so a huge file never lands in memory.
    const readRaw = Effect.fnUntraced(function* (
      owner: string,
      repo: string,
      ref: string,
      file: string,
    ) {
      const unreadable = new GitHubError({ status: 502, message: "The file could not be read" });
      const response = yield* send(
        HttpClientRequest.get(
          `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(ref)}/.agents/schedules/${encodeURIComponent(file)}`,
        ),
      );

      if (response.status < 200 || response.status >= 300) {
        return yield* response.status === 404
          ? new GitHubError({ status: 404, message: unreadable.message })
          : unreadable;
      }

      const decoder = new TextDecoder();
      const read = Stream.runFoldEffect(
        response.stream,
        () => ({ bytes: 0, text: "" }),
        (acc, chunk: Uint8Array) => {
          const bytes = acc.bytes + chunk.byteLength;
          return bytes > MAX_SCHEDULE_BYTES
            ? new GitHubError({ status: 422, message: "The file is larger than 100 KB" })
            : Effect.succeed({ bytes, text: acc.text + decoder.decode(chunk, { stream: true }) });
        },
      );
      const { text } = yield* read.pipe(
        Effect.timeoutOption(TIMEOUT),
        Effect.flatMap(Option.match({ onNone: () => unreadable, onSome: Effect.succeed })),
        Effect.catchTag("HttpClientError", () => unreadable),
      );
      return text + decoder.decode();
    });

    const fetchRepository = Effect.fn("GitHub.fetchRepository")(function* (
      owner: string,
      repo: string,
    ) {
      yield* validRepositoryName(owner, repo);
      const missing = "No public GitHub repository with that name";
      const data = yield* api(`/repos/${owner}/${repo}`, RepositoryPayload, missing);

      // A token can read private repositories, and the directory must never list one.
      if (data.private) {
        return yield* new GitHubError({ status: 404, message: missing });
      }

      const current = { owner: data.owner.login.toLowerCase(), repo: data.name.toLowerCase() };
      yield* validRepositoryName(current.owner, current.repo);
      const renamed = current.owner !== owner.toLowerCase() || current.repo !== repo.toLowerCase();
      const repository: Repository = {
        id: data.id,
        ...current,
        ...(renamed
          ? { renamedFrom: { owner: owner.toLowerCase(), repo: repo.toLowerCase() } }
          : {}),
      };
      return { repository, defaultBranch: data.default_branch };
    });

    const readListedFile = (
      { owner, repo }: Repository,
      defaultBranch: string,
      file: string,
    ): Effect.Effect<RepositoryFile, GitHubError> =>
      Effect.gen(function* () {
        const name = SCHEDULE_SLUG.safeParse(file.slice(0, -".md".length));

        if (!name.success) {
          return { file, reason: "File names must be lowercase words joined by hyphens" };
        }

        // A listed file's 404 must not count as the repository being gone.
        const source = yield* readRaw(owner, repo, defaultBranch, file).pipe(
          Effect.mapError(
            (error) => new GitHubError({ status: 502, message: `${file}: ${error.message}` }),
          ),
        );

        try {
          const schedule = parseScheduleSource(source);
          const expectedName = slug(schedule.displayName);

          if (name.data !== expectedName) {
            return {
              file,
              reason: `File name must be ${expectedName}.md to match the frontmatter name "${schedule.displayName}"`,
            };
          }

          return { file, name: name.data, schedule };
        } catch (error) {
          return {
            file,
            reason: `Invalid schedule: ${(error instanceof Error ? error.message : String(error)).split("\n")[0]}`,
          };
        }
      });

    const fetchRepositorySchedules = Effect.fn("GitHub.fetchRepositorySchedules")(function* (
      requestedOwner: string,
      requestedRepo: string,
    ) {
      const { repository, defaultBranch } = yield* fetchRepository(requestedOwner, requestedRepo);
      const { owner, repo } = repository;
      const entries = yield* api(
        `/repos/${owner}/${repo}/contents/.agents/schedules?ref=${encodeURIComponent(defaultBranch)}`,
        EntriesPayload,
        "The default branch has no .agents/schedules/ folder",
      );
      const files = entries.filter((entry) => entry.type === "file" && entry.name.endsWith(".md"));

      // GitHub caps directory listings at 1,000 entries, so that response may be incomplete too.
      if (files.length > MAX_FILES || entries.length >= 1000) {
        return yield* new GitHubError({
          status: 422,
          message: "This repository has too many schedule files to refresh safely.",
        });
      }

      const results = yield* Effect.forEach(
        files,
        (entry) => readListedFile(repository, defaultBranch, entry.name),
        { concurrency: FILE_CONCURRENCY },
      );
      return { repository, files: results };
    });

    const fetchPublicSchedule = Effect.fn("GitHub.fetchPublicSchedule")(function* (
      owner: string,
      repo: string,
      name: string,
    ) {
      return yield* readRaw(owner, repo, "HEAD", `${name}.md`).pipe(
        Effect.mapError((error) =>
          error.status === 404
            ? new GitHubError({ status: 404, message: "Public schedule not found" })
            : error,
        ),
      );
    });

    return GitHub.of({ fetchRepository, fetchRepositorySchedules, fetchPublicSchedule });
  });
}
