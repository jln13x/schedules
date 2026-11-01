import { slug } from "./schedule.ts";

export const line = (action: string, name: string, detail = "") =>
  console.log(`${action.padEnd(10)}${name}${detail ? ` - ${detail}` : ""}`);

/** Counts what a command left alone and what failed, and exits 1 when anything failed. */
export function createReport() {
  let unchanged = 0;
  let failed = 0;
  return {
    line,
    unchanged: () => {
      unchanged += 1;
    },
    fail: (name: string, reason: unknown, label = "conflict") => {
      line(label, name, reason instanceof Error ? reason.message : String(reason));
      failed += 1;
    },
    failed: () => failed > 0,
    finish: (dryRun: boolean) => {
      console.log(`${unchanged} unchanged${dryRun ? " (dry run, nothing written)" : ""}`);
      process.exit(failed > 0 ? 1 : 0);
    },
  };
}

const sameSlug = (query: string, name: string) => {
  try {
    return slug(query) === slug(name);
  } catch {
    return false;
  }
};

/** What a query names: the exact name, or else the one item with that filename form. */
export function matching<T extends { readonly name: string }>(
  query: string,
  items: ReadonlyArray<T>,
): ReadonlyArray<T> {
  const exact = items.filter((item) => item.name === query);
  const found = exact.length > 0 ? exact : items.filter((item) => sameSlug(query, item.name));

  if (found.length > 1) {
    throw new Error(
      `${query} could mean ${found.map((item) => item.name).join(" or ")}; use the exact name or --id`,
    );
  }

  return found;
}

export const when = (date: Date) =>
  date.toLocaleString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

export function table(rows: ReadonlyArray<ReadonlyArray<string>>) {
  const widths =
    rows[0]?.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0))) ?? [];
  for (const row of rows) {
    console.log(
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join("  ")
        .trimEnd(),
    );
  }
}
