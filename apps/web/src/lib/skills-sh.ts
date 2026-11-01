import { getVercelOidcToken } from "@vercel/oidc";
import { Context, Duration, Effect, Layer, Option, Predicate, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

const API = "https://skills.sh/api/v1";
const TIMEOUT = "20 seconds";

const ListedSkill = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  source: Schema.String,
  installs: Schema.Int,
  sourceType: Schema.String,
  isDuplicate: Schema.optional(Schema.Boolean),
});
export type ListedSkill = typeof ListedSkill.Type;

const LeaderboardPage = Schema.Struct({
  data: Schema.Array(ListedSkill),
  pagination: Schema.Struct({ hasMore: Schema.Boolean, total: Schema.Int }),
});

const SkillDetail = Schema.Struct({
  hash: Schema.NullOr(Schema.String),
  files: Schema.NullOr(
    Schema.Array(Schema.Struct({ path: Schema.String, contents: Schema.String })),
  ),
});

const AuditStatus = Schema.Literals(["pass", "warn", "fail"]);
export type AuditStatus = typeof AuditStatus.Type;
const Audits = Schema.Struct({ audits: Schema.Array(Schema.Struct({ status: AuditStatus })) });

export class SkillsShError extends Schema.TaggedError<SkillsShError>()("SkillsShError", {
  message: Schema.String,
}) {}

/** Thrown back to the retry schedule; skills.sh asks callers to back off on both. */
class Busy extends Schema.TaggedError<Busy>()("Busy", { status: Schema.Number }) {}

export class SkillsSh extends Context.Service<
  SkillsSh,
  {
    /** One page of the all-time leaderboard, most installed first. */
    readonly leaderboard: (
      page: number,
      perPage: number,
    ) => Effect.Effect<typeof LeaderboardPage.Type, SkillsShError>;
    /** The skill's SKILL.md and content hash, or none when skills.sh has no files for it. */
    readonly skill: (
      id: string,
    ) => Effect.Effect<Option.Option<{ hash: string; skillMd: string }>, SkillsShError>;
    /** The worst security audit result, or none when no partner has audited it yet. */
    readonly audit: (id: string) => Effect.Effect<Option.Option<AuditStatus>, SkillsShError>;
  }
>()("schedules/lib/SkillsSh") {
  static readonly layer = Layer.effect(SkillsSh, make()).pipe(Layer.provide(FetchHttpClient.layer));
}

const SEVERITY: Record<AuditStatus, number> = { pass: 0, warn: 1, fail: 2 };

function make() {
  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const get = Effect.fnUntraced(
      function* (path: string) {
        const token = yield* Effect.tryPromise({
          try: () => getVercelOidcToken(),
          catch: () => new SkillsShError({ message: "No Vercel OIDC token for skills.sh" }),
        });
        const response = yield* client
          .execute(
            HttpClientRequest.get(`${API}${path}`).pipe(HttpClientRequest.bearerToken(token)),
          )
          .pipe(
            Effect.timeoutOption(TIMEOUT),
            Effect.flatMap(
              Option.match({
                onNone: () => new SkillsShError({ message: `skills.sh timed out on ${path}` }),
                onSome: Effect.succeed,
              }),
            ),
            Effect.catchTag(
              "HttpClientError",
              () => new SkillsShError({ message: `skills.sh could not be reached for ${path}` }),
            ),
          );

        if (response.status === 429 || response.status === 503) {
          return yield* new Busy({ status: response.status });
        }

        return response;
      },
      Effect.retry({
        while: Predicate.isTagged("Busy"),
        times: 4,
        schedule: Schedule.exponential(Duration.seconds(2)),
      }),
      Effect.catchTag(
        "Busy",
        (busy) => new SkillsShError({ message: `skills.sh kept answering ${busy.status}` }),
      ),
    );

    const decode = Effect.fnUntraced(function* <A>(
      response: HttpClientResponse.HttpClientResponse,
      schema: Schema.Decoder<A>,
      path: string,
    ) {
      if (response.status < 200 || response.status >= 300) {
        return yield* new SkillsShError({
          message: `skills.sh answered ${response.status} for ${path}`,
        });
      }

      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.catch(
          () => new SkillsShError({ message: `skills.sh sent an unexpected body for ${path}` }),
        ),
      );
    });

    return SkillsSh.of({
      leaderboard: (page, perPage) => {
        const path = `/skills?view=all-time&page=${page}&per_page=${perPage}`;
        return get(path).pipe(
          Effect.flatMap((response) => decode(response, LeaderboardPage, path)),
        );
      },
      skill: (id) => {
        const path = `/skills/${id}`;
        return get(path).pipe(
          Effect.flatMap((response) =>
            response.status === 404
              ? Effect.succeed(Option.none())
              : decode(response, SkillDetail, path).pipe(
                  Effect.map(({ hash, files }) => {
                    const skillMd = files?.find((file) => /(^|\/)SKILL\.md$/i.test(file.path));
                    return skillMd && hash
                      ? Option.some({ hash, skillMd: skillMd.contents })
                      : Option.none();
                  }),
                ),
          ),
        );
      },
      audit: (id) => {
        const path = `/skills/audit/${id}`;
        return get(path).pipe(
          Effect.flatMap((response) =>
            response.status === 404
              ? Effect.succeed(Option.none())
              : decode(response, Audits, path).pipe(
                  Effect.map(({ audits }) =>
                    audits.length === 0
                      ? Option.none()
                      : Option.some(
                          audits
                            .map((audit) => audit.status)
                            .reduce((worst, status) =>
                              SEVERITY[status] > SEVERITY[worst] ? status : worst,
                            ),
                        ),
                  ),
                ),
          ),
        );
      },
    });
  });
}
