import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { DitherButton } from "@/components/dithercn/dither-button";

export default function NotFound() {
  return (
    <div className="grid min-h-96 place-items-center">
      <div className="w-full max-w-sm text-center">
        <Link
          href="/"
          aria-label="schedules.sh home"
          className="focus-visible:ring-ring inline-flex justify-center rounded-sm outline-none focus-visible:ring-2"
        >
          <Logo />
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground mt-2 text-sm">This page does not exist.</p>
        <DitherButton asChild className="mt-6">
          <Link href="/">Return home</Link>
        </DitherButton>
      </div>
    </div>
  );
}
