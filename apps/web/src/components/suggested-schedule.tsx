import { cn } from "cn";
import { Tooltip } from "@/components/tooltip";
import type { SuggestedSchedule as Schedule } from "@/lib/cadence";

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SuggestedSchedule({ schedule }: { schedule: Schedule }) {
  return (
    <section
      aria-label="Suggested schedule"
      className="border-border bg-card flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-md border px-5 py-4"
    >
      <div className="flex items-baseline gap-4">
        <span className="font-mono text-3xl font-semibold tabular-nums">{schedule.time}</span>
        <Tooltip
          label={`Cron ${schedule.cron}, in your local time`}
          content={
            <>
              <code className="font-mono">{schedule.cron}</code> in your local time. Change it in
              the command below.
            </>
          }
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          align="start"
        >
          {schedule.days}
        </Tooltip>
      </div>
      {schedule.monthDay === null && (
        <ul className="flex gap-2 font-mono text-xs" aria-label="Days it runs">
          {WEEK.map((day, index) => {
            const runs = schedule.weekdays === null || schedule.weekdays.includes(day);
            return (
              <li
                key={DAY_NAMES[index]}
                aria-label={`${DAY_NAMES[index]}: ${runs ? "runs" : "off"}`}
                className={cn("w-3 text-center", runs ? "text-foreground" : "opacity-30")}
              >
                {DAY_LETTERS[index]}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
