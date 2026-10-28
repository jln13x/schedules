import type { ReactNode } from "react";
import { Prose } from "@/components/prose";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** The date of the last change, as shown. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-3 mb-9 text-sm leading-6">Last updated {updated}.</p>
      <Prose>{children}</Prose>
    </article>
  );
}
