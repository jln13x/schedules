import { suggestedSchedule } from "@/lib/cadence";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";
import { cachedSkill } from "@/server/cached";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Run this skill on a schedule with schedules.sh";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; skill: string }>;
}) {
  const { owner, repo, skill: slug } = await params;
  const skill = await cachedSkill(owner, repo, slug);
  const schedule = skill?.schedule ?? suggestedSchedule("weekly", "morning");
  return ogImage({
    title: `Run ${skill?.name ?? slug} on a schedule`,
    ...(skill && { subtitle: schedule.label }),
    command: `npx agent-schedules schedule ${slug} "${schedule.cron}"`,
    hour: schedule.hour,
  });
}
