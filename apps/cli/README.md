# agent-schedules

Recurring tasks for AI coding agents

```sh
npx agent-schedules search [query]
npx agent-schedules add <owner/repo[/name]>
npx agent-schedules push <harness>
npx agent-schedules pull <harness>
npx agent-schedules list
npx agent-schedules remove <harness> <name>
npx agent-schedules doctor <harness>
```

Works with T3 Code, the Codex and Claude desktop apps, and the Codex, Claude Code, Pi, OpenCode and Cursor CLIs. Scheduling the CLIs needs cron, on macOS or Linux.

Read the [docs](https://schedules.sh/docs/cli) for every command and option, and browse schedules at [schedules.sh](https://schedules.sh).

`add` counts an anonymous install on schedules.sh for schedules from public repositories. Set `DO_NOT_TRACK=1` to opt out.
