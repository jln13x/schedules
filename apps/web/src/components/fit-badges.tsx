import { UserGroupIcon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import { Tooltip } from "@/components/tooltip";
import { type Fit, FITS } from "@/lib/cadence";

const STYLES: Record<Fit, { icon: typeof UserIcon; className: string }> = {
  you: { icon: UserIcon, className: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200/90" },
  team: {
    icon: UserGroupIcon,
    className: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200/90",
  },
};

export function FitBadges({ fits }: { fits: Record<Fit, boolean> }) {
  const shown = (Object.keys(FITS) as Fit[]).filter((fit) => fits[fit]);

  if (shown.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {shown.map((fit) => (
        <Tooltip
          key={fit}
          label={`${FITS[fit].filter}: ${FITS[fit].explanation}`}
          content={FITS[fit].explanation}
          align="start"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap",
            STYLES[fit].className,
          )}
        >
          <HugeiconsIcon icon={STYLES[fit].icon} size={12} strokeWidth={2} aria-hidden="true" />
          <span className="underline decoration-current/50 decoration-dotted underline-offset-[3px]">
            {FITS[fit].badge}
          </span>
        </Tooltip>
      ))}
    </span>
  );
}
