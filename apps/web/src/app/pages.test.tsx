import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

it("distinguishes checkout statuses and omits empty sibling sections", () => {
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

    const schedule = { id: 1, owner: "acme", repo: "tools", name: "daily", displayName: "Daily", cron: "0 9 * * *", prompt: "Review this repository.\\n\\n![pixel](https://tracker.example/p.png)", description: "Fixture", installs: 0, history: [], firstSeenAt: new Date() };
    let repository = [schedule];
    mock.module("@/server/cached", () => ({ SCHEDULES_TAG: "schedules", cachedSchedule: async () => schedule, cachedRepository: async () => repository }));
    mock.module("next/cache", () => ({ updateTag() {} }));
    mock.module("@/db", () => ({ resolveRepository: () => Effect.succeed(undefined) }));
    mock.module("next/navigation", () => ({ notFound() { throw new Error("Missing schedule"); }, permanentRedirect() { throw new Error("Unexpected redirect"); }, usePathname: () => "/acme/tools/daily" }));
    const { default: SchedulePage } = await import("./src/app/[owner]/[repo]/[name]/page.tsx");
    const renderSchedule = async () => renderToStaticMarkup(await SchedulePage({ params: Promise.resolve(schedule) }));
    const alone = await renderSchedule();
    expect(alone).not.toContain("More from");
    expect(alone).not.toContain("<img");
    expect(alone).not.toContain("tracker.example");
    repository = [schedule, { ...schedule, id: 2, name: "weekly" }];
    const markup = await renderSchedule();
    expect(markup).toContain("More from");
    expect(markup).toContain("/acme/tools/weekly");
    const { Panel } = await import("./src/components/panel.tsx");
    const panel = renderToStaticMarkup(createElement(Panel, { className: "p-6" }, "Prompt"));
    expect(panel).toContain("Prompt");
    expect(panel).not.toContain("<svg");
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
