import { env } from "@/env";
import { importSkills } from "@/lib/skill-import";
import { run } from "@/server/runtime";

export const maxDuration = 300;

// The top 20,000 skills on skills.sh each have at least a few hundred installs; below that the
// long tail is mostly forks and experiments. 600 skills an hour finishes the first pass in about
// a day and then keeps a weekly refetch well inside each run.
const OPTIONS = { pages: 40, perPage: 500, budget: 600 };

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(await run(importSkills(OPTIONS)));
}
