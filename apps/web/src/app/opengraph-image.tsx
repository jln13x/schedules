import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";
import { SITE } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = SITE.title;

export default function OpenGraphImage() {
  return ogImage({
    title: SITE.title,
    subtitle: "Share it between harnesses and your team.",
    command: "npx agent-schedules add <owner/repo/skill>",
    hour: 8,
  });
}
