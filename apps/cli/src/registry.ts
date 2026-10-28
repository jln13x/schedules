import { Schema } from "effect";
import { type Schedule, parseSchedule, slug } from "./schedule.ts";

const SITE_URL = process.env.AGENT_SCHEDULES_URL ?? "https://schedules.sh";
const GITHUB_API = process.env.GITHUB_API_URL ?? "https://api.github.com";
const TELEMETRY_TIMEOUT_MS = 3_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_SCHEDULE_BYTES = 100_000;
const MAX_API_BYTES = 1_000_000;
const MAX_FILES = 50;

const display = (value: string) =>
  value.replace(/\p{Cc}/gu, (character) =>
    character === "\n" || character === "\t" ? character : "",
  );
const displayError = (error: unknown) =>
  new Error(display(error instanceof Error ? error.message : String(error)));

async function readBody(response: Response, limit: number): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return text + decoder.decode();
      }

      bytes += value.byteLength;

      if (bytes > limit) {
        await reader.cancel();
        throw new Error(`Response exceeds ${limit} bytes`);
      }

      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function mapConcurrent<T, R>(
  values: ReadonlyArray<T>,
  concurrency: number,
  f: (value: T) => Promise<R>,
): Promise<Array<R>> {
  const entries = values.entries();
  const results: Array<R> = [];
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (const [index, value] of entries) {
        if (failed) {
          return;
        }

        try {
          results[index] = await f(value);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  return results;
}

export interface Source {
  readonly owner: string;
  readonly repo: string;
  readonly name?: string;
}

export function parseSource(value: string): Source {
  const source = value.trim();

  if (!/^[\w.-]+\/[\w.-]+(\/[^/]+)?$/.test(source)) {
    throw new Error(`Expected owner/repo or owner/repo/name, got "${display(value)}"`);
  }

  const [owner = "", repo = "", name] = source.split("/");
  return { owner, repo, ...(name ? { name } : {}) };
}

const repoSchema = Schema.Struct({
  private: Schema.Boolean,
  default_branch: Schema.String,
  owner: Schema.Struct({ login: Schema.String }),
  name: Schema.String,
});
const entrySchema = Schema.Struct({
  name: Schema.String,
});

async function github<T>(path: string, schema: Schema.Decoder<T>): Promise<T> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const request = (url: string) =>
    fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "manual",
      headers: {
        accept: "application/vnd.github+json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  let response = await request(`${GITHUB_API}${path}`);
  const location = response.headers.get("location");

  // A renamed repository answers with a redirect to its id. The token goes nowhere but GitHub.
  if (response.status === 301 && location?.startsWith(`${GITHUB_API}/`)) {
    response = await request(location);
  }

  if (response.status === 404) {
    throw new Error(`GitHub has no ${path}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub ${path} failed (${response.status})`);
  }

  return Schema.decodeUnknownSync(schema)(JSON.parse(await readBody(response, MAX_API_BYTES)));
}

export interface Fetched {
  readonly schedules: ReadonlyArray<Schedule>;
  readonly isPublic: boolean;
  /** The source under the repository's current name, which a rename on GitHub may have changed. */
  readonly source: Source;
}

export async function fetchSchedules(requested: Source): Promise<Fetched> {
  try {
    if (
      [requested.owner, requested.repo].some(
        (part) => !/^[\w.-]+$/.test(part) || part === "." || part === "..",
      )
    ) {
      throw new Error("Expected a GitHub owner and repository name");
    }

    const repository = await github(`/repos/${requested.owner}/${requested.repo}`, repoSchema);
    const { name } = requested;
    const owner = repository.owner.login;
    const repo = repository.name;
    const entries = await github(
      `/repos/${owner}/${repo}/contents/.agents/schedules?ref=${encodeURIComponent(repository.default_branch)}`,
      Schema.Array(entrySchema),
    );
    const wanted = name ? slug(name) : undefined;
    const files = entries.filter((entry) => /^[\w.-]+\.md$/.test(entry.name));

    if (files.length > MAX_FILES || entries.length >= 1000) {
      throw new Error(`${owner}/${repo} has too many schedule files to download safely`);
    }

    const selected = files.filter((entry) => wanted === undefined || entry.name === `${wanted}.md`);

    if (selected.length === 0) {
      throw new Error(
        wanted
          ? `${owner}/${repo} has no schedule named ${wanted}`
          : `${owner}/${repo} has no schedules in .agents/schedules`,
      );
    }

    const schedules = await mapConcurrent(selected, 4, async (entry) => {
      const response = await fetch(
        `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(repository.default_branch)}/.agents/schedules/${encodeURIComponent(entry.name)}`,
        { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "error" },
      );

      if (!response.ok) {
        throw new Error(`Could not download ${entry.name} (${response.status})`);
      }

      return parseSchedule(
        await readBody(response, MAX_SCHEDULE_BYTES),
        `${owner}/${repo}/${entry.name}`,
      );
    });
    return {
      schedules,
      isPublic: !repository.private,
      source: { owner, repo, ...(name ? { name } : {}) },
    };
  } catch (error) {
    throw displayError(error);
  }
}

const SEARCH_TIMEOUT_MS = 10_000;
const searchResultSchema = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  name: Schema.String,
  displayName: Schema.String,
  installs: Schema.Number,
});
const searchSchema = Schema.Struct({ schedules: Schema.Array(searchResultSchema) });

export type SearchResult = typeof searchResultSchema.Type;

export async function searchSchedules(query: string): Promise<ReadonlyArray<SearchResult>> {
  try {
    const response = await fetch(`${SITE_URL}/api/search?${new URLSearchParams({ q: query })}`, {
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Search failed (${response.status})`);
    }

    return Schema.decodeUnknownSync(searchSchema)(
      JSON.parse(await readBody(response, MAX_API_BYTES)),
    ).schedules;
  } catch (error) {
    throw displayError(error);
  }
}

export function formatSearchResults(results: ReadonlyArray<SearchResult>): string {
  const sources = results.map(({ owner, repo, name }) => display(`${owner}/${repo}/${name}`));
  const sourceWidth = Math.max(...sources.map((source) => source.length));
  const installWidth = Math.max(...results.map(({ installs }) => String(installs).length));
  return results
    .map(
      (result, index) =>
        `${(sources[index] ?? "").padEnd(sourceWidth)}  ${String(result.installs).padStart(installWidth)} installs  ${display(result.displayName)}`,
    )
    .join("\n");
}

export async function reportInstall(source: Source, name: string): Promise<void> {
  if (process.env.DO_NOT_TRACK) {
    return;
  }

  await fetch(`${SITE_URL}/api/installs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner: source.owner, repo: source.repo, name: slug(name) }),
    signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
  }).catch(() => undefined);
}
