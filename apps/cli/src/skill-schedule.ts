import { display } from "./location.ts";
import { line } from "./report.ts";
import {
  type Schedule,
  type Timing,
  describeTiming,
  readSchedules,
  sameSchedule,
  schedulePath,
  writeSchedule,
} from "./schedule.ts";
import { type InstalledSkill, isCommitted, skillPrompt } from "./skills.ts";

interface Options {
  /** The schedules folder. */
  readonly dir: string;
  /** The repository's checkout, or null for the home folder. */
  readonly checkout: string | null;
  readonly name?: string | undefined;
  readonly dryRun: boolean;
}

/**
 * Writes the schedule that runs an installed skill, or changes the time of the one that already
 * does. Resolves to the schedule's name.
 */
export async function scheduleSkill(
  skill: InstalledSkill,
  timing: Timing,
  { dir, checkout, name: requested, dryRun }: Options,
): Promise<string> {
  const files = await readSchedules(dir);
  const name = requested?.trim() || skill.name;
  // Without a name, scheduling a skill again changes the file that already runs it.
  const file = requested
    ? files.find((candidate) => candidate.schedule.name === name)
    : (files.find((candidate) => candidate.schedule.skill === skill.name) ??
      files.find((candidate) => candidate.schedule.name === name));

  if (file && file.schedule.skill !== skill.name) {
    throw new Error(
      `${display(file.path)} already holds "${file.schedule.name}"; pass --name to schedule ${skill.name} under another name`,
    );
  }

  const prompt = skillPrompt(skill);
  // A prompt someone edited is theirs; only the timing follows this command.
  const edited = file !== undefined && file.schedule.prompt !== prompt;
  const next: Schedule = {
    name: file?.schedule.name ?? name,
    timing,
    prompt: edited ? file.schedule.prompt : prompt,
    skill: skill.name,
  };

  if (file && sameSchedule(file.schedule, next)) {
    line("unchanged", next.name, display(file.path));
    return next.name;
  }

  const path = file?.path ?? schedulePath(dir, files, next.name);

  if (!dryRun) {
    await writeSchedule(path, next);
  }

  line(
    file ? "update" : "create",
    next.name,
    `${display(path)}, ${describeTiming(timing)}${edited ? ", kept its edited prompt" : ""}`,
  );

  if (skill.scope === "global") {
    console.log(
      `note      ${skill.path} is outside the repository: Claude Code and OpenCode can only read it with --access full`,
    );
  }

  if (skill.scope === "project" && checkout !== null && !(await isCommitted(skill, checkout))) {
    console.log(
      `note      ${skill.path} isn't committed, so tasks that run in a worktree or another clone won't find it`,
    );
  }

  return next.name;
}
