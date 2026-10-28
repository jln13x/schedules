import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Agent schedules from a GitHub repository on schedules.sh";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return ogImage({
    title: `${owner}/${repo}`,
    command: `npx agent-schedules add ${owner}/${repo}`,
  });
}
