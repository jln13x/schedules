---
"agent-schedules": minor
---

Pushes remember which task each file went to, on the machine that runs it, and update that task by its id: renaming a schedule keeps its task, and the task keeps being paused or not, its model, thread and worktree. A task deleted in the app is recreated and reported; one changed in the app since the last push is reported and left alone unless you pass `--force`. `pull --adopt` binds files to tasks made in the apps.

`enable`, `disable`, `run-now` and `remove` (or `delete`) control tasks by name or by `--id`, as far as each harness allows. `remove` keeps the schedule file unless you pass `--delete-source`, which is refused while another task is pushed from it.

`list --all` shows every task in every workspace, including ones made in the apps and triggers a file can't hold, and `--json` prints them in a versioned shape with the actions each allows and warnings for what couldn't be read. Every command takes `--ssh <host>` and `--cwd <dir>`; hosts are remembered, and `list --all` asks each with one connection.
