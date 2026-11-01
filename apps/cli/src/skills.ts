import { execFile } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import { type Schedule, slug } from "./schedule.ts";

/**
 * Where `npx skills add` puts skills that the agents this CLI schedules read: the canonical
 * `.agents/skills` copy, which the other agent folders link to, and Claude Code's own folder for
 * skills installed for it alone. Globally, OpenCode and Cursor keep their own folders too.
 */
const PROJECT_ROOTS = [".agents/skills", ".claude/skills"];
const GLOBAL_ROOTS = [
  ".agents/skills",
  ".claude/skills",
  ".config/opencode/skills",
  ".cursor/skills",
];
const LOCK_FILES = { project: "skills-lock.json", global: ".agents/.skill-lock.json" };

export interface InstalledSkill {
  /** The name agents know it by: its frontmatter name, else its folder's. */
  readonly name: string;
  readonly folder: string;
  /** The skill's folder with links resolved, which tells two installs of one skill apart. */
  readonly dir: string;
  /** How a prompt reaches the folder: relative to the repository, or under ~ for global skills. */
  readonly path: string;
  readonly scope: "project" | "global";
  /** The repository `npx skills add` installed it from, such as owner/repo, when recorded. */
  readonly source?: string | undefined;
}

const execFileAsync = promisify(execFile);

const isDirectory = (path: string) =>
  stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );

