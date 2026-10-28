import { expect, it } from "bun:test";
import { Redis, type Requester } from "@upstash/redis";
import { Effect } from "effect";
import { env } from "@/env";
import {
  clientId,
  formRateLimitError,
  type Limit,
  RateLimit,
  RateLimitUnavailable,
  UNAVAILABLE_MESSAGE,
} from "./rate-limit";

const run = Effect.runPromise;

it("shares limits between instances while keeping actions and client IPs separate", async () => {
  const counts = new Map<string, number>();
  const request: Requester["request"] = async <TResult>({ body }: { body?: unknown }) => {
    const command = body as Array<string | number>;
    const key = String(command[3]).replace(/:\d+$/, "");
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    await Promise.resolve();
    return { result: [2 - count, 2] as TResult };
  };
  const installs: Limit = { scope: "installs", max: 2, windowMs: 60_000 };
  const first = RateLimit.make(new Redis({ request }));
  const second = RateLimit.make(new Redis({ request }));
  const headers = new Headers({ "x-forwarded-for": "192.0.2.1, 192.0.2.99" });
  expect(await run(first.take(installs, headers))).toBe(true);
  expect(await run(second.take(installs, headers))).toBe(true);
  expect(await run(first.take(installs, headers))).toBe(false);
  expect(await run(second.take(installs, headers))).toBe(false);
  expect(await run(second.take(installs, new Headers({ "x-forwarded-for": "192.0.2.2" })))).toBe(
    true,
  );
  expect(await run(second.take({ ...installs, scope: "sponsor-checkout" }, headers))).toBe(true);
  // Keys carry a keyed hash of the address, never the address itself.
  expect([...counts.keys()]).toContain(
    `schedules:${env.VERCEL_ENV ?? "development"}:ratelimit:installs:${clientId(headers)}`,
  );
  expect([...counts.keys()].join(" ")).not.toContain("192.0.2.1");
});

it("counts a caller's action once per window", async () => {
  const seen = new Set<string>();
  const limits = RateLimit.make(
    new Redis({
      request: async <TResult>({ body }: { body?: unknown }) => {
        const [, key] = body as Array<string>;
        const fresh = !seen.has(String(key));
        seen.add(String(key));
        await Promise.resolve();
        return { result: (fresh ? "OK" : null) as TResult };
      },
    }),
  );
  const headers = new Headers({ "x-forwarded-for": "192.0.2.1" });
  expect(await run(limits.once("installs", 60_000, headers, "a/b/c"))).toBe(true);
  expect(await run(limits.once("installs", 60_000, headers, "a/b/c"))).toBe(false);
  expect(await run(limits.once("installs", 60_000, headers, "a/b/d"))).toBe(true);
  expect(
    await run(
      limits.once("installs", 60_000, new Headers({ "x-forwarded-for": "192.0.2.2" }), "a/b/c"),
    ),
  ).toBe(true);
  expect([...seen].join(" ")).not.toContain("192.0.2.1");
});

it("does not allow requests when Redis fails", async () => {
  const limits = RateLimit.make(
    new Redis({
      request: async () => {
        throw new Error("Redis unavailable");
      },
    }),
  );
  const outcome = await run(
    Effect.flip(
      limits.take(
        { scope: "installs", max: 30, windowMs: 60_000 },
        new Headers({ "x-forwarded-for": "192.0.2.1" }),
      ),
    ),
  );
  expect(outcome).toBeInstanceOf(RateLimitUnavailable);
});

it("returns form errors for denied requests and outages, and permits only successful checks", async () => {
  const limit: Limit = { scope: "feedback", max: 1, windowMs: 1000 };
  const headers = new Headers();
  const withOutcome = (take: Effect.Effect<boolean, RateLimitUnavailable>) =>
    run(
      formRateLimitError(limit, headers, "Too many attempts").pipe(
        Effect.provideService(RateLimit, RateLimit.of({ take: () => take, once: () => take })),
      ),
    );
  expect(await withOutcome(Effect.succeed(true))).toBeUndefined();
  expect(await withOutcome(Effect.succeed(false))).toBe("Too many attempts");
  expect(
    await withOutcome(
      Effect.fail(new RateLimitUnavailable({ cause: new Error("Redis unavailable") })),
    ),
  ).toBe(UNAVAILABLE_MESSAGE);
});
