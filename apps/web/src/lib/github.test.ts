import { expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { getRepositories, getSchedule, syncRepository } from "@/db";
import { Database } from "@/db/database";
import { parseScheduleSource } from "@/db/format";
import { schedules } from "@/db/schema";
import { fakeFetch, TestServices, testRuntime, usingFetch } from "@/server/testing";
import { GitHub } from "./github";
import { refreshRepository } from "./listing";
import { RESERVED_OWNERS } from "./site";

const SCHEDULE =
  "---\nname: Morning brief\nschedule: 7 9 * * 1-5\n---\n\nList what needs me today.\n";
const runtime = testRuntime(TestServices);
const DATABASE_TEST = it.skipIf(Boolean(process.env.DATABASE_URL));

function repository(
  owner: string,
  name: string,
  { id = 1, isPrivate = false, branch = "main" } = {},
) {
  return { id, private: isPrivate, default_branch: branch, owner: { login: owner }, name };
}

/** Runs against a GitHub that answers only the given URLs. */
function github(routes: Record<string, unknown>) {
  const fetch = fakeFetch(routes);
  const run = <A, E>(use: (github: GitHub["Service"]) => Effect.Effect<A, E, Database | GitHub>) =>
    runtime.runPromise(GitHub.use(use).pipe(usingFetch(fetch)));
  return {
    fetch,
    run,
    fail: <A, E>(use: (github: GitHub["Service"]) => Effect.Effect<A, E, Database | GitHub>) =>
      run((api) => Effect.flip(use(api))),
  };
}

it("lists valid files and reports why the others were skipped", async () => {
  const { run } = github({
    "https://api.github.com/repos/acme/web": repository("acme", "web"),
    "https://api.github.com/repos/acme/web/contents/.agents/schedules?ref=main": [
      { name: "morning-brief.md", type: "file" },
      { name: "Bad Name.md", type: "file" },
      { name: "broken.md", type: "file" },
      { name: "notes.txt", type: "file" },
    ],
    "https://raw.githubusercontent.com/acme/web/main/.agents/schedules/morning-brief.md": SCHEDULE,
    "https://raw.githubusercontent.com/acme/web/main/.agents/schedules/broken.md": "no frontmatter",
  });
  const { files } = await run((api) => api.fetchRepositorySchedules("acme", "web"));
  expect(files.map((file) => ("schedule" in file ? file.name : `skipped ${file.file}`))).toEqual([
    "morning-brief",
    "skipped Bad Name.md",
    "skipped broken.md",
  ]);
});

it("refuses private repositories even when a token can read them", async () => {
  const { fail } = github({
    "https://api.github.com/repos/acme/secret": repository("acme", "secret", { isPrivate: true }),
  });
  expect(await fail((api) => api.fetchRepositorySchedules("acme", "secret"))).toMatchObject({
    status: 404,
    message: "No public GitHub repository with that name",
  });
});

it("skips files whose basename differs from the slug of their frontmatter name", async () => {
  const { run } = github({
    "https://api.github.com/repos/acme/web": repository("acme", "web"),
    "https://api.github.com/repos/acme/web/contents/.agents/schedules?ref=main": [
      { name: "review.md", type: "file" },
      { name: "daily-review.md", type: "file" },
    ],
    "https://raw.githubusercontent.com/acme/web/main/.agents/schedules/review.md": SCHEDULE.replace(
      "Morning brief",
      "Daily review",
    ),
    "https://raw.githubusercontent.com/acme/web/main/.agents/schedules/daily-review.md":
      SCHEDULE.replace("Morning brief", "Daily review"),
  });
  const { files } = await run((api) => api.fetchRepositorySchedules("acme", "web"));
  expect(files[0]).toEqual({
    file: "review.md",
    reason: 'File name must be daily-review.md to match the frontmatter name "Daily review"',
  });
  expect(files[1]).toHaveProperty("name", "daily-review");
});

it("rejects owners reserved by application routes before requesting GitHub", async () => {
  const { fetch, fail } = github({});
  for (const owner of RESERVED_OWNERS) {
    expect(
      await fail((api) => api.fetchRepositorySchedules(owner.toUpperCase(), "tools")),
    ).toMatchObject({ status: 422, message: expect.stringContaining("reserved") });
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("follows a renamed repository to its current name and reads files from there", async () => {
  const { run } = github({
    "https://api.github.com/repos/Acme/old-name": repository("Acme", "Web", { id: 42 }),
    "https://api.github.com/repos/acme/web/contents/.agents/schedules?ref=main": [
      { name: "morning-brief.md", type: "file" },
    ],
    "https://raw.githubusercontent.com/acme/web/main/.agents/schedules/morning-brief.md": SCHEDULE,
  });
  const { repository: found, files } = await run((api) =>
    api.fetchRepositorySchedules("Acme", "old-name"),
  );
  expect(found).toEqual({
    id: 42,
    owner: "acme",
    repo: "web",
    renamedFrom: { owner: "acme", repo: "old-name" },
  });
  expect(files[0]).toHaveProperty("name", "morning-brief");
  const { fail } = github({
    "https://api.github.com/repos/acme/web": repository("acme", "web", { id: 42 }),
  });
  expect(await fail((api) => api.fetchRepositorySchedules("acme", "web"))).toMatchObject({
    status: 404,
  });
});

it("refuses a repository whose current owner is reserved by application routes", async () => {
  const { fail } = github({ "https://api.github.com/repos/acme/web": repository("docs", "web") });
  expect(await fail((api) => api.fetchRepositorySchedules("acme", "web"))).toMatchObject({
    status: 422,
  });
});

DATABASE_TEST(
  "keeps the last listing and reports failures downloading listed files",
  async () => {
    const owner = "download-fixture";
    const repo = "tools";

    try {
      for (const status of [404, 403, 429, 500]) {
        await runtime.runPromise(
          syncRepository({ id: 404_1, owner, repo }, [
            { name: "morning-brief", ...parseScheduleSource(SCHEDULE) },
          ]),
        );
        const existing = await runtime.runPromise(getSchedule(owner, repo, "morning-brief"));
        const { fail, run } = github({
          [`https://api.github.com/repos/${owner}/${repo}`]: repository(owner, repo),
          [`https://api.github.com/repos/${owner}/${repo}/contents/.agents/schedules?ref=main`]: [
            { name: "morning-brief.md", type: "file" },
          ],
          [`https://raw.githubusercontent.com/${owner}/${repo}/main/.agents/schedules/morning-brief.md`]:
            new Response("Download failed", { status }),
        });
        expect(await fail(() => refreshRepository(owner, repo))).toMatchObject({
          status: 502,
          message: expect.stringContaining("morning-brief.md"),
        });
        expect(await run(() => getSchedule(owner, repo, "morning-brief"))).toEqual(existing);
        expect(await run(() => getRepositories())).toContainEqual({ owner, repo });
      }
    } finally {
      await runtime.runPromise(
        Database.query((db) => db.delete(schedules).where(eq(schedules.owner, owner))),
      );
    }
  },
  60_000,
);

it("encodes special characters and slashes in a default branch", async () => {
  const branch = "feature/with#review";
  const { run } = github({
    "https://api.github.com/repos/acme/web": repository("acme", "web", { branch }),
    [`https://api.github.com/repos/acme/web/contents/.agents/schedules?ref=${encodeURIComponent(branch)}`]:
      [{ name: "morning-brief.md", type: "file" }],
    [`https://raw.githubusercontent.com/acme/web/${encodeURIComponent(branch)}/.agents/schedules/morning-brief.md`]:
      SCHEDULE,
  });
  const { files } = await run((api) => api.fetchRepositorySchedules("acme", "web"));
  expect(files[0]).toHaveProperty("schedule");
});

it("refuses oversized or potentially truncated listings rather than returning partial results", async () => {
  for (const entries of [
    Array.from({ length: 51 }, (_, i) => ({ name: `schedule-${i}.md`, type: "file" })),
    Array.from({ length: 1000 }, (_, i) => ({ name: `folder-${i}`, type: "dir" })),
  ]) {
    const { fail } = github({
      "https://api.github.com/repos/acme/web": repository("acme", "web"),
      "https://api.github.com/repos/acme/web/contents/.agents/schedules?ref=main": entries,
    });
    expect(await fail((api) => api.fetchRepositorySchedules("acme", "web"))).toMatchObject({
      status: 422,
    });
  }
});

it("cancels a streamed body as soon as its byte limit is exceeded", async () => {
  let reads = 0;
  let canceled = false;
  const stream = new ReadableStream(
    {
      pull(controller) {
        reads += 1;
        controller.enqueue(new TextEncoder().encode("é".repeat(25_001)));
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const { fail } = github({
    "https://raw.githubusercontent.com/acme/web/HEAD/.agents/schedules/large.md": new Response(
      stream,
    ),
  });
  expect(await fail((api) => api.fetchPublicSchedule("acme", "web", "large"))).toMatchObject({
    status: 422,
  });
  expect(canceled).toBe(true);
  expect(reads).toBe(2);
});

it("decodes UTF-8 split across streamed chunks at the exact byte limit", async () => {
  const bytes = new TextEncoder().encode("é".repeat(50_000));
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 3));
      controller.enqueue(bytes.slice(3));
      controller.close();
    },
  });
  const { run } = github({
    "https://raw.githubusercontent.com/acme/web/HEAD/.agents/schedules/exact.md": new Response(
      stream,
    ),
  });
  expect(await run((api) => api.fetchPublicSchedule("acme", "web", "exact"))).toBe(
    "é".repeat(50_000),
  );
});

it("treats a broken body stream as a temporary read failure", async () => {
  const { fail } = github({
    "https://api.github.com/repos/acme/web": repository("acme", "web"),
    "https://api.github.com/repos/acme/web/contents/.agents/schedules?ref=main": [
      { name: "broken.md", type: "file" },
    ],
    "https://raw.githubusercontent.com/acme/web/main/.agents/schedules/broken.md": new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("Disconnected"));
        },
      }),
    ),
  });
  expect(await fail((api) => api.fetchRepositorySchedules("acme", "web"))).toMatchObject({
    status: 502,
  });
});

