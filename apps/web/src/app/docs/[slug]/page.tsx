import { notFound } from "next/navigation";
import { DocsPage } from "@/components/docs-page";
import { DOC_PAGES } from "@/lib/docs";
import { pageMetadata } from "@/lib/site";

function isDocSlug(slug: string): slug is keyof typeof DOC_PAGES {
  return slug !== "overview" && Object.hasOwn(DOC_PAGES, slug);
}
export function generateStaticParams() {
  return Object.keys(DOC_PAGES)
    .filter((slug) => slug !== "overview")
    .map((slug) => ({ slug }));
}
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isDocSlug(slug)) {
    return {};
  }

  return pageMetadata({
    title: DOC_PAGES[slug].title,
    path: `/docs/${slug}`,
    description: DOC_PAGES[slug].description,
  });
}
export default async function DocumentationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!isDocSlug(slug)) {
    notFound();
  }

  return <DocsPage slug={slug} />;
}
