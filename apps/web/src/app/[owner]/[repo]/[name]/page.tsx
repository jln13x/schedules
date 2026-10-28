import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { JsonLd } from "@/components/json-ld";
import { resolveRepository } from "@/db";
import { formatWhen, REPOSITORY_SEGMENT, SCHEDULE_SLUG, scheduleFile } from "@/db/format";
import { InstallChart } from "@/components/install-chart";
import { InstallCommand } from "@/components/install-command";
import { Panel } from "@/components/panel";
import { Prose } from "@/components/prose";
import { ScheduleFile } from "@/components/schedule-file";
import { compactNumber, pageMetadata, repositoryPath, schedulePath, SITE } from "@/lib/site";
import { cachedRepository, cachedSchedule } from "@/server/cached";
import { run } from "@/server/runtime";

interface SchedulePageProps {
  params: Promise<{ owner: string; repo: string; name: string }>;
}

export async function generateMetadata({ params }: SchedulePageProps) {
  const { owner, repo, name } = validParams(await params);
  const schedule = await cachedSchedule(owner, repo, name);

  if (!schedule) {
    return {};
  }

  return pageMetadata({
    title: schedule.displayName,
    path: schedulePath(schedule),
    description: schedule.description.slice(0, 160),
  });
}

export default async function SchedulePage({ params }: SchedulePageProps) {
  const { owner, repo, name } = validParams(await params);
  const [schedule, repository] = await Promise.all([
    cachedSchedule(owner, repo, name),
    cachedRepository(owner, repo),
  ]);

  if (!schedule) {
    const current = await run(resolveRepository({ owner, repo }));

    if (current && (current.owner !== owner || current.repo !== repo)) {
      permanentRedirect(schedulePath({ ...current, name }));
    }

    notFound();
  }

  const siblings = repository.filter((entry) => entry.name !== name);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Schedules", item: SITE.origin },
            {
              "@type": "ListItem",
              position: 2,
              name: `${owner}/${repo}`,
              item: `${SITE.origin}/${owner}/${repo}`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: schedule.displayName,
              item: `${SITE.origin}${schedulePath(schedule)}`,
            },
          ],
        }}
      />
      <Link
        href={repositoryPath(schedule)}
        className="text-muted-foreground hover:text-foreground font-mono text-xs"
      >
        {owner}/{repo}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        {schedule.displayName}
      </h1>
      <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm">
        {formatWhen(schedule.cron)}
        <span className="group relative inline-flex">
          <button
            type="button"
            aria-label={`Cron ${schedule.cron}, local time`}
            className="hover:text-foreground focus-visible:text-foreground focus-visible:ring-ring rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </button>
          <span
            aria-hidden="true"
            className="border-border bg-popover text-foreground pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md border px-2 py-1 font-mono text-xs whitespace-nowrap opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          >
            {schedule.cron} - local time
          </span>
        </span>
      </p>
      <div className="mt-14 grid gap-12 md:grid-cols-[minmax(0,1fr)_200px] md:gap-16">
        <div className="min-w-0">
          <InstallCommand source={`${owner}/${repo}/${name}`} />
          <div className="mt-10">
            <ScheduleFile source={scheduleFile(schedule)}>
              <Panel className="p-6">
                <Prose className="[&_:is(p,li)]:text-foreground [&_:is(p,li)]:text-base [&_:is(p,li)]:leading-7 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
                  <ReactMarkdown
                    skipHtml
                    disallowedElements={["img"]}
                    unwrapDisallowed
                    components={{ h1: "h2" }}
                  >
                    {schedule.prompt}
                  </ReactMarkdown>
                </Prose>
              </Panel>
            </ScheduleFile>
          </div>
          {siblings.length > 0 && (
            <section className="mt-16">
              <h2 className="border-border text-muted-foreground mb-3 border-b pb-4 text-sm font-medium">
                More from{" "}
                <Link
                  href={repositoryPath(schedule)}
                  className="hover:text-foreground underline decoration-dotted underline-offset-4"
                >
                  {owner}/{repo}
                </Link>
              </h2>
              {siblings.map((entry) => (
                <Link
                  key={entry.id}
                  href={schedulePath(entry)}
                  className="border-border text-muted-foreground hover:text-foreground flex items-baseline justify-between gap-5 border-b py-3 text-sm transition-colors"
                >
                  <span>{entry.name}</span>
                  <span className="hidden font-mono text-xs sm:block">
                    {formatWhen(entry.cron)}
                  </span>
                </Link>
              ))}
            </section>
          )}
        </div>
        <aside
          aria-label="Schedule details"
          className="flex flex-wrap gap-x-12 gap-y-9 md:flex-col md:gap-12"
        >
          <div className="w-full">
            <h2 className="text-sm font-medium">Installs</h2>
            <p className="mt-3 font-mono text-3xl font-semibold">
              {compactNumber(schedule.installs)}
            </p>
            <div className="mt-4">
              <InstallChart days={dailyInstalls(schedule.history)} />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-medium">Repository</h2>
            <Link
              href={repositoryPath(schedule)}
              className="text-muted-foreground hover:text-foreground mt-3 block font-mono text-xs break-all"
            >
              {owner}/{repo}
            </Link>
          </div>
          <div>
            <h2 className="text-sm font-medium">First seen</h2>
            <p className="text-muted-foreground mt-3 font-mono text-xs">
              {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
                schedule.firstSeenAt,
              )}
            </p>
          </div>
          <FeedbackDialog kind="report" className="text-muted-foreground w-fit text-xs underline" />
        </aside>
      </div>
    </>
  );
}

const DAY_LABEL = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function validParams(params: Awaited<SchedulePageProps["params"]>) {
  if (
    !REPOSITORY_SEGMENT.safeParse(params.owner).success ||
    !REPOSITORY_SEGMENT.safeParse(params.repo).success ||
    !SCHEDULE_SLUG.safeParse(params.name).success
  ) {
    notFound();
  }

  return params;
}

function dailyInstalls(history: number[]) {
  const today = Date.now();
  return history.map((installs, index) => ({
    day: DAY_LABEL.format(today - (history.length - 1 - index) * 24 * 60 * 60 * 1000),
    installs,
  }));
}
