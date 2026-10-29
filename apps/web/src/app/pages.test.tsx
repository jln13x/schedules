import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

it("distinguishes checkout statuses and renders a skill page from its listing", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--eval",
      `
    import { expect, mock } from "bun:test";
    import { Effect, Layer } from "effect";
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import Stripe from "stripe";
    import { RateLimit } from "./src/lib/rate-limit.ts";
    import { Billing } from "./src/lib/stripe.ts";
    let session = null;
    let failure;
    let lookups = 0;
    let allowed = true;
    const stripe = { checkout: { sessions: { retrieve: async () => {
      lookups += 1;
      if (failure) { throw failure; }
      return session;
    } } } };
    const services = Layer.mergeAll(
      Layer.succeed(RateLimit, RateLimit.of({ take: () => Effect.succeed(allowed), once: () => Effect.succeed(true) })),
      Layer.succeed(Billing, Billing.make(stripe, "price_fixture", "whsec_fixture")),
    );
    mock.module("next/headers", () => ({ headers: async () => new Headers() }));
    mock.module("@/server/runtime", () => ({ run: (effect) => Effect.runPromise(Effect.provide(effect, services)) }));
    const { default: SponsorSuccess } = await import("./src/app/sponsor/success/page.tsx");
    const renderStatus = async (session_id) => renderToStaticMarkup(await SponsorSuccess({ searchParams: Promise.resolve({ session_id }) }));
    expect(await renderStatus(undefined)).toContain("Checkout unavailable");
    expect(await renderStatus("invalid")).toContain("Checkout unavailable");
    expect(await renderStatus("cs_fixture")).toContain("Checkout unavailable");
    expect(lookups).toBe(0);
    allowed = false;
    expect(await renderStatus("cs_test_fixture12345")).toContain("Payment status unavailable");
    expect(lookups).toBe(0);
    allowed = true;
    session = { mode: "subscription", status: "expired", metadata: { sponsorship_id: "draft" } };
    expect(await renderStatus("cs_test_fixture12345")).toContain("Checkout unavailable");
    failure = new Stripe.errors.StripeInvalidRequestError({ message: "Missing", code: "resource_missing" });
    expect(await renderStatus("cs_test_fixture12345")).toContain("Checkout unavailable");
    failure = new Error("Stripe unavailable");
    expect(await renderStatus("cs_test_fixture12345")).toContain("Payment status unavailable");
    failure = undefined;
    session = { mode: "subscription", status: "open", payment_status: "unpaid", metadata: { sponsorship_id: "draft" } };
    expect(await renderStatus("cs_test_fixture12345")).toContain("Checking your payment");
    session.status = "complete";
    session.payment_status = "paid";
    expect(await renderStatus("cs_test_fixture12345")).toContain("Thanks for supporting schedules.sh");

    const skill = { id: "acme/tools/daily", owner: "acme", repo: "tools", slug: "daily", name: "daily", description: "Review the repository <img src=x onerror=alert(1)>", installs: 1200, usefulness: 67, forTeam: 0.95, cadence: "weekdays", time: "morning", schedule: { cron: "0 8 * * 1-5", hour: 8, weekdays: [1, 2, 3, 4, 5], label: "Every weekday at 08:00", days: "Every weekday", time: "08:00" }, audit: "pass", firstSeenAt: new Date(), score: 1, fits: { you: false, team: true } };
    let found = skill;
    mock.module("@/server/cached", () => ({ SKILLS_TAG: "skills", cachedSkill: async () => found }));
    mock.module("next/cache", () => ({ updateTag() {} }));
    mock.module("next/navigation", () => ({ notFound() { throw new Error("404"); }, usePathname: () => "/acme/tools/daily" }));
    const page = await import("./src/app/[owner]/[repo]/[skill]/page.tsx");
    const render = async (params) => renderToStaticMarkup(await page.default({ params: Promise.resolve(params) }));
    const markup = await render({ owner: "acme", repo: "tools", skill: "daily" });
    expect(markup).toContain("Run daily on a schedule");
    expect(markup).toContain("npx skills add acme/tools --skill daily");
    expect(markup).toContain("agent-schedules schedule daily &quot;0 8 * * 1-5&quot;");
    expect(markup).toContain(">Team<");
    expect(markup).not.toContain(">You<");
    expect(markup).toContain("08:00");
    expect(markup).toContain("Every weekday");
    expect(markup).toContain("https://github.com/acme/tools");
    expect(markup).toContain("https://skills.sh/acme/tools/daily");
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
    found = undefined;
    await expect(render({ owner: "acme", repo: "tools", skill: "daily" })).rejects.toThrow("404");
    for (const params of [{ owner: "a/b", repo: "tools", skill: "daily" }, { owner: "acme", repo: "tools", skill: "Daily" }, { owner: "acme", repo: "..", skill: "daily" }]) {
      await expect(page.generateMetadata({ params: Promise.resolve(params) })).rejects.toThrow("404");
    }
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
