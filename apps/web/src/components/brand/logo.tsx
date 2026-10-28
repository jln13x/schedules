import { cn } from "cn";

/** `compact` shows only the mark on small screens, to make room for navigation. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex h-5 items-start gap-2 leading-5 font-semibold tracking-tight">
      <img src="/brand/mark.svg" alt="" width={42} height={60} className="mt-0.5 h-4 w-auto" />
      <span className={cn(compact && "max-sm:hidden")}>
        schedules<span className="text-muted-foreground font-normal">.sh</span>
      </span>
    </span>
  );
}
