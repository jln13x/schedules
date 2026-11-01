---
"agent-schedules": minor
---

`add <owner/repo/skill>` installs a skill from skills.sh with its own CLI and schedules it at the time schedules.sh suggests, so a skill from the directory takes two commands: `add`, then `push`. A skill that is already installed is only scheduled; `--cron` picks another time, and `--push <harness>` registers it right away. `add` no longer copies schedule files from GitHub repositories.
