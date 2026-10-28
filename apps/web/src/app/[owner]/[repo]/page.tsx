import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { leaderboardEntry, resolveRepository } from "@/db";
import { REPOSITORY_SEGMENT } from "@/db/format";
import { ScheduleTable } from "@/components/leaderboard";
import { pageMetadata, repositoryPath } from "@/lib/site";
import { cachedRepository } from "@/server/cached";
import { run } from "@/server/runtime";
import { SyncButton } from "./sync-button";

const CHECKED_AT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

interface RepositoryPageProps {
  params: Promise<{ owner: string; repo: string }>;
}
export async function generateMetadata({ params }: RepositoryPageProps) {
  const { owner, repo } = validParams(await params);
  return pageMetadata({
    title: `${owner}/${repo}`,
    path: `/${owner}/${repo}`,
    description: `Discover recurring agent schedules from ${owner}/${repo}.`,
  });
}
export default async function RepositoryPage({ params }: RepositoryPageProps) {
  const { owner, repo } = validParams(await params);
  const schedules = await cachedRepository(owner, repo);

  if (schedules.length === 0) {
    const current = await run(resolveRepository({ owner, repo }));

    if (current && (current.owner !== owner || current.repo !== repo)) {
      permanentRedirect(repositoryPath(current));
    }

    notFound();
  }

  return (
    <>
      <Link href="/" className="text-muted-foreground font-mono text-xs">
        All schedules
      </Link>
      <div className="mt-2 mb-4 flex items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {owner}/{repo}
        </h1>
        <SyncButton owner={owner} repo={repo} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <a
          href={`https://github.com/${owner}/${repo}`}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          View on GitHub
        </a>
        <span className="text-muted-foreground font-mono text-xs">
          Last checked{" "}
          {CHECKED_AT.format(Math.max(...schedules.map((entry) => entry.fetchedAt.getTime())))} UTC
        </span>
      </div>
      <div className="mt-10">
        <ScheduleTable rows={schedules.map(leaderboardEntry)} showRepository={false} />
      </div>
    </>
  );
}

function validParams(params: Awaited<RepositoryPageProps["params"]>) {
  if (
    !REPOSITORY_SEGMENT.safeParse(params.owner).success ||
    !REPOSITORY_SEGMENT.safeParse(params.repo).success
  ) {
    notFound();
  }

  return params;
}
