import { Hint } from "@/components/hint";
import { type Fit, FITS } from "@/lib/cadence";

const FIT_HINT =
  "For you: each person schedules it for their own work and gets their own result. For your team: one run covers everyone, so schedule it once.";

export function FitBadges({ fits, hint = false }: { fits: Record<Fit, boolean>; hint?: boolean }) {
  const shown = (Object.keys(FITS) as Fit[]).filter((fit) => fits[fit]);

  if (shown.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {shown.map((fit) => (
        <span
          key={fit}
          className="border-border text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap"
        >
          {FITS[fit].label}
        </span>
      ))}
      {hint && <Hint label={FIT_HINT}>{FIT_HINT}</Hint>}
    </span>
  );
}
