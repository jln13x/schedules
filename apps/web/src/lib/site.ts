import type { Metadata } from "next";

export const SITE = {
  name: "schedules.sh",
  title: "The Agent Schedules Directory",
  origin: "https://schedules.sh",
  description: "Agent skills worth running on a schedule, and how often.",
};
export const GITHUB_URL = "https://github.com/jln13x/schedules";

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

export function skillPath(skill: { owner: string; repo: string; slug: string }) {
  return `/${skill.owner}/${skill.repo}/${skill.slug}`;
}

const SKILLS_SH = "https://skills.sh";

export function skillsShUrl(skill: { owner: string; repo: string; slug: string }) {
  return `${SKILLS_SH}${skillPath(skill)}`;
}

export function githubUrl(repository: { owner: string; repo: string }) {
  return `https://github.com/${repository.owner}/${repository.repo}`;
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
