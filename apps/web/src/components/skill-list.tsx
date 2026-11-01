"use client";

import Link from "next/link";
import { debounce, defaultRateLimit, useQueryState } from "nuqs";
import { useTransition } from "react";
import { FitBadges } from "@/components/fit-badges";
import { Hint } from "@/components/hint";
import { type Fit, FITS, type SuggestedSchedule } from "@/lib/cadence";
import { SKILLS_PARAMS } from "@/lib/search-params";
import { compactNumber, skillPath } from "@/lib/site";
import { type SponsorEntry, SponsorRow } from "@/components/sponsor-row";

export interface SkillEntry {
  id: string;
  owner: string;
  repo: string;
  slug: string;
  name: string;
  installs: number;
  usefulness: number;
  schedule: SuggestedSchedule;
  fits: Record<Fit, boolean>;
}

const SEARCH_DEBOUNCE_MS = 250;
const NO_SPONSORS: SponsorEntry[] = [];

export function SkillList({
  skills,
  truncated = false,
  sponsors = NO_SPONSORS,
}: {
  skills: SkillEntry[];
  truncated?: boolean;
  sponsors?: SponsorEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const options = { shallow: false, startTransition };
  const [query, setQuery] = useQueryState("q", SKILLS_PARAMS.q.withOptions(options));
  const [fit, setFit] = useQueryState("fit", SKILLS_PARAMS.fit.withOptions(options));
  return (
    <div>
      <label htmlFor="skill-search" className="sr-only">
        Search skills
      </label>
      <input
        id="skill-search"
        type="search"
        placeholder="Search skills..."
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          void setQuery(value || null, {
            limitUrlUpdates: value ? debounce(SEARCH_DEBOUNCE_MS) : defaultRateLimit,
          });
        }}
        className="placeholder:text-muted-foreground focus-visible:border-foreground mt-5 h-12 w-full border-b bg-transparent font-mono text-sm outline-none"
      />
      <div role="tablist" aria-label="Who runs it" className="mt-4 mb-5 flex gap-5 font-mono">
        {(
          [
            ["all", "All"],
            ...Object.entries(FITS).map(([value, { filter }]) => [value, filter]),
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={(fit ?? "all") === value}
            onClick={() => void setFit(value === "all" ? null : (value as Fit))}
            className="text-muted-foreground aria-selected:text-foreground aria-selected:border-foreground hover:text-foreground border-b-2 border-transparent py-2 text-xs transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
        <SkillTable rows={skills} sponsors={sponsors} />
      </div>
      {skills.length === 0 && <SkillsEmpty filtered={query.trim().length > 0 || fit !== null} />}
      {truncated && (
        <p className="text-muted-foreground py-6 text-center text-xs">
          Showing the top {skills.length}. Search to find the rest.
        </p>
      )}
      <p role="status" className="sr-only">
        {skills.length} skills
      </p>
    </div>
  );
}

function SkillTable({ rows, sponsors }: { rows: SkillEntry[]; sponsors: SponsorEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-border text-muted-foreground border-b font-mono text-xs font-normal">
          <tr>
            <th className="w-12 py-4 font-normal">#</th>
            <th className="py-4 font-normal">SKILL</th>
            <th className="hidden w-48 py-4 font-normal md:table-cell">SUGGESTED</th>
            <th className="py-4 text-right font-normal">
              <span className="inline-flex items-center gap-1.5">
                INSTALLS
                <Hint label="Install counts come from skills.sh" align="end">
                  Counted by skills.sh
                </Hint>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sponsors.map((sponsor) => (
            <SponsorRow key={sponsor.id} sponsor={sponsor} />
          ))}
          {rows.map((skill, index) => (
            <tr key={skill.id} className="border-border hover:bg-secondary/50 relative border-b">
              <td className="text-muted-foreground py-5 font-mono">{index + 1}</td>
              <td className="py-5 pr-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
                  <Link
                    href={skillPath(skill)}
                    className="font-semibold outline-offset-4 after:absolute after:inset-0 hover:underline"
                  >
                    {skill.name}
                  </Link>
                  <span className="text-muted-foreground font-mono text-xs">
                    {skill.owner}/{skill.repo}
                  </span>
                  <span className="relative z-10">
                    <FitBadges fits={skill.fits} />
                  </span>
                </div>
              </td>
              <td className="text-muted-foreground hidden py-5 pr-8 font-mono text-xs md:table-cell">
                {skill.schedule.label}
              </td>
              <td className="py-5 text-right font-mono tabular-nums">
                {compactNumber(skill.installs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillsEmpty({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No skills match. Try another word or clear the filter.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground py-12 text-center text-sm">
      No skills listed yet. The directory fills in as skills.sh is read.
    </p>
  );
}
