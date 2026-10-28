import { expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

it("returns 404 for malformed repository and schedule routes before database queries", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--eval",
      `
    import { expect, mock } from "bun:test";
    let queries = 0;
    const query = async () => { queries += 1; throw new Error("Unexpected database query"); };
    mock.module("@/server/runtime", () => ({ run: query }));
    mock.module("@/server/cached", () => ({ SCHEDULES_TAG: "schedules", cachedSchedule: query, cachedRepository: query }));
    mock.module("next/cache", () => ({ updateTag() {} }));
    mock.module("next/navigation", () => ({
      notFound() { throw new Error("404"); }, permanentRedirect() { throw new Error("Unexpected redirect"); }, usePathname: () => "/",
    }));
    const repository = await import("./src/app/[owner]/[repo]/page.tsx");
    const schedule = await import("./src/app/[owner]/[repo]/[name]/page.tsx");
    const valid = { owner: "acme", repo: "tools", name: "daily-review" };
    for (const page of [repository, schedule]) {
      const segments = page === repository ? ["owner", "repo"] : ["owner", "repo", "name"];
      for (const segment of segments) {
        for (const invalid of [String.fromCharCode(0), "", "..", "a/b", "a".repeat(201)]) {
          const props = { params: Promise.resolve({ ...valid, [segment]: invalid }) };
          await expect(page.generateMetadata(props)).rejects.toThrow("404");
          await expect(page.default(props)).rejects.toThrow("404");
        }
      }
    }
    expect(queries).toBe(0);
  `,
    ],
    { cwd: new URL("../../../../", import.meta.url), env: { ...process.env, NODE_ENV: "test" } },
  );
  expect(result.status, result.stderr?.toString()).toBe(0);
});