function frontmatterName(text: string): string | undefined {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);

  try {
    const name = (parseYaml(match?.[1] ?? "") as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function lockSources(path: string): Promise<Map<string, string>> {
  try {
    const { skills } = JSON.parse(await readFile(path, "utf8")) as {
      skills?: Record<string, { source?: unknown }>;
    };
    return new Map(
      Object.entries(skills ?? {}).flatMap(([folder, entry]) =>
        typeof entry?.source === "string" ? [[folder, entry.source] as const] : [],
      ),
    );
  } catch {
    return new Map();
  }
}

const display = (dir: string, repository: string | null, home: string) => {
  if (repository !== null && (dir === repository || dir.startsWith(repository + sep))) {
    return relative(repository, dir);
  }

  return dir.startsWith(home + sep) ? `~${dir.slice(home.length)}` : dir;
};

/** Every skill installed for this repository and for the user, each folder once. */
export async function installedSkills(
  checkout: string | null,
  home = homedir(),
): Promise<Array<InstalledSkill>> {
  // Resolved like the skill folders are, so a linked path such as macOS's /tmp still compares equal.
  const repository = checkout === null ? null : await realpath(checkout).catch(() => checkout);
  const roots = [
    ...(repository === null
      ? []
      : PROJECT_ROOTS.map((root) => ({ root: join(repository, root), scope: "project" as const }))),
    ...GLOBAL_ROOTS.map((root) => ({ root: join(home, root), scope: "global" as const })),
  ];
  const sources = {
    project:
      repository === null ? new Map() : await lockSources(join(repository, LOCK_FILES.project)),
    global: await lockSources(join(home, LOCK_FILES.global)),
  };
  const found = new Map<string, InstalledSkill>();
  for (const { root, scope } of roots) {
    const folders = await readdir(root).catch(() => []);
    for (const folder of folders.toSorted()) {
      const linked = join(root, folder);
      const text = await readFile(join(linked, "SKILL.md"), "utf8").catch(() => undefined);

      if (text === undefined || !(await isDirectory(linked))) {
        continue;
      }

      const dir = await realpath(linked);

      // A linked agent folder points at the canonical copy, which is found under its own name.
      if (found.has(dir)) {
        continue;
      }

      found.set(dir, {
        name: frontmatterName(text) ?? folder,
        folder,
        dir,
        path: display(dir, repository, await realpath(home).catch(() => home)),
        scope,
        source: sources[scope].get(folder),
      });
    }
  }
  return [...found.values()];
}

const sameSlug = (left: string, right: string) => {
  try {
    return slug(left) === slug(right);
  } catch {
    return false;
  }
};

/** Whether a query names this skill: by name, folder, owner/repo/skill or owner/repo@skill. */
function names(query: string, skill: InstalledSkill): boolean {
  const qualified = skill.source && [
    `${skill.source}/${skill.folder}`,
    `${skill.source}@${skill.folder}`,
  ];
  return (
    query === skill.name ||
    query === skill.folder ||
    (qualified ? qualified.includes(query) : false)
  );
}

/**
 * The one installed skill a query names, or a path to a skill's folder. Several installs of one
 * name are refused rather than guessed between, since each agent may load a different one.
 */
export async function resolveSkill(
  query: string,
  repository: string | null,
  home = homedir(),
): Promise<InstalledSkill> {
  const skills = await installedSkills(repository, home);
  const asPath = query.startsWith("~/") ? join(home, query.slice(2)) : resolve(query);

  if (
    (isAbsolute(query) || query.startsWith(".") || query.startsWith("~/")) &&
    (await isDirectory(asPath))
  ) {
    const dir = await realpath(asPath);
    const skill = skills.find((candidate) => candidate.dir === dir);

    if (!skill) {
      throw new Error(`${query} is not an installed skill: it needs a SKILL.md`);
    }

    return skill;
  }

  const exact = skills.filter((skill) => names(query, skill));
  const matches = exact.length > 0 ? exact : skills.filter((skill) => sameSlug(query, skill.name));
  const [only] = matches;

  if (only && matches.length === 1) {
    return only;
  }

  if (matches.length > 1) {
    throw new Error(
      `${query} could mean ${matches.length} installed skills; pass the folder of the one to schedule:\n${matches.map((skill) => `  ${skill.path}`).join("\n")}`,
    );
  }

  const installed = skills.map((skill) => skill.name).toSorted();
  throw new Error(
    `no installed skill named ${query}. ${
      installed.length > 0 ? `Installed here: ${installed.join(", ")}.` : "None is installed here."
    } Install and schedule it in one go with: npx agent-schedules add <owner/repo/skill>`,
  );
}

/**
 * The installs of one skill from skills.sh: the folder of that name whose lock entry names the
 * repository, or that has none, since a copy installed by hand records nowhere it came from.
 */
export async function installedFrom(
  source: { readonly owner: string; readonly repo: string; readonly skill: string },
  repository: string | null,
  home = homedir(),
): Promise<Array<InstalledSkill>> {
  const repo = `${source.owner}/${source.repo}`;
  return (await installedSkills(repository, home)).filter(
    (skill) =>
      (skill.folder === source.skill || skill.name === source.skill) &&
      (skill.source === undefined || skill.source === repo),
  );
}

/**
 * The prompt a schedule runs: the skill by name, so agents that load skills recognize it, and its
 * folder spelled out, so any agent can read the instructions and the files beside them.
 */
export function skillPrompt(skill: InstalledSkill): string {
  return [
    `Use the ${skill.name} skill: read ${skill.path}/SKILL.md and follow it. The files it refers to are in ${skill.path}/.`,
    "This run was started on a schedule and nobody is watching it, so don't wait for answers: make reasonable choices and say what you did.",
  ].join("\n\n");
}

/**
 * The folder of a skill a schedule runs when it lies outside the repository, read from the prompt
 * `schedule` wrote. Project skills are written as relative paths, everything else isn't.
 */
export function skillOutsideRepository(schedule: Schedule): string | undefined {
  const folder = schedule.skill && /read (\S+)\/SKILL\.md/.exec(schedule.prompt)?.[1];
  return folder && (folder.startsWith("~") || isAbsolute(folder)) ? folder : undefined;
}

/** Whether git tracks the skill, so worktrees and other clones of the repository have it too. */
export async function isCommitted(skill: InstalledSkill, repository: string): Promise<boolean> {
  return execFileAsync("git", ["ls-files", "--error-unmatch", `${skill.path}/SKILL.md`], {
    cwd: repository,
  }).then(
    () => true,
    () => false,
  );
}
