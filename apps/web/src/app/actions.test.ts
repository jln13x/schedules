import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

it("returns temporary failures from every form during limiter outages and keeps validation errors by field", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--eval",
      `
    import { expect, mock } from "bun:test";
    import { Effect, Layer } from "effect";
    import { Discord } from "./src/lib/discord.ts";
    import { GitHub } from "./src/lib/github.ts";
    import { RateLimit, RateLimitUnavailable } from "./src/lib/rate-limit.ts";
    let unavailable = true;
    const take = () => unavailable ? Effect.fail(new RateLimitUnavailable({ cause: new Error("Redis unavailable") })) : Effect.succeed(true);
    const refuse = () => Effect.die(new Error("Must not reach GitHub"));
    const services = Layer.mergeAll(
      Layer.succeed(RateLimit, RateLimit.of({ take, once: take })),
      Layer.succeed(GitHub, GitHub.of({ fetchRepository: refuse, fetchRepositorySchedules: refuse, fetchPublicSchedule: refuse })),
      Layer.succeed(Discord, Discord.of({ send: () => Effect.void, notify: () => Effect.void })),
    );
    mock.module("next/headers", () => ({ headers: async () => new Headers() }));
    mock.module("next/cache", () => ({ updateTag() {} }));
    mock.module("@/server/cached", () => ({ SCHEDULES_TAG: "schedules" }));
    mock.module("next/server", () => ({ after() {} }));
    mock.module("@/server/runtime", () => ({ run: (effect) => Effect.runPromise(Effect.provide(effect, services)) }));
    const { sendFeedback } = await import("./src/components/feedback/actions.ts");
    const { submitRepository } = await import("./src/app/submit/actions.ts");
    const { sponsorCheckout } = await import("./src/app/sponsor/actions.ts");
    const feedback = await sendFeedback({ status: "idle" }, new FormData());
    const submit = await submitRepository({ status: "idle" }, new FormData());
    const sponsor = await sponsorCheckout({}, new FormData());
    expect(feedback).toMatchObject({ status: "error", message: "Temporarily unavailable. Please try again later." });
    expect(submit).toMatchObject({ status: "error", message: "Temporarily unavailable. Please try again later." });
    expect(sponsor).toEqual({ error: "Temporarily unavailable. Please try again later." });
    unavailable = false;
    const sponsorForm = new FormData();
    sponsorForm.set("name", " "); sponsorForm.set("description", " "); sponsorForm.set("url", "javascript:alert(1)");
    const validation = await sponsorCheckout({}, sponsorForm);
    expect(Object.keys(validation.fields).sort()).toEqual(["description", "name", "url"]);
    expect(validation.error).toBeUndefined();
    const feedbackForm = new FormData();
    feedbackForm.set("kind", "report"); feedbackForm.set("page", "/"); feedbackForm.set("reason", ""); feedbackForm.set("details", "x".repeat(1001));
    const errors = await sendFeedback({ status: "idle" }, feedbackForm);
    expect(Object.keys(errors.fields).sort()).toEqual(["details", "reason"]);
  `,
    ],
    {
      cwd: new URL("../../", import.meta.url),
      env: { ...process.env, NODE_ENV: "test" },
    },
  );
  expect(result.stderr?.toString()).not.toContain("error:");
  expect(result.status).toBe(0);
});
