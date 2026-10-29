import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { GITHUB_URL } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="flex h-12 items-center justify-between gap-4 px-5 text-sm sm:px-8">
      <Link href="/" aria-label="schedules.sh home" className="shrink-0">
        <Logo compact />
      </Link>
      <nav
        aria-label="Main navigation"
        className="text-muted-foreground flex items-center gap-3.5 sm:gap-7"
      >
        <Link href="/sponsor" className="hover:text-foreground">
          Sponsor
        </Link>
        <Link href="/docs" className="hover:text-foreground">
          Docs
        </Link>
        <a href={GITHUB_URL} className="hover:text-foreground">
          GitHub
        </a>
        <FeedbackDialog kind="feedback" />
      </nav>
    </header>
  );
}
