import type { Metadata } from "next";

export const SITE = {
  name: "schedules.sh",
  title: "Put your agent on a schedule",
  origin: "https://schedules.sh",
  description:
    "Put your agent on a schedule: skills from skills.sh worth running on a timer, shared between Claude Code, Codex, T3 Code and your team.",
};
/** The site's share image, for pages without an opengraph-image file of their own. */
const DEFAULT_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: SITE.title };
export const GITHUB_URL = "https://github.com/jln13x/schedules";

export const SITE_METADATA: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: SITE.title, template: `%s - ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  ...social({ title: SITE.title, description: SITE.description, ownImage: true }),
};

/**
 * Next replaces nested objects such as `openGraph` instead of merging them with the layout's, so
 * every page rebuilds the full social metadata.
 */
export function pageMetadata(page: {
  title: string;
  path: string;
  description: string;
  /** The page has its own opengraph-image file, which naming an image here would replace. */
  ownImage?: boolean;
}) {
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
  ownImage = false,
}: {
  title: string;
  description: string;
  path?: string;
  ownImage?: boolean;
}) {
  const images = ownImage ? {} : { images: [DEFAULT_IMAGE] };
  return {
    openGraph: {
      type: "website",
      siteName: SITE.name,
      title,
      description,
      ...images,
      ...(path ? { url: path } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...images,
      creator: "@jlndev",
    },
  } satisfies Metadata;
}

/**
 * A description that fits a search result: up to about 155 characters, cut at a word rather than
 * in one, with an ellipsis when cut.
 */
export function snippet(text: string, limit = 155) {
  const clean = text.replace(/\s+/g, " ").trim();

  if (clean.length <= limit) {
    return clean;
  }

  const cut = clean.slice(0, limit - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > limit / 2 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:.-]+$/, "")}…`;
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
