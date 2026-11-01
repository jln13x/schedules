import { expect, it, spyOn } from "bun:test";
import { formatSearchResults, searchSkills } from "./registry.ts";

const WEEKDAYS = { cron: "0 8 * * 1-5", label: "Every weekday at 08:00" };

it("aligns search results by source and install count, with the suggested schedule", () => {
  expect(
    formatSearchResults([
      {
        owner: "acme",
        repo: "ops",
        name: "morning-brief",
        displayName: "Morning brief",
        installs: 1200,
        schedule: WEEKDAYS,
      },
      {
        owner: "acme",
        repo: "ops",
        name: "triage",
        displayName: "TODO triage",
        installs: 95,
        schedule: { cron: "0 8 1 * *", label: "Every month on the 1st at 08:00" },
      },
    ]),
  ).toBe(
    [
      "acme/ops/morning-brief  1200 installs  Every weekday at 08:00  0 8 * * 1-5",
      "acme/ops/triage           95 installs  Every month on the 1st at 08:00  0 8 1 * *",
    ].join("\n"),
  );
});

it("strips terminal controls from every search field without changing the data", () => {
  const result = {
    owner: "ac\u001bme",
    repo: "op\u009bs",
    name: "br\u0000ief",
    displayName: "Morning brief",
    installs: 12,
    schedule: { cron: "0 8 * * 1-5", label: "Every\u0007 weekday\u007f\r\n\tat 08:00" },
  };
  const original = { ...result };
  expect(formatSearchResults([result])).toBe(
    "acme/ops/brief  12 installs  Every weekday\n\tat 08:00  0 8 * * 1-5",
  );
  expect(result).toEqual(original);
});

it("stops reading a search reply past its size limit", async () => {
  let cancelled = false;
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(600_000));
        },
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  try {
    await expect(searchSkills("brief")).rejects.toThrow("Response exceeds 1000000 bytes");
    expect(cancelled).toBe(true);
  } finally {
    fetchMock.mockRestore();
  }
});

it("sanitizes search errors", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Search\u001b[31m failed\u007f"),
  );
  try {
    await expect(searchSkills("brief")).rejects.toThrow("Search[31m failed");
  } finally {
    fetchMock.mockRestore();
  }
});
