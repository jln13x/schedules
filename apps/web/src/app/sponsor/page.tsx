import Link from "next/link";
import { env } from "@/env";
import { GITHUB_URL, pageMetadata } from "@/lib/site";
import { cachedSponsors } from "@/server/cached";
import { SponsorForm } from "./sponsor-form";

export const metadata = pageMetadata({
  title: "Sponsor",
  path: "/sponsor",
  description: "Pin your product above the schedules.sh leaderboard.",
});

export default async function SponsorPage() {
  const open = (await cachedSponsors()).length === 0;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-8 pt-16 text-center sm:pt-28">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sponsor schedules.sh</h1>
      <SponsorForm available={open} />
      {!open && (
        <p className="text-muted-foreground text-sm">
          Interested in the next opening?{" "}
          <a href={`${GITHUB_URL}/issues`} className="text-foreground underline">
            Get in touch
          </a>
          .
        </p>
      )}
      <a href={env.STRIPE_CUSTOMER_PORTAL_URL} className="text-muted-foreground text-xs underline">
        Manage an existing sponsorship
      </a>
      <Link href="/sponsor/terms" className="text-muted-foreground text-xs underline">
        Sponsorship terms
      </Link>
    </div>
  );
}
