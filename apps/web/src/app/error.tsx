"use client";

import { DitherButton } from "@/components/dithercn/dither-button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="py-20">
      <h1 className="text-3xl font-semibold">The directory could not load</h1>
      <p className="text-muted-foreground mt-4 mb-6">Try loading the schedules again.</p>
      <DitherButton variant="outline" onClick={reset}>
        Try again
      </DitherButton>
    </div>
  );
}
