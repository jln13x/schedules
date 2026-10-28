import { expect, it, spyOn } from "bun:test";
import { fetchSchedules, formatSearchResults, searchSchedules } from "./registry.ts";

const SCHEDULE = "---\nname: Morning brief\nschedule: 7 9 * * 1-5\n---\n\nReview today.\n";
const SOURCE = { owner: "acme", repo: "ops" };

function mockGithub(
  entries: ReadonlyArray<{ name: string; download_url?: string | null }>,
  raw: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  branch = "main",
) {
  return spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));

    if (url.origin === "https://raw.githubusercontent.com") {
      return raw(url, init);
    }

    expect(url.origin).toBe(new URL(process.env.GITHUB_API_URL ?? "https://api.github.com").origin);
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    if (url.pathname.endsWith("/contents/.agents/schedules")) {
      expect(url.searchParams.get("ref")).toBe(branch);
      return Response.json(entries);
    }

    return Response.json({
      private: false,
      default_branch: branch,
      owner: { login: "acme" },
      name: "ops",
    });
  });
}

it("aligns search results by source and install count", () => {
  expect(
    formatSearchResults([
      {
        owner: "acme",
        repo: "ops",
        name: "morning-brief",
        displayName: "Morning brief",
        installs: 1200,
      },
      { owner: "acme", repo: "ops", name: "triage", displayName: "TODO triage", installs: 95 },
    ]),
  ).toBe(
    [
      "acme/ops/morning-brief  1200 installs  Morning brief",
      "acme/ops/triage           95 installs  TODO triage",
    ].join("\n"),
  );
});

it("strips terminal controls from every search field without changing the data", () => {
  const result = {
    owner: "ac\u001bme",
    repo: "op\u009bs",
    name: "br\u0000ief",
    displayName: "Morning\u0007 brief\u007f\r\n\tReview",
    installs: 12,
  };
  const original = { ...result };
  expect(formatSearchResults([result])).toBe(
    "acme/ops/brief  12 installs  Morning brief\n\tReview",
  );
  expect(result).toEqual(original);
});

it("ignores download_url and builds raw URLs from the encoded default branch", async () => {
  const branch = "feature/review#today?x=1";
  const fetchMock = mockGithub(
    [
      { name: "morning-brief.md", download_url: "http://127.0.0.1:1234/private" },
      { name: "other.md", download_url: null },
      { name: "../escape.md", download_url: "https://evil.example/escape.md" },
      { name: "nested/file.md" },
      { name: "notes.txt" },
    ],
    (url, init) => {
      expect(url.href).toBe(
        `https://raw.githubusercontent.com/acme/ops/${encodeURIComponent(branch)}/.agents/schedules/${url.pathname.split("/").at(-1)}`,
      );
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(SCHEDULE);
    },
    branch,
  );

  try {
    expect(await fetchSchedules(SOURCE)).toEqual({
      schedules: [
        {
          name: "Morning brief",
          timing: { minute: 7, hour: 9, weekdays: [1, 2, 3, 4, 5] },
          prompt: "Review today.",
        },
        {
          name: "Morning brief",
          timing: { minute: 7, hour: 9, weekdays: [1, 2, 3, 4, 5] },
          prompt: "Review today.",
        },
      ],
      isPublic: true,
      source: SOURCE,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  } finally {
    fetchMock.mockRestore();
  }
});

for (const stage of ["raw", "listing"] as const) {
  it(`cancels an oversized streamed ${stage} body while reading`, async () => {
    const limit = stage === "raw" ? 100_000 : 1_000_000;
    let reads = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream(
        {
          pull(controller) {
            reads += 1;
            controller.enqueue(new Uint8Array(limit / 2 + 1));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      ),
    );
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://raw.githubusercontent.com/")) {
        return response;
      }
      if (url.includes("/contents/")) {
        return stage === "listing" ? response : Response.json([{ name: "morning-brief.md" }]);
      }
      return Response.json({
        private: false,
        default_branch: "main",
        owner: { login: "acme" },
        name: "ops",
      });
    });

    try {
      await expect(fetchSchedules(SOURCE)).rejects.toThrow(`Response exceeds ${limit} bytes`);
      expect(cancelled).toBe(true);
      expect(reads).toBe(2);
      expect(response.body?.locked).toBe(false);
    } finally {
      fetchMock.mockRestore();
    }
  });
}

