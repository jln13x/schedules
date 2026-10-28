import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

it("rejects reserved owners at submission with a clear message", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--eval",
      `
    import { expect, mock } from "bun:test";
    import { Effect, Layer } from "effect";
    import { GitHub } from "./src/lib/github.ts";
    import { RateLimit } from "./src/lib/rate-limit.ts";
    import { RESERVED_OWNERS } from "./src/lib/site.ts";
    const refuse = () => Effect.die(new Error("Must not refresh a reserved owner"));
    const services = Layer.mergeAll(
      Layer.succeed(RateLimit, RateLimit.of({ take: () => Effect.succeed(true), once: () => Effect.succeed(true) })),
      Layer.succeed(GitHub, GitHub.of({ fetchRepository: refuse, fetchRepositorySchedules: refuse, fetchPublicSchedule: refuse })),
    );
    mock.module("next/headers", () => ({ headers: async () => new Headers() }));
    mock.module("next/cache", () => ({ updateTag() {} }));
    mock.module("@/server/cached", () => ({ SCHEDULES_TAG: "schedules" }));
    mock.module("next/server", () => ({ after() {} }));
    mock.module("@/server/runtime", () => ({ run: (effect) => Effect.runPromise(Effect.provide(effect, services)) }));
    const { submitRepository } = await import("./src/app/submit/actions.ts");
    expect(RESERVED_OWNERS).toEqual([
      "docs", "sponsor", "submit", "privacy", "terms", "api", "llms.txt",
      "sitemap.xml", "robots.txt", "opengraph-image", "u", "_next",
    ]);
    for (const owner of RESERVED_OWNERS) {
      for (const repository of [owner + "/tools", "https://github.com/" + owner.toUpperCase() + "/tools.git"]) {
        const form = new FormData();
        form.set("repository", repository);
        expect(await submitRepository({ status: "idle" }, form)).toMatchObject({
          status: "error", message: expect.stringContaining("reserved"),
        });
      }
    }
  `,
    ],
    { cwd: new URL("../../../", import.meta.url), env: { ...process.env, NODE_ENV: "test" } },
  );
  expect(result.status, result.stderr?.toString()).toBe(0);
});
