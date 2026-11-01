import type { ReactNode } from "react";
import { Showcase } from "@/components/showcase/showcase";
import type { ShowcaseSkill } from "@/components/showcase/showcase-skills";
import { HeroActions, Label, WorksWith } from "./parts";

const PITCH = "Put your agent on a schedule";
// What sets it apart from any one app's scheduler: the schedule is a file, so it travels.
const PROMISE = "Share it between harnesses and your team.";

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
          <img
            src="/brand/wordmark.svg"
            alt="Schedules"
            width={432}
            height={60}
            className="h-auto max-w-full"
          />
          <h1 className="mt-6 text-xl leading-snug font-normal tracking-tight text-balance sm:mt-8 sm:text-2xl">
            {PITCH}
          </h1>
          <p className="text-muted-foreground mt-2 text-base sm:text-lg">{PROMISE}</p>
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
