import { cn } from "cn";
import { DitherCard } from "@/components/dithercn/dither-card";
import type { ShowcaseSkill } from "./showcase-skills";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SkillCard({ skill }: { skill: ShowcaseSkill }) {
  return (
    <DitherCard
      glow="top-right"
      reach={160}
      strength={0.25}
      cell={2}
      color="grey"
      radius={12}
      className="grid gap-6 p-5 shadow-2xl shadow-black/80 sm:gap-8 sm:p-7"
    >
      {/* Right padding keeps the text clear of the corner glow. Clamped lines bound the card's height. */}
      <div className="pr-20">
        <h3 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{skill.name}</h3>
        <p className="text-muted-foreground mt-2 line-clamp-3 leading-relaxed sm:mt-3">
          {skill.summary}
        </p>
      </div>
      <footer className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-4 font-mono text-xs">
        <p>
          <span className="text-foreground tabular-nums">{skill.time}</span> - {skill.cadence}
        </p>
        <ul className="flex gap-1.5" aria-label="Days it runs">
          {skill.days.map((runs, day) => (
            <li
              key={DAY_NAMES[day]}
              aria-label={`${DAY_NAMES[day]}: ${runs ? "runs" : "off"}`}
              className={cn("w-3 text-center", runs ? "text-foreground" : "opacity-40")}
            >
              {DAY_LETTERS[day]}
            </li>
          ))}
        </ul>
      </footer>
    </DitherCard>
  );
}
