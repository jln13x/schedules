import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import { SubmitForm } from "./submit-form";

export const metadata = pageMetadata({
  title: "Submit a schedule",
  path: "/submit",
  description: "List the schedules in a public GitHub repository on schedules.sh.",
});

export default function SubmitPage() {
  return (
    <div className="mx-auto grid w-full max-w-xl gap-8 pt-16 text-center sm:pt-28">
      <div className="grid gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Submit a schedule</h1>
        <p className="text-muted-foreground">
          Enter the public GitHub repository that holds your schedules.
        </p>
      </div>
      <SubmitForm />
      <details className="group text-muted-foreground text-left text-sm">
        <summary className="hover:text-foreground mx-auto flex w-fit cursor-pointer list-none items-center gap-1 text-xs [&::-webkit-details-marker]:hidden">
          How it works
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 transition-transform group-open:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <ol className="border-border mt-4 grid gap-3 rounded-md border p-5">
          <li className="flex gap-3">
            <span className="font-mono">01</span>
            <span>
              Put each schedule in a Markdown file under{" "}
              <code className="text-foreground font-mono text-xs">.agents/schedules/</code>.{" "}
              <Link href="/docs/format" className="text-foreground underline">
                File format
              </Link>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono">02</span>
            <span>
              Submit the repository here. Its schedules are listed right away and ranked by
              installs.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono">03</span>
            <span>
              Listings are re-read from GitHub daily. To update sooner, submit again or use the sync
              button on the repository&apos;s page.
            </span>
          </li>
        </ol>
      </details>
    </div>
  );
}
