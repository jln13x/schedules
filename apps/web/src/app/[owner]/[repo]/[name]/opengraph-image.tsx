import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";
import { cachedSchedule } from "@/server/cached";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Agent schedule on schedules.sh";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; name: string }>;
}) {
  const { owner, repo, name } = await params;
  const schedule = await cachedSchedule(owner, repo, name);
  return ogImage({
    title: schedule?.displayName ?? name,
    command: `npx agent-schedules add ${owner}/${repo}/${name}`,
    ...(schedule && { hour: Number(schedule.cron.split(" ")[1]) }),
  });
}
