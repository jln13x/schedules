"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { DitherButton } from "@/components/dithercn/dither-button";
import { ditherMaskStyle } from "@/lib/dither";
import { repositoryPath, schedulePath } from "@/lib/site";
import { submitRepository, type SubmitState } from "./actions";

const IDLE: SubmitState = { status: "idle" };
const ERROR_ID = "submit-error";

export function SubmitForm() {
  const [state, action, pending] = useActionState(submitRepository, IDLE);
  const [repository, setRepository] = useState("");
  const failed = state.status === "error" && !pending;
  return (
    <div className="grid gap-8">
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="repository" className="sr-only">
          Public GitHub repository
        </label>
        <input
          id="repository"
          name="repository"
          value={repository}
          onChange={(event) => setRepository(event.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="owner/repo or GitHub URL"
          aria-invalid={failed || undefined}
          aria-describedby={failed ? ERROR_ID : undefined}
          className="border-border placeholder:text-muted-foreground focus-visible:border-foreground aria-invalid:border-dither-red bg-secondary h-11 min-w-0 flex-1 rounded-md border px-4 font-mono text-sm outline-none"
        />
        <DitherButton type="submit" size="lg" loading={pending} className="min-w-32">
          Submit
        </DitherButton>
      </form>
      <SubmitResult state={state} />
    </div>
  );
}

function SubmitResult({ state }: { state: SubmitState }) {
  if (state.status === "idle") {
    return null;
  }

  if (state.status === "error") {
    return (
      <div
        id={ERROR_ID}
        role="alert"
        className="border-dither-red/50 bg-dither-red/10 relative flex gap-3 overflow-hidden rounded-md border py-4 pr-5 pl-6 text-left text-sm"
      >
        <span
          aria-hidden="true"
          className="bg-dither-red absolute inset-y-0 left-0 w-1.5"
          style={ditherMaskStyle(0.5, { cell: 2 })}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-dither-red mt-0.5 size-4 shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        <div className="grid gap-1">
          <p className="text-dither-red font-medium">Could not submit</p>
          <p className="text-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="grid gap-6 text-left">
      <p className="text-sm">
        {state.listed.length === 0
          ? "No schedules in "
          : `Listed ${state.listed.length} ${state.listed.length === 1 ? "schedule" : "schedules"} from `}
        <Link href={repositoryPath(state)} className="font-mono underline">
          {state.owner}/{state.repo}
        </Link>
        {state.listed.length === 0 ? " could be listed." : "."}
        {state.removed.length > 0 &&
          ` Removed ${state.removed.join(", ")}, which no longer ${state.removed.length === 1 ? "has" : "have"} a valid file.`}
      </p>
      {state.listed.length > 0 && (
        <ul className="border-border border-t">
          {state.listed.map((schedule) => (
            <li key={schedule.name} className="border-border border-b">
              <Link
                href={schedulePath({ owner: state.owner, repo: state.repo, name: schedule.name })}
                className="flex items-baseline justify-between gap-4 py-3 text-sm hover:underline"
              >
                {schedule.displayName}
                <span className="text-muted-foreground font-mono text-xs">{schedule.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {state.skipped.length > 0 && (
        <div className="grid gap-2">
          <h2 className="font-mono text-xs tracking-wider">SKIPPED</h2>
          <ul className="text-muted-foreground grid gap-1 text-xs">
            {state.skipped.map((file) => (
              <li key={file.file}>
                <span className="text-foreground font-mono">{file.file}</span> - {file.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