DATABASE_TEST(
  "keeps existing listings when an oversized repository cannot be refreshed",
  async () => {
    const owner = "oversized-fixture";
    const repo = "tools";
    await runtime.runPromise(
      syncRepository({ id: 422_1, owner, repo }, [
        { name: "existing", ...parseScheduleSource(SCHEDULE) },
      ]),
    );
    const { fail, run } = github({
      [`https://api.github.com/repos/${owner}/${repo}`]: repository(owner, repo),
      [`https://api.github.com/repos/${owner}/${repo}/contents/.agents/schedules?ref=main`]:
        Array.from({ length: 51 }, (_, i) => ({ name: `schedule-${i}.md`, type: "file" })),
    });

    try {
      expect(await fail(() => refreshRepository(owner, repo))).toMatchObject({ status: 422 });
      expect(await run(() => getSchedule(owner, repo, "existing"))).toBeDefined();
    } finally {
      await runtime.runPromise(
        Database.query((db) => db.delete(schedules).where(eq(schedules.owner, owner))),
      );
    }
  },
  60_000,
);

DATABASE_TEST(
  "removes a repository GitHub no longer has",
  async () => {
    const owner = "gone-fixture";
    const repo = "tools";
    await runtime.runPromise(
      syncRepository({ id: 404_2, owner, repo }, [
        { name: "existing", ...parseScheduleSource(SCHEDULE) },
      ]),
    );
    const { fail, run } = github({});
    expect(await fail(() => refreshRepository(owner, repo))).toMatchObject({ status: 404 });
    expect(await run(() => getSchedule(owner, repo, "existing"))).toBeUndefined();
  },
  60_000,
);
