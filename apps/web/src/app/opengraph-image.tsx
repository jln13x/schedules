import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";
import { SITE } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = SITE.title;

export default function OpenGraphImage() {
  return ogImage({
    title: "every day at 8, run a security audit",
    subtitle: "Recurring tasks for AI coding agents",
    prompt: true,
    hour: 8,
  });
}
