# agent-schedules

Recurring tasks for AI coding agents

```sh
npx agent-schedules search [query]
npx agent-schedules schedule <skill> <cron>
npx agent-schedules push <harness>
npx agent-schedules pull <harness>
npx agent-schedules list [--all] [--json]
npx agent-schedules enable|disable|run-now|remove <harness> <name>
npx agent-schedules doctor <harness>
```

Works with T3 Code, the Codex and Claude desktop apps, and the Codex, Claude Code, Pi, OpenCode and Cursor CLIs. Scheduling the CLIs needs cron, on macOS or Linux.

Install skills with `npx skills add`, then schedule them. Every command takes `--ssh <host>` to run on another machine, and `list --all --json` gives other tools, such as launchers, every task with what can be done to it. Read the [docs](https://schedules.sh/docs/cli) for every command and option, and find skills worth scheduling at [schedules.sh](https://schedules.sh).
