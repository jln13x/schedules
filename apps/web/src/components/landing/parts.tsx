import Link from "next/link";
import { cn } from "cn";
import { DitherButton } from "@/components/dithercn/dither-button";
import { HarnessLogo } from "./harness-logo";

const HARNESSES = [
  { name: "T3 Code", slug: "t3", logo: "/harnesses/t3-code.png" },
  { name: "Codex", slug: "codex", logo: "/harnesses/codex.svg" },
  { name: "Claude", slug: "claude", logo: "/harnesses/claude.svg" },
  { name: "Pi", slug: "pi", logo: "/harnesses/pi.svg" },
  { name: "OpenCode", slug: "opencode", logo: "/harnesses/opencode.svg" },
  { name: "Cursor", slug: "cursor", logo: "/harnesses/cursor.svg" },
];

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("font-mono text-xs tracking-wider", className)}>{children}</h2>;
}

export function WorksWith({ className }: { className?: string }) {
  const loop = [0, 1, 2, 3].flatMap((round) => HARNESSES.map((harness) => ({ round, harness })));
  return (
    <section className={cn("grid gap-3", className)}>
      <Label className="text-muted-foreground">WORKS WITH</Label>
      <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <ul className="animate-marquee flex w-max hover:[animation-play-state:paused]">
          {loop.map(({ round, harness }) => (
            <li key={`${round}-${harness.slug}`} aria-hidden={round > 0}>
              <Link
                href="/docs/harnesses"
                tabIndex={round > 0 ? -1 : undefined}
                className="text-foreground/85 flex items-center gap-2.5 pr-10 text-lg font-medium tracking-tight hover:text-white"
              >
                <HarnessLogo logo={harness.logo} size={24} />
                {harness.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HeroActions({ className }: { className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:flex", className)}>
      <DitherButton asChild size="lg" className="px-3 sm:px-5">
        <a href="#skills">Browse skills</a>
      </DitherButton>
      <DitherButton asChild size="lg" variant="outline" className="px-3 sm:px-5">
        <Link href="/docs">How it works</Link>
      </DitherButton>
    </div>
  );
}
