---
name: Harness watch
schedule: 0 9 * * 1
---

Check whether the coding agents this CLI schedules have shipped a release newer than the one it was verified against. From the repository root run `bun apps/cli/scripts/check-versions.ts`. If it exits 0, reply that nothing is new and stop. If it exits 2, npm couldn't be read; say so and stop.

If it exits 1, run the sandbox against the new releases: `FRESH=1 bash .agents/skills/verify-harness/sandbox/run.sh` for the flag probe, then `MARKER=1 bash .agents/skills/verify-harness/sandbox/run.sh` for the real runs; agents without a login or key come back as SKIP. Then report, per agent: the new version, whether the flag probe passed, whether the marker runs passed or were skipped, and the exact lines to change in `apps/cli/src/harnesses/verified.ts` if everything passed. Don't change any files yourself. If a probe or marker run failed, quote the failing output.
