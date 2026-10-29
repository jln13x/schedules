import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { sponsorEntry } from "@/db";
import { listingOf } from "@/db/skills";
import { Landing } from "@/components/landing/landing";
import { Loading } from "@/components/loading";
import { SkillList } from "@/components/skill-list";
import type { SponsorEntry } from "@/components/sponsor-row";
import { loadSkillsParams } from "@/lib/search-params";
import { pageMetadata, SITE } from "@/lib/site";
import { cachedShowcase, cachedSkills, cachedSponsors } from "@/server/cached";

export const metadata = {
  ...pageMetadata({
    title: "The Agent Schedules Directory",
    path: "/",
    description: SITE.description,
  }),
  title: "The Agent Schedules Directory",
};
const LIST_LIMIT = 100;

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [showcase, sponsors] = await Promise.all([cachedShowcase(), cachedSponsors()]);
  const sponsorEntries = sponsors.map(sponsorEntry);
  return (
    <Landing
      showcase={showcase}
      skills={
        // The search and filter come from the URL, so this part renders per request; the rest is static.
        <Suspense fallback={<Loading label="Loading skills" />}>
          <SkillsSection searchParams={searchParams} sponsors={sponsorEntries} />
        </Suspense>
      }
    />
  );
}

async function SkillsSection({
  searchParams,
  sponsors,
}: {
  searchParams: Promise<SearchParams>;
  sponsors: SponsorEntry[];
}) {
  const { q, fit } = await loadSkillsParams(searchParams);
  const rows = await cachedSkills({ query: q, ...(fit ? { fit } : {}), limit: LIST_LIMIT + 1 });
  return (
    <SkillList
      skills={rows.slice(0, LIST_LIMIT).map(listingOf)}
      truncated={rows.length > LIST_LIMIT}
      sponsors={sponsors}
    />
  );
}
