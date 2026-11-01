import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { SCHEDULES_DIR } from "./schedule.ts";

const execFileAsync = promisify(execFile);
const git = async (...args: Array<string>) => (await execFileAsync("git", args)).stdout.trim();

/**
 * Where schedules are read and where their tasks run: the repository's checkout and its main
 * checkout, or the home folder outside a repository or with --global.
 */
export async function location(global: boolean) {
  const checkout = global ? null : await git("rev-parse", "--show-toplevel").catch(() => null);
  // Worktrees share one repository, and schedulers know it by its main checkout, which git lists
  // first.
  const main =
    checkout === null
      ? null
      : await git("worktree", "list", "--porcelain")
          .then((list) => list.split("\n")[0]?.replace(/^worktree /, "") || null)
          .catch(() => null);
  return {
    cwd: checkout === null ? homedir() : (main ?? checkout),
    dir: join(checkout ?? homedir(), SCHEDULES_DIR),
    checkout,
  };
}

/** A path as short as it reads unambiguously: relative to here, or under ~. */
export const display = (path: string) => {
  const local = relative(process.cwd(), path);

  if (!local.startsWith("..")) {
    return local;
  }

  return path.startsWith(homedir() + sep) ? `~${path.slice(homedir().length)}` : path;
};
