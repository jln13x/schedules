import { DocsPage } from "@/components/docs-page";
import { pageMetadata } from "@/lib/site";
import { DOC_PAGES } from "@/lib/docs";
export const metadata = pageMetadata({
  title: "Documentation",
  path: "/docs",
  description: DOC_PAGES.overview.description,
});
export default function DocumentationPage() {
  return <DocsPage slug="overview" />;
}
