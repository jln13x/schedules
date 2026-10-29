import { notFound } from "next/navigation";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { FitBadges } from "@/components/fit-badges";
import { Hint } from "@/components/hint";
import { JsonLd } from "@/components/json-ld";
import { formatWhen, REPOSITORY_SEGMENT, SCHEDULE_SLUG } from "@/db/format";
import { SkillCommands } from "@/components/skill-commands";
import { CADENCES } from "@/lib/cadence";
import { compactNumber, githubUrl, pageMetadata, SITE, skillPath, skillsShUrl } from "@/lib/site";
import { cachedSkill } from "@/server/cached";

interface SkillPageProps {
  params: Promise<{ owner: string; repo: string; skill: string }>;
}

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
      <div className="mt-4">
        <FitBadges fits={skill.fits} hint />
      </div>
      {skill.description && (
        <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-7">
          {skill.description}
        </p>
      )}
      <p className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-muted-foreground font-mono text-xs tracking-wider">SUGGESTED</span>
        <span className="text-xl font-semibold tracking-tight sm:text-2xl">
          {formatWhen(cadence.cron)}
        </span>
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-xs">
          {cadence.cron}
          <Hint label={`Cron ${cadence.cron}, local time`}>
            Cron expression, in your local time. Change it in the command below.
          </Hint>
        </span>
      </p>
      <div className="mt-12 grid gap-12 md:grid-cols-[minmax(0,1fr)_200px] md:gap-16">
        <div className="min-w-0">
          <SkillCommands skill={skill} cron={cadence.cron} />
          <p className="text-muted-foreground mt-6 text-sm">
            Read the skill on{" "}
            <a href={skillsShUrl(skill)} className="underline decoration-dotted underline-offset-4">
              skills.sh
            </a>{" "}
            or in the{" "}
            <a href={githubUrl(skill)} className="underline decoration-dotted underline-offset-4">
              source repository
            </a>{" "}
            before scheduling it.
          </p>
        </div>
        <aside
          aria-label="Skill details"
          className="flex flex-wrap gap-x-12 gap-y-9 md:flex-col md:gap-12"
        >
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              Installs
              <Hint label="Install counts come from skills.sh">Counted by skills.sh</Hint>
            </h2>
            <p className="mt-3 font-mono text-3xl font-semibold">{compactNumber(skill.installs)}</p>
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
