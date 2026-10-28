export interface SponsorEntry {
  id: number;
  name: string;
  description: string;
  url: string;
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function SponsorRow({ sponsor }: { sponsor: SponsorEntry }) {
  return (
    <tr className="border-border hover:bg-secondary/50 relative border-b">
      <td className="text-muted-foreground py-5 font-mono text-xs tracking-wider">AD</td>
      <td className="w-1/2 max-w-0 py-5 pr-4">
        <div className="flex min-w-0 items-baseline gap-3 whitespace-nowrap">
          <a
            href={sponsor.url}
            rel="sponsored noopener"
            target="_blank"
            className="max-w-1/2 shrink-0 truncate font-semibold outline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {sponsor.name}
          </a>
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {sponsor.description}
          </span>
        </div>
      </td>
      <td className="hidden py-5 pr-8 md:table-cell" />
      <td className="text-muted-foreground max-w-24 py-5 text-right font-mono text-xs sm:max-w-40">
        <span className="block truncate">{host(sponsor.url)}</span>
      </td>
    </tr>
  );
}