it("accepts exactly 100 KB and decodes UTF-8 across chunk boundaries", async () => {
  const prefix = SCHEDULE.slice(0, SCHEDULE.indexOf("Review today."));
  const prompt = "é".repeat(Math.floor((100_000 - new TextEncoder().encode(prefix).length) / 2));
  const bytes = new TextEncoder().encode((prefix + prompt).padEnd(100_000 - prompt.length, " "));
  expect(bytes.byteLength).toBe(100_000);
  const split = new TextEncoder().encode(prefix).length + 1;
  const fetchMock = mockGithub(
    [{ name: "morning-brief.md" }],
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, split));
            controller.enqueue(bytes.slice(split));
            controller.close();
          },
        }),
      ),
  );

  try {
    expect((await fetchSchedules(SOURCE)).schedules[0]?.prompt).toBe(prompt);
  } finally {
    fetchMock.mockRestore();
  }
});

const redirect = (location: string) => new Response(null, { status: 301, headers: { location } });

it("follows a renamed repository's redirect only within GitHub's API", async () => {
  const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const run = (first: Response) => {
    const calls: string[] = [];
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      calls.push(url.href);

      if (url.href === `${api}/repos/acme/old-name`) {
        return first;
      }

      if (url.href === `${api}/repositories/42`) {
        return Response.json({
          private: false,
          default_branch: "main",
          owner: { login: "acme" },
          name: "ops",
        });
      }

      if (url.pathname.endsWith("/contents/.agents/schedules")) {
        return Response.json([{ name: "morning-brief.md" }]);
      }

      return new Response(SCHEDULE);
    });
    return { calls, fetchMock };
  };

  const renamed = run(redirect(`${api}/repositories/42`));
  try {
    const fetched = await fetchSchedules({
      owner: "acme",
      repo: "old-name",
      name: "Morning brief",
    });
    expect(fetched.source).toEqual({ owner: "acme", repo: "ops", name: "Morning brief" });
    expect(renamed.calls.slice(2)).toEqual([
      `${api}/repos/acme/ops/contents/.agents/schedules?ref=main`,
      "https://raw.githubusercontent.com/acme/ops/main/.agents/schedules/morning-brief.md",
    ]);
  } finally {
    renamed.fetchMock.mockRestore();
  }

  const elsewhere = run(redirect("https://evil.example/repositories/42"));
  try {
    await expect(fetchSchedules({ owner: "acme", repo: "old-name" })).rejects.toThrow("(301)");
    expect(elsewhere.calls).toHaveLength(1);
  } finally {
    elsewhere.fetchMock.mockRestore();
  }
});

it("refuses repositories with more than 50 schedules before downloading any", async () => {
  const fetchMock = mockGithub(
    Array.from({ length: 51 }, (_, index) => ({ name: `schedule-${index}.md` })),
    () => {
      throw new Error("Unexpected raw download");
    },
  );
  try {
    await expect(fetchSchedules(SOURCE)).rejects.toThrow("too many schedule files");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    fetchMock.mockRestore();
  }
});

it("downloads at most four schedules concurrently and preserves listing order", async () => {
  let active = 0;
  let peak = 0;
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const fetchMock = mockGithub(
    Array.from({ length: 50 }, (_, index) => ({ name: `schedule-${index}.md` })),
    async (url) => {
      active += 1;
      peak = Math.max(peak, active);
      if (active === 4) {
        ready.resolve();
      }
      await release.promise;
      active -= 1;
      return new Response(SCHEDULE.replace("Morning brief", url.pathname.split("/").at(-1) ?? ""));
    },
  );

  try {
    const fetching = fetchSchedules(SOURCE);
    await ready.promise;
    expect(active).toBe(4);
    release.resolve();
    const { schedules } = await fetching;
    expect(schedules.map(({ name }) => name)).toEqual(
      Array.from({ length: 50 }, (_, index) => `schedule-${index}.md`),
    );
    expect(peak).toBe(4);
  } finally {
    release.resolve();
    fetchMock.mockRestore();
  }
});

it("sanitizes schedule parse errors while retaining controls in valid prompts", async () => {
  let raw = SCHEDULE.replace("Review today.", "Review\u001b[31m today.");
  const fetchMock = mockGithub([{ name: "morning-brief.md" }], () => new Response(raw));

  try {
    expect((await fetchSchedules(SOURCE)).schedules[0]?.prompt).toBe("Review\u001b[31m today.");
    raw = SCHEDULE.replace("7 9 * * 1-5", "bad\u001b[31m 9 * * 1-5");
    await expect(fetchSchedules(SOURCE)).rejects.toThrow("Minute bad[31m");
  } finally {
    fetchMock.mockRestore();
  }
});

it("sanitizes search errors", async () => {
  const fetchMock = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Search\u001b[31m failed\u007f"),
  );
  try {
    await expect(searchSchedules("brief")).rejects.toThrow("Search[31m failed");
  } finally {
    fetchMock.mockRestore();
  }
});
