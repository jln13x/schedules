import { expect, it } from "bun:test";
import { Effect, Result } from "effect";
import { FetchHttpClient } from "effect/http";
import { fakeFetch, usingFetch } from "@/server/testing";
import { checkoutEmbed, Discord, feedbackEmbed } from "./discord";

it("builds a report embed with the reason and page", () => {
  const embed = feedbackEmbed({
    kind: "report",
    page: "/acme/tools/nightly",
    reason: "dangerous",
    details: "It runs rm -rf.",
  });
  expect(embed.title).toBe("Skill report");
  expect(embed.url).toBe("https://schedules.sh/acme/tools/nightly");
  expect(embed.description).toBe("It runs rm -rf.");
  expect(embed.fields.map((field) => field.value)).toEqual([
    "/acme/tools/nightly",
    "Dangerous or malicious skill",
  ]);
});

it("builds a feedback embed without a reason", () => {
  const embed = feedbackEmbed({ kind: "feedback", page: "/", details: "Love it." });
  expect(embed.title).toBe("Feedback");
  expect(embed.description).toBe("Love it.");
  expect(embed.fields).toHaveLength(1);
});

it("posts the embed with mentions disabled and fails on a refusal", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: calls.length === 1 ? 204 : 429 });
  }) as typeof fetch;
  const embed = feedbackEmbed({ kind: "feedback", page: "/", details: "@everyone hi" });
  const send = (webhookUrl: string | undefined) =>
    Effect.runPromise(
      Discord.make(webhookUrl).pipe(
        Effect.flatMap((discord) => Effect.result(discord.send(embed))),
        Effect.provide(FetchHttpClient.layer),
        usingFetch(fetcher),
      ),
    );
  expect(Result.isSuccess(await send("https://discord.com/api/webhooks/1/abc"))).toBe(true);
  expect(calls[0]?.url).toBe("https://discord.com/api/webhooks/1/abc");
  const body = calls[0]?.body as { allowed_mentions: unknown; embeds: Array<{ title: string }> };
  expect(body.allowed_mentions).toEqual({ parse: [] });
  expect(body.embeds[0]?.title).toBe("Feedback");
  expect(Result.isFailure(await send("https://discord.com/api/webhooks/1/abc"))).toBe(true);
  expect(Result.isFailure(await send(undefined))).toBe(true);
  expect(calls).toHaveLength(2);
});

it("never fails a notification, with or without a webhook", async () => {
  const embed = feedbackEmbed({ kind: "feedback", page: "/", details: "hi" });
  for (const webhookUrl of [undefined, "https://discord.com/api/webhooks/1/abc"]) {
    await Effect.runPromise(
      Discord.make(webhookUrl).pipe(
        Effect.flatMap((discord) => discord.notify(embed)),
        Effect.provide(FetchHttpClient.layer),
        usingFetch(fakeFetch({})),
      ),
    );
  }
});

it("describes a started checkout with only the requested listing", () => {
  const embed = checkoutEmbed({
    name: "Acme",
    description: "Error triage for every deploy.",
    url: "https://acme.example",
  });
  expect(embed.title).toBe("Checkout started: Acme");
  expect(embed.description).toBe("Error triage for every deploy.");
  expect(Object.keys(embed).toSorted()).toEqual(["color", "description", "fields", "title", "url"]);
  expect(embed.fields).toEqual([{ name: "Website", value: "https://acme.example" }]);
});

it("keeps a maximum-length report path out of the embed title", () => {
  const page = `/${"a".repeat(299)}`;
  const embed = feedbackEmbed({ kind: "report", page, reason: "other", details: "" });
  expect(embed.title.length).toBeLessThanOrEqual(256);
  expect(embed.fields[0]?.value).toBe(page);
});
