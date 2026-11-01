import type { ReactNode } from "react";
import { Showcase } from "@/components/showcase/showcase";
import type { ShowcaseSkill } from "@/components/showcase/showcase-skills";
import { HeroActions, Label, WorksWith } from "./parts";

const PITCH = "Agent skills worth running on a schedule";

export function Landing({
  showcase,
  skills,
}: {
  showcase: ReadonlyArray<ShowcaseSkill>;
  /** Rendered per request, since it follows the URL's search and filter. */
  skills: ReactNode;
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
        <Showcase skills={showcase} />
      </section>
      <section id="skills" className="mt-14 scroll-mt-6 sm:mt-20">
        <Label>SKILLS TO SCHEDULE</Label>
        {skills}
      </section>
    </>
  );
}
