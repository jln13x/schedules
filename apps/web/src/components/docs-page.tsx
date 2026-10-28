import Link from "next/link";
import { DOC_PAGES } from "@/lib/docs";
import { Prose } from "@/components/prose";
import { cn } from "cn";

export function DocsPage({ slug }: { slug: keyof typeof DOC_PAGES }) {
  const page = DOC_PAGES[slug];
  return (
    <div className="grid gap-10 md:grid-cols-[180px_minmax(0,1fr)] md:gap-12">
      <nav
        aria-label="Documentation"
        className="flex flex-wrap gap-1 self-start md:sticky md:top-8 md:flex-col"
      >
        {Object.entries(DOC_PAGES).map(([key, value]) => (
          <Link
            key={key}
            href={key === "overview" ? "/docs" : `/docs/${key}`}
            aria-current={key === slug ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:text-foreground rounded-md px-3 py-2.5 text-sm",
              key === slug && "bg-secondary text-foreground",
            )}
          >
            {key === "overview"
              ? "Overview"
              : value.title === "File format"
                ? "Format"
                : value.title}
          </Link>
        ))}
      </nav>
      <article className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">
          {slug === "overview" ? "Documentation" : page.title}
        </h1>
        <p className="text-muted-foreground mt-3 mb-9 text-sm leading-6">{page.description}</p>
        <Prose>{page.content}</Prose>
      </article>
    </div>
  );
}
