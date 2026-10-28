import { DOC_PAGES } from "@/lib/docs";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Schedules documentation";

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = Object.hasOwn(DOC_PAGES, slug)
    ? DOC_PAGES[slug as keyof typeof DOC_PAGES]
    : DOC_PAGES.overview;
  return ogImage({ title: page.title, subtitle: page.description });
}
