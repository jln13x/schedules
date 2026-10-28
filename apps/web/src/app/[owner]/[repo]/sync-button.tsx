"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/dithercn/loader";
import { submitRepository } from "@/app/submit/actions";

export function SyncButton({ owner, repo }: { owner: string; repo: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={pending ? "Checking GitHub" : "Check GitHub for changes"}
      title="Check GitHub for changes"
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
      onClick={() =>
        startTransition(async () => {
          const form = new FormData();
          form.set("repository", `${owner}/${repo}`);
          const state = await submitRepository({ status: "idle" }, form);

          if (state.status === "error") {
            toast.error(state.message);
            return;
          }

          if (state.status === "listed") {
            const removed = state.removed.length > 0 ? `, removed ${state.removed.join(", ")}` : "";
            const skipped = state.skipped.map(({ file, reason }) => `${file} - ${reason}`);
            toast.success(
              `Up to date: ${state.listed.length} ${state.listed.length === 1 ? "schedule" : "schedules"}${removed}`,
              skipped.length > 0 ? { description: `Skipped ${skipped.join("; ")}` } : undefined,
            );
          }
        })
      }
    >
      {pending ? (
        <Loader size="sm" color="currentColor" label="Checking GitHub" />
      ) : (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
          <path d="M3 21v-5h5" />
          <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      )}
    </button>
  );
}
