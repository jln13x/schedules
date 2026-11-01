---
"agent-schedules": minor
---

Schedules can run once a month: `0 8 1 * *` runs at 08:00 on the 1st, for any day from 1 to 28. Cron, Claude Desktop and Codex desktop run them, and `pull` reads them back. T3 has no monthly schedule, so a push to T3 refuses one instead of moving it to another day.
