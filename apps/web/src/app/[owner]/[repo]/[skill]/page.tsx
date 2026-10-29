import { notFound } from "next/navigation";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { JsonLd } from "@/components/json-ld";
import { formatWhen, REPOSITORY_SEGMENT, SCHEDULE_SLUG } from "@/db/format";
import { SkillCommands } from "@/components/skill-commands";
import { CADENCES, FITS } from "@/lib/cadence";
import { compactNumber, githubUrl, pageMetadata, SITE, skillPath, skillsShUrl } from "@/lib/site";
import { cachedSkill } from "@/server/cached";

interface SkillPageProps {
  params: Promise<{ owner: string; repo: string; skill: string }>;
}

const AUDIT_LABELS = { pass: "Passed", warn: "Passed with warnings" } as const;

export async function generateMetadata({ params }: SkillPageProps) {
  const { owner, repo, slug } = validParams(await params);
  const skill = await cachedSkill(owner, repo, slug);

  if (!skill) {
    return {};
  }

  return pageMetadata({
    title: `Run ${skill.name} on a schedule`,
    path: skillPath(skill),
    description: skill.description.slice(0, 160),
  });
}

export default async function SkillPage({ params }: SkillPageProps) {
  const { owner, repo, slug } = validParams(await params);
  const skill = await cachedSkill(owner, repo, slug);

  if (!skill) {
    notFound();
  }

  const cadence = CADENCES[skill.cadence];
  const fits = (Object.keys(FITS) as Array<keyof typeof FITS>).filter((fit) => skill.fits[fit]);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Skills", item: SITE.origin },
            {
              "@type": "ListItem",
              position: 2,
              name: `${owner}/${repo}`,
              item: githubUrl(skill),
            },
            {
              "@type": "ListItem",
              position: 3,
              name: skill.name,
              item: `${SITE.origin}${skillPath(skill)}`,
            },
          ],
        }}
      />
      <a
        href={githubUrl(skill)}
        className="text-muted-foreground hover:text-foreground font-mono text-xs"
      >
        {owner}/{repo}
      </a>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Run {skill.name} on a schedule
      </h1>
      {skill.description && (
        <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
          {skill.description}
        </p>
      )}
      <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-sm">
        Suggested: {formatWhen(cadence.cron)}
        <span className="group relative inline-flex">
          <button
            type="button"
            aria-label={`Cron ${cadence.cron}, local time`}
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
            {cadence.cron} - local time
          </span>
        </span>
      </p>
      <div className="mt-14 grid gap-12 md:grid-cols-[minmax(0,1fr)_200px] md:gap-16">
        <div className="min-w-0">
          <SkillCommands skill={skill} cron={cadence.cron} />
          <section className="mt-12">
            <h2 className="border-border text-muted-foreground mb-3 border-b pb-4 text-sm font-medium">
              Why schedule it
            </h2>
            <p className="text-sm leading-7">
              {fits.length === 2
                ? "It works both ways: each person can run it for their own work, or one run can serve the whole team."
                : fits[0] === "team"
                  ? "One run serves the whole team. If everyone scheduled it separately, the runs would repeat the same work on shared things."
                  : fits[0] === "you"
                    ? "Each person who schedules it gets a result of their own, about their own work and accounts."
                    : "It does useful work on a timer, though whether one person or the whole team should run it depends on how you point it."}{" "}
              The full instructions are on{" "}
              <a
                href={skillsShUrl(skill)}
                className="underline decoration-dotted underline-offset-4"
              >
                skills.sh
              </a>{" "}
              and in the{" "}
              <a href={githubUrl(skill)} className="underline decoration-dotted underline-offset-4">
                source repository
              </a>
              .
            </p>
          </section>
        </div>
        <aside
          aria-label="Skill details"
          className="flex flex-wrap gap-x-12 gap-y-9 md:flex-col md:gap-12"
        >
          <div>
            <h2 className="text-sm font-medium">Worth scheduling</h2>
            <p className="mt-3 font-mono text-3xl font-semibold">
              {skill.usefulness}
              <span className="text-muted-foreground text-base font-normal">/100</span>
            </p>
          </div>
          <div>
            <h2 className="text-sm font-medium">Who runs it</h2>
            <p className="text-muted-foreground mt-3 text-sm">
              {fits.length > 0 ? fits.map((fit) => FITS[fit].label).join(" and ") : "Either"}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-medium">Installs on skills.sh</h2>
            <p className="mt-3 font-mono text-xl font-semibold">{compactNumber(skill.installs)}</p>
          </div>
          <div>
            <h2 className="text-sm font-medium">Author</h2>
            <a
              href={`https://github.com/${owner}`}
              className="text-muted-foreground hover:text-foreground mt-3 block font-mono text-xs break-all"
            >
              {owner}
            </a>
          </div>
          <div>
            <h2 className="text-sm font-medium">Security audit</h2>
            <p className="text-muted-foreground mt-3 text-xs">
              {skill.audit === "pass" || skill.audit === "warn"
                ? AUDIT_LABELS[skill.audit]
                : "Not audited yet"}
              {skill.audit && (
                <>
                  {" "}
                  <a href={skillsShUrl(skill)} className="underline decoration-dotted">
                    on skills.sh
                  </a>
                </>
              )}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-medium">First seen</h2>
            <p className="text-muted-foreground mt-3 font-mono text-xs">
              {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
                skill.firstSeenAt,
              )}
            </p>
          </div>
          <FeedbackDialog kind="report" className="text-muted-foreground w-fit text-xs underline" />
        </aside>
      </div>
    </>
  );
}

function validParams(params: Awaited<SkillPageProps["params"]>) {
  if (
    !REPOSITORY_SEGMENT.safeParse(params.owner).success ||
    !REPOSITORY_SEGMENT.safeParse(params.repo).success ||
    !SCHEDULE_SLUG.safeParse(params.skill).success
  ) {
    notFound();
  }

  return { owner: params.owner, repo: params.repo, slug: params.skill };
}
