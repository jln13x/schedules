import type { Metadata } from "next";

export const SITE = {
  name: "schedules.sh",
  title: "The Agent Schedules Directory",
  origin: "https://schedules.sh",
  description: "Discover and install schedules for AI coding agents.",
};
export const GITHUB_URL = "https://github.com/jln13x/schedules";

export const RESERVED_OWNERS: readonly string[] = [
  "docs",
  "sponsor",
  "submit",
  "privacy",
  "terms",
  "api",
  "llms.txt",
  "sitemap.xml",
  "robots.txt",
  "opengraph-image",
  "u",
  "_next",
];

export const SITE_METADATA: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: SITE.title, template: `%s - ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  ...social({ title: SITE.title, description: SITE.description }),
};

/**
 * Next replaces nested objects such as `openGraph` instead of merging them with the layout's, so
 * every page rebuilds the full social metadata.
 */
export function pageMetadata(page: { title: string; path: string; description: string }) {
  return {
    // Absolute, because a layout's title template skips pages in its own segment, like the homepage.
    title: { absolute: `${page.title} - ${SITE.name}` },
    description: page.description,
    alternates: { canonical: page.path },
    ...social(page),
  } satisfies Metadata;
}

function social({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path?: string;
}) {
  return {
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title,
      description,
      ...(path ? { url: path } : {}),
    },
    twitter: { card: "summary_large_image", title, description },
  } satisfies Metadata;
}

export function repositoryPath(repository: { owner: string; repo: string }) {
  return `/${repository.owner}/${repository.repo}`;
}

export function schedulePath(schedule: { owner: string; repo: string; name: string }) {
  return `${repositoryPath(schedule)}/${schedule.name}`;
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
