import { DOC_PAGES } from "@/lib/docs";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Schedules documentation";

export default function OpenGraphImage() {
  return ogImage({ title: DOC_PAGES.overview.title, subtitle: DOC_PAGES.overview.description });
}
