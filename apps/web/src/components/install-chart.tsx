"use client";

import { AreaChart } from "@/components/dithercn/area-chart";

export function InstallChart({ days }: { days: Array<{ day: string; installs: number }> }) {
  return (
    <div className="grid gap-2 font-mono text-xs">
      <AreaChart
        data={days}
        x="day"
        series={[{ label: "Installs", value: "installs" }]}
        height={96}
        cell={2}
        axes={false}
        format={{ maximumFractionDigits: 0 }}
      />
      <div className="text-muted-foreground flex justify-between">
        <span>{days[0]?.day}</span>
        <span>{days.at(-1)?.day}</span>
      </div>
    </div>
  );
}
