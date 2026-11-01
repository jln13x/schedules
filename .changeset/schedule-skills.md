---
"agent-schedules": minor
---

`schedule <skill> <cron>` runs an installed skill on a schedule. It finds the skill where `npx skills add` put it, in the repository or the home folder, and writes a schedule whose prompt points the agent at the skill's `SKILL.md` and the files beside it. A missing or ambiguous name is refused. Running it again changes the time and keeps a prompt you edited. Schedule files can name their skill with `skill:`, which older versions reject.

`search` lists skills from schedules.sh with their suggested schedule. `add` is deprecated and no longer reports installs.
