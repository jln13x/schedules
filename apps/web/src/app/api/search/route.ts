import { z } from "zod";
import { PERIODS } from "@/lib/search-params";
import { schedulePath, SITE } from "@/lib/site";
import { cachedLeaderboard } from "@/server/cached";

const SEARCH_INPUT = z.object({
  q: z.string().max(200, "Search is limited to 200 characters").default(""),
  period: z.enum(PERIODS).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  const input = SEARCH_INPUT.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!input.success) {
    return Response.json({ error: z.prettifyError(input.error) }, { status: 422 });
  }

  try {
    const rows = await cachedLeaderboard({ query: input.data.q, ...input.data });
    return Response.json(
      {
        schedules: rows.map((row) => ({
          owner: row.owner,
          repo: row.repo,
          name: row.name,
          displayName: row.displayName,
          description: row.description,
          installs: row.installs,
          trendingInstalls: row.trendingInstalls,
          url: `${SITE.origin}${schedulePath(row)}`,
        })),
      },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch {
    return Response.json({ error: "Search is temporarily unavailable" }, { status: 503 });
  }
}
