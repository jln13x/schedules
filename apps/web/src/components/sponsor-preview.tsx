import { SponsorRow } from "@/components/sponsor-row";
import type { SponsorEntry } from "@/components/sponsor-row";

const PREVIEW_SPONSOR = {
  id: 0,
  name: "Your product",
  description: "Your one-line description goes here.",
  url: "https://your-product.example",
};

export function SponsorPreview({ sponsor = PREVIEW_SPONSOR }: { sponsor?: SponsorEntry }) {
  return (
    <figure className="grid gap-3 text-left">
      <div className="border-border overflow-hidden rounded-md border px-4 sm:px-6">
        <div inert aria-hidden="true">
          <div className="border-border text-muted-foreground border-b py-5 font-mono text-xs">
            SCHEDULES LEADERBOARD
          </div>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-border text-muted-foreground border-b font-mono text-xs">
              <tr>
                <th className="w-10 py-4 font-normal sm:w-12">#</th>
                <th className="py-4 font-normal">SCHEDULE</th>
                <th className="hidden w-32 py-4 font-normal md:table-cell">LAST 30 DAYS</th>
                <th className="py-4 text-right font-normal">INSTALLS</th>
              </tr>
            </thead>
            <tbody>
              <SponsorRow sponsor={sponsor} />
              {["w-28", "w-36", "w-24"].map((width, index) => (
                <tr key={width} className="border-border border-b last:border-b-0">
                  <td className="text-muted-foreground/40 py-5 font-mono">{index + 1}</td>
                  <td className="py-5 pr-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                      <div className={`bg-muted h-3 max-w-full rounded-sm ${width}`} />
                      <div className="bg-muted/60 h-2 w-20 rounded-sm" />
                    </div>
                  </td>
                  <td className="hidden py-5 pr-8 md:table-cell">
                    <div className="bg-muted/60 h-5 w-full rounded-sm" />
                  </td>
                  <td className="py-5 text-right">
                    <div className="bg-muted ml-auto h-3 w-8 rounded-sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <figcaption className="text-muted-foreground text-center text-xs">
        Placement preview. Your product appears above the schedules, on both tabs and in searches.
      </figcaption>
    </figure>
  );
}
