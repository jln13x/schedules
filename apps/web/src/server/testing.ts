import { mock } from "bun:test";
import { Effect, Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/http";
import { PgliteDatabase } from "@/db/pglite";
import { GitHub } from "@/lib/github";

// Shared so test files reuse one in-memory database rather than booting PGlite each.
const memoMap = Layer.makeMemoMapUnsafe();

export const testRuntime = <R, E>(layer: Layer.Layer<R, E>) =>
  ManagedRuntime.make(layer, { memoMap });

export const TestServices = Layer.mergeAll(PgliteDatabase, GitHub.layer);

/** Answers requests from a table of URLs with a Response, JSON, or text; 404 for the rest. */
export function fakeFetch(routes: Record<string, unknown>) {
  return mock(async (url: string | URL | Request) => {
    const body = routes[String(url)];

    if (body === undefined) {
      return new Response("Not Found", { status: 404 });
    }

    if (body instanceof Response) {
      return body;
    }

    return typeof body === "string" ? new Response(body) : Response.json(body);
  }) as unknown as typeof fetch & ReturnType<typeof mock>;
}

/** Points every HttpClient request in the effect at a fetch of the test's choosing. */
export const usingFetch =
  (fetch: typeof globalThis.fetch) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch));
