# agent-schedules

## 0.4.0

### Minor Changes

- b9d9458: `add <owner/repo/skill>` installs a skill from skills.sh with its own CLI and schedules it at the time schedules.sh suggests, so a skill from the directory takes two commands: `add`, then `push`. A skill that is already installed is only scheduled; `--cron` picks another time, and `--push <harness>` registers it right away. `add` no longer copies schedule files from GitHub repositories.

## 0.3.1

### Patch Changes

- b819590: Releases are published from GitHub Actions with npm provenance, so each version on npm links to the commit and workflow that built it.

## 0.3.0

### Minor Changes

- b642686: Schedules can run once a month: `0 8 1 * *` runs at 08:00 on the 1st, for any day from 1 to 28. Cron, Claude Desktop and Codex desktop run them, and `pull` reads them back. T3 has no monthly schedule, so a push to T3 refuses one instead of moving it to another day.
- b642686: Pushes remember which task each file went to, on the machine that runs it, and update that task by its id: renaming a schedule keeps its task, and the task keeps being paused or not, its model, thread and worktree. A task deleted in the app is recreated and reported; one changed in the app since the last push is reported and left alone unless you pass `--force`. `pull --adopt` binds files to tasks made in the apps.

  `enable`, `disable`, `run-now` and `remove` (or `delete`) control tasks by name or by `--id`, as far as each harness allows. `remove` keeps the schedule file unless you pass `--delete-source`, which is refused while another task is pushed from it.

  `list --all` shows every task in every workspace, including ones made in the apps and triggers a file can't hold, and `--json` prints them in a versioned shape with the actions each allows and warnings for what couldn't be read. Every command takes `--ssh <host>` and `--cwd <dir>`; hosts are remembered, and `list --all` asks each with one connection.

- b642686: `schedule <skill> <cron>` runs an installed skill on a schedule. It finds the skill where `npx skills add` put it, in the repository or the home folder, and writes a schedule whose prompt points the agent at the skill's `SKILL.md` and the files beside it. A missing or ambiguous name is refused. Running it again changes the time and keeps a prompt you edited. Schedule files can name their skill with `skill:`, which older versions reject.

  `search` lists skills from schedules.sh with their suggested schedule. `add` is deprecated and no longer reports installs.

## 0.2.0

### Minor Changes

- 92e9139: Schedule command-line agents, and new names for the desktop apps.

  **Changed harness names.** `codex` and `claude` used to mean the desktop apps. The apps are now `codex-desktop` and `claude-desktop`, and `codex` schedules the Codex CLI instead. Update any scripts that push to `codex` or `claude`.

  **Command-line agents.** `codex`, `claude-code`, `pi`, `opencode` and `cursor-agent` have no scheduler of their own, so `push` adds each task to your crontab. They need macOS or Linux with cron.

  - `--access read|edit|full` sets what a run may do, and later pushes keep it unless you pass another. New tasks get `read`.
  - `--model` picks the model and is remembered. `opencode` requires it.
  - At `read` and `edit`, Codex ignores approval requests, saved command rules and your Codex config, Claude Code loads only your user-level settings and no MCP servers, OpenCode denies every tool it isn't given, including subagents, and skips the repository's `.opencode` folder. A repository's own settings can't start anything in a restricted run.
  - OpenCode runs one job at a time and retries a run that hits a locked database.

  **New commands.**

  - `list` shows what is scheduled, whether each task is active, and its last run where the harness records one. `--all` covers the command-line agents' tasks in every repository.
  - `remove` unregisters command-line agent tasks and deletes their saved prompt and logs.
  - `doctor` checks a harness's setup: installed, and whether the installed version has been verified. For command-line agents it also runs the agent once with a one-line prompt, started as cron starts it, so a missing login or an API key only your shell profile sets shows up before the first scheduled run.
  - `search` finds schedules on schedules.sh.

  `push` and `pull` take names or `--all`, ask which schedules to sync when given neither, and preview with `--dry-run`.

### Patch Changes

- 60feb1c: `add` follows a repository that was renamed on GitHub and reports the install under its current name.
