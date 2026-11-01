import { Schema } from "effect";

const SITE_URL = process.env.AGENT_SCHEDULES_URL ?? "https://schedules.sh";
const MAX_API_BYTES = 1_000_000;

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

const SEARCH_TIMEOUT_MS = 10_000;
const searchResultSchema = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  name: Schema.String,
  displayName: Schema.String,
  installs: Schema.Number,
  schedule: Schema.Struct({ cron: Schema.String, label: Schema.String }),
});
// The site has listed skills under this key since it listed repository schedules.
const searchSchema = Schema.Struct({ schedules: Schema.Array(searchResultSchema) });

export type SearchResult = typeof searchResultSchema.Type;

export async function searchSkills(query: string): Promise<ReadonlyArray<SearchResult>> {
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

/** One line per skill: where it comes from, its installs, and the schedule the site suggests. */
export function formatSearchResults(results: ReadonlyArray<SearchResult>): string {
  const columns = results.map((result) => [
    display(`${result.owner}/${result.repo}/${result.name}`),
    `${result.installs} installs`,
    display(`${result.schedule.label}  ${result.schedule.cron}`),
  ]);
  const widths = [0, 1].map((column) =>
    Math.max(...columns.map((row) => row[column]?.length ?? 0)),
  );
  return columns
    .map(([source = "", installs = "", schedule = ""]) =>
      [source.padEnd(widths[0] ?? 0), installs.padStart(widths[1] ?? 0), schedule].join("  "),
    )
    .join("\n");
}
