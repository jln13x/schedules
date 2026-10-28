"use client";

import Link from "next/link";
import { debounce, defaultRateLimit, useQueryState } from "nuqs";
import { useTransition } from "react";
import { Sparkline } from "@/components/dithercn/sparkline";
import { LEADERBOARD_PARAMS } from "@/lib/search-params";
import { compactNumber, repositoryPath, schedulePath } from "@/lib/site";
import { type SponsorEntry, SponsorRow } from "@/components/sponsor-row";

export interface LeaderboardEntry {
  id: number;
  owner: string;
  repo: string;
  name: string;
  displayName: string;
  installs: number;
  trendingInstalls: number;
  history: number[];
}

const PERIOD_LABELS = { all: "All time", trending: "Trending (7d)" } as const;
type Period = keyof typeof PERIOD_LABELS;
const SEARCH_DEBOUNCE_MS = 250;
const NO_SPONSORS: SponsorEntry[] = [];

export function Leaderboard({
  schedules,
  truncated = false,
  sponsors = NO_SPONSORS,
}: {
  schedules: LeaderboardEntry[];
  truncated?: boolean;
  sponsors?: SponsorEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const options = { shallow: false, startTransition };
  const [query, setQuery] = useQueryState("q", LEADERBOARD_PARAMS.q.withOptions(options));
  const [period, setPeriod] = useQueryState(
    "period",
    LEADERBOARD_PARAMS.period.withOptions(options),
  );
  return (
    <div>
      <label htmlFor="schedule-search" className="sr-only">
        Search schedules
      </label>
      <input
        id="schedule-search"
        type="search"
        placeholder="Search schedules..."
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          void setQuery(value || null, {
            limitUrlUpdates: value ? debounce(SEARCH_DEBOUNCE_MS) : defaultRateLimit,
          });
        }}
        className="placeholder:text-muted-foreground focus-visible:border-foreground mt-5 h-12 w-full border-b bg-transparent font-mono text-sm outline-none"
      />
      <div role="tablist" aria-label="Ranking period" className="mt-4 mb-5 flex gap-5 font-mono">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={period === value}
            onClick={() => void setPeriod(value)}
            className="text-muted-foreground aria-selected:text-foreground aria-selected:border-foreground hover:text-foreground border-b-2 border-transparent py-2 text-xs transition-colors"
          >
            {PERIOD_LABELS[value]}
          </button>
        ))}
      </div>
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
        <ScheduleTable rows={schedules} period={period} sponsors={sponsors} />
      </div>
      {schedules.length === 0 && <SchedulesEmpty filtered={query.trim().length > 0} />}
      {truncated && (
        <p className="text-muted-foreground py-6 text-center text-xs">
          Showing the top {schedules.length}. Search to find the rest.
        </p>
      )}
      <p role="status" className="sr-only">
        {schedules.length} schedules
      </p>
    </div>
  );
}

export function ScheduleTable({
  rows,
  period = "all",
  showRepository = true,
  sponsors = NO_SPONSORS,
}: {
  rows: LeaderboardEntry[];
  period?: Period;
  showRepository?: boolean;
  sponsors?: SponsorEntry[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-border text-muted-foreground border-b font-mono text-xs font-normal">
          <tr>
            <th className="w-12 py-4 font-normal">#</th>
            <th className="py-4 font-normal">SCHEDULE</th>
            <th className="hidden w-40 py-4 font-normal md:table-cell">LAST 30 DAYS</th>
            <th className="py-4 text-right font-normal">INSTALLS</th>
          </tr>
        </thead>
        <tbody>
          {sponsors.map((sponsor) => (
            <SponsorRow key={sponsor.id} sponsor={sponsor} />
          ))}
          {rows.map((schedule, index) => (
            <tr key={schedule.id} className="border-border hover:bg-secondary/50 relative border-b">
              <td className="text-muted-foreground py-5 font-mono">{index + 1}</td>
              <td className="py-5 pr-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
                  <Link
                    href={schedulePath(schedule)}
                    className="font-semibold outline-offset-4 after:absolute after:inset-0 hover:underline"
                  >
                    {schedule.name}
                  </Link>
                  {showRepository && (
                    <Link
                      href={repositoryPath(schedule)}
                      className="text-muted-foreground hover:text-foreground relative z-10 font-mono text-xs outline-offset-4 hover:underline"
                    >
                      {schedule.owner}/{schedule.repo}
                    </Link>
                  )}
                </div>
              </td>
              <td className="hidden py-3 pr-8 md:table-cell">
                <Sparkline
                  data={schedule.history}
                  domain={[0, Math.max(...schedule.history, 1)]}
                  label="Installs per day over the last 30 days"
                  dot={false}
                  animate={false}
                  className="w-full"
                />
              </td>
              <td className="py-5 text-right font-mono tabular-nums">
                {compactNumber(
                  period === "trending" ? schedule.trendingInstalls : schedule.installs,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchedulesEmpty({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No schedules match this search. Try a name or repository.
      </p>
    );
  }

  return (
    <p className="text-muted-foreground py-12 text-center text-sm">
      No schedules listed yet. Publish a schedule in a public repository and install it to add it
      here.{" "}
      <Link href="/docs/format" className="text-foreground underline">
        Read the file format
      </Link>
      .
    </p>
  );
}
