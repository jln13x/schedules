import { z } from "zod";
import { listingOf } from "@/db/skills";
import { FIT_VALUES } from "@/lib/search-params";
import { SITE, skillPath } from "@/lib/site";
import { cachedSkills } from "@/server/cached";

const SEARCH_INPUT = z.object({
  q: z.string().max(200, "Search is limited to 200 characters").default(""),
  fit: z.enum(FIT_VALUES).optional(),
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
    const { q, fit, limit } = input.data;
    const rows = await cachedSkills({ query: q, limit, ...(fit ? { fit } : {}) });
    return Response.json(
      {
        schedules: rows.map(listingOf).map((skill) => ({
          owner: skill.owner,
          repo: skill.repo,
          name: skill.slug,
          displayName: skill.name,
          description: skill.description,
          installs: skill.installs,
          usefulness: skill.usefulness,
          schedule: { cron: skill.schedule.cron, label: skill.schedule.label },
          fits: skill.fits,
          url: `${SITE.origin}${skillPath(skill)}`,
        })),
      },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=600" } },
    );
  } catch {
    return Response.json({ error: "Search is temporarily unavailable" }, { status: 503 });
  }
}
