# agent-schedules

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
