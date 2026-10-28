import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Context, Effect, Layer, Schema } from "effect";
import { env } from "@/env";

export interface Limit {
  readonly scope: string;
  readonly max: number;
  readonly windowMs: number;
}

export class RateLimitUnavailable extends Schema.TaggedError<RateLimitUnavailable>()(
  "RateLimitUnavailable",
  { cause: Schema.Defect() },
) {}

const prefix = (scope: string) => `schedules:${env.VERCEL_ENV ?? "development"}:${scope}`;
const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new RateLimitUnavailable({ cause }) });

/**
 * Stands in for the caller's address in Redis keys, so no raw IP is stored anywhere. Keyed with the
 * KV token because it is the one secret the store already depends on; whoever holds it can read the
 * keys anyway.
 */
export function clientId(headers: Headers) {
  // Only tests, which skip env validation, run without the token.
  const address = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", env.KV_REST_API_TOKEN ?? "")
    .update(address)
    .digest("base64url")
    .slice(0, 22);
}

export class RateLimit extends Context.Service<
  RateLimit,
  {
    /** Whether the caller may do this now; false when they have hit the limit. */
    readonly take: (limit: Limit, headers: Headers) => Effect.Effect<boolean, RateLimitUnavailable>;
    /** True the first time a caller does something within the window, false for repeats. */
    readonly once: (
      scope: string,
      windowMs: number,
      headers: Headers,
      subject: string,
    ) => Effect.Effect<boolean, RateLimitUnavailable>;
  }
>()("schedules/lib/RateLimit") {
  static readonly make = (redis: Redis) => {
    const limiters = new Map<string, Ratelimit>();
    const limiter = ({ scope, max, windowMs }: Limit) => {
      let limiter = limiters.get(scope);

      if (!limiter) {
        limiter = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`),
          prefix: prefix(`ratelimit:${scope}`),
          analytics: false,
          ephemeralCache: false,
          timeout: 0,
        });
        limiters.set(scope, limiter);
      }

      return limiter;
    };
    return RateLimit.of({
      take: (limit, headers) =>
        attempt(async () => {
          const { success, pending } = await limiter(limit).limit(clientId(headers));
          await pending;
          return success;
        }),
      once: (scope, windowMs, headers, subject) =>
        attempt(
          async () =>
            (await redis.set(`${prefix(`once:${scope}`)}:${clientId(headers)}:${subject}`, 1, {
              nx: true,
              px: windowMs,
            })) === "OK",
        ),
    });
  };

  static readonly layer = Layer.sync(RateLimit, () =>
    RateLimit.make(new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN })),
  );
}

export const UNAVAILABLE_MESSAGE = "Temporarily unavailable. Please try again later.";

/** For forms: the message to show, or undefined when the caller may go ahead. */
export const formRateLimitError = (limit: Limit, headers: Headers, limitedMessage: string) =>
  RateLimit.use((limits) => limits.take(limit, headers)).pipe(
    Effect.map((allowed) => (allowed ? undefined : limitedMessage)),
    Effect.catchTag("RateLimitUnavailable", () => Effect.succeed(UNAVAILABLE_MESSAGE)),
  );
