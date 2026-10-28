import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";
import { leaderboardEntry, sponsorEntry } from "@/db";
import { Landing } from "@/components/landing/landing";
import { Leaderboard } from "@/components/leaderboard";
import { Loading } from "@/components/loading";
import type { SponsorEntry } from "@/components/sponsor-row";
import { loadLeaderboardParams } from "@/lib/search-params";
import { pageMetadata, SITE } from "@/lib/site";
import { cachedLeaderboard, cachedShowcase, cachedSponsors } from "@/server/cached";

export const metadata = {
  ...pageMetadata({
    title: "The Agent Schedules Directory",
    path: "/",
    description: SITE.description,
  }),
  title: "The Agent Schedules Directory",
};
const LEADERBOARD_LIMIT = 100;

export default async function HomePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [showcase, sponsors] = await Promise.all([cachedShowcase(), cachedSponsors()]);
  const sponsorEntries = sponsors.map(sponsorEntry);
  return (
    <Landing
      showcase={showcase}
      leaderboard={
        // The search query comes from the URL, so this part renders per request; the rest is static.
        <Suspense fallback={<Loading label="Loading schedules" />}>
          <LeaderboardSection searchParams={searchParams} sponsors={sponsorEntries} />
        </Suspense>
      }
    />
  );
}

async function LeaderboardSection({
  searchParams,
  sponsors,
}: {
  searchParams: Promise<SearchParams>;
  sponsors: SponsorEntry[];
}) {
  const { q, period } = await loadLeaderboardParams(searchParams);
  const rows = await cachedLeaderboard({ query: q, period, limit: LEADERBOARD_LIMIT + 1 });
  return (
    <Leaderboard
      schedules={rows.slice(0, LEADERBOARD_LIMIT).map(leaderboardEntry)}
      truncated={rows.length > LEADERBOARD_LIMIT}
      sponsors={sponsors}
    />
  );
}
