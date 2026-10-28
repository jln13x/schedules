<p align="center">
  <a href="https://schedules.sh">
    <img src=".github/assets/banner.svg" alt="schedules.sh" width="720">
  </a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agent-schedules"><img alt="npm version" src="https://img.shields.io/npm/v/agent-schedules.svg?style=for-the-badge&labelColor=000000&color=0a0a0a" height="28"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0a0a0a.svg?style=for-the-badge&labelColor=000000" height="28"></a>
</p>

Schedules are recurring prompts for your coding agent, kept as Markdown files in your repository. Discover them at [schedules.sh](https://schedules.sh).

## Add a schedule

```sh
npx agent-schedules add <owner/repo>
```

Then `npx agent-schedules push <harness>` registers it with your agent: T3 Code, the Codex or Claude desktop app, or the Codex, Claude Code, Pi, OpenCode or Cursor CLI.

See the [docs](https://schedules.sh/docs) for every command and option.
