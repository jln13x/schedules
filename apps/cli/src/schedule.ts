import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type Schedule, parseSchedule, serializeSchedule, slug } from "@agent-schedules/format";

export * from "@agent-schedules/format";

export const SCHEDULES_DIR = ".agents/schedules";

export interface ScheduleFile {
  readonly path: string;
  readonly schedule: Schedule;
}

export async function readSchedules(dir: string): Promise<ReadonlyArray<ScheduleFile>> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    },
  );
  const files = await Promise.all(
    entries
      .filter((entry) => entry.name.endsWith(".md") && !entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted()
      .map(async (entry) => {
        const path = join(dir, entry);
        return { path, schedule: parseSchedule(await readFile(path, "utf8"), path) };
      }),
  );
  const seen = new Map<string, string>();
  for (const { path, schedule } of files) {
    const previous = seen.get(schedule.name);

    if (previous) {
      throw new Error(`${path}: name "${schedule.name}" is also used by ${previous}`);
    }

    seen.set(schedule.name, path);
  }
  return files;
}

export function schedulePath(
  dir: string,
  existing: ReadonlyArray<ScheduleFile>,
  name: string,
): string {
  const own = existing.find((file) => file.schedule.name === name);
  const path = own?.path ?? join(dir, `${slug(name)}.md`);
  const occupant = existing.find((file) => file.path === path && file !== own);

  if (occupant) {
    throw new Error(`${path} already holds "${occupant.schedule.name}"; rename one of them`);
  }

  return path;
}

export async function writeSchedule(path: string, schedule: Schedule): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeSchedule(schedule));
}
