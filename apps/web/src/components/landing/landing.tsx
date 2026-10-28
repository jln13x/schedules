import Link from "next/link";
import type { ReactNode } from "react";
import { DitherButton } from "@/components/dithercn/dither-button";
import { Showcase } from "@/components/showcase/showcase";
import type { ShowcaseSchedule } from "@/components/showcase/showcase-schedules";
import { HeroActions, Label, WorksWith } from "./parts";

const PITCH = "Recurring tasks for AI coding agents";

export function Landing({
  showcase,
  leaderboard,
}: {
  showcase: ReadonlyArray<ShowcaseSchedule>;
  /** Rendered per request, since it follows the URL's search and period. */
  leaderboard: ReactNode;
}) {
  return (
    <>
      <section className="grid items-center gap-6 sm:gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <h1 className="sr-only">The Agent Schedules Directory</h1>
          <img
            src="/brand/wordmark.svg"
            alt="Schedules"
            width={432}
            height={60}
            className="h-auto max-w-full"
          />
          <p className="mt-6 text-xl leading-snug tracking-tight text-balance sm:mt-8 sm:text-2xl">
            {PITCH}
          </p>
          <HeroActions className="mt-6 sm:mt-8" />
          <WorksWith className="mt-8 sm:mt-10" />
        </div>
        <Showcase schedules={showcase} />
      </section>
      <section id="schedules" className="mt-14 scroll-mt-6 sm:mt-20">
        <div className="flex items-center justify-between gap-4">
          <Label>SCHEDULES LEADERBOARD</Label>
          <DitherButton asChild size="sm" variant="outline">
            <Link href="/submit">Submit a schedule</Link>
          </DitherButton>
        </div>
        {leaderboard}
      </section>
    </>
  );
}
