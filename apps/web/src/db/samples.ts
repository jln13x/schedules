import { parseScheduleSource } from "./format";

const SOURCES = {
  "branch-hygiene": `---
name: Branch hygiene
schedule: 0 18 * * 5
---

Find my branches that are merged or stale for two weeks and propose which to delete, with the reason for each.
`,
  "ci-flake-report": `---
name: CI flake report
schedule: 30 9 * * 1
---

Look at this repository's CI runs from the last seven days on the default branch and on my pull requests. Find tests that failed and then passed on a rerun of the same commit, and count how often each one flaked.

Report the five worst offenders with the failing job, a one-line guess at the cause from the logs, and a link to one failing run. Do not rerun jobs, change tests, or open issues. If nothing flaked, say so in one line.
`,
  "dependency-watch": `---
name: Dependency watch
schedule: 0 8 * * 1
---

Check for security advisories affecting dependencies this repository uses and report the ones that need action, with the fix version.
`,
  "docs-drift": `---
name: Docs drift check
schedule: 0 10 * * 3
---

Review the pull requests merged in the last seven days and find documentation in this repository that now describes the old behavior: renamed commands, changed options, removed endpoints, or outdated examples.

List each stale passage with its file, the merged pull request that made it stale, and the corrected wording. Do not edit files or open pull requests unless I ask. If the docs are current, say so in one line.
`,
  "morning-brief": `---
name: Morning brief
schedule: 7 9 * * 1-5
---

List pull requests waiting for my review, CI failures on my open pull requests, and review comments I have not answered. Keep it to what needs me today.
`,
  "onboarding-tour": `---
name: Onboarding tour
schedule: 0 10 * * 2
---

Pick one subsystem of this repository I have not been shown yet, explain how it works and where to start reading, in under a page.
`,
  "release-notes-draft": `---
name: Release notes draft
schedule: 0 15 * * 5
---

Draft release notes for everything merged to the default branch since the latest release tag. Group changes into features, fixes, and internal work, one line each in plain language, with the pull request number. Call out breaking changes and required migrations first.

Write the draft as a message to me. Do not create tags, releases, or commits. If nothing was merged since the last tag, say so in one line.
`,
  "review-nudge": `---
name: Review nudge
schedule: 0 16 * * 1-5
---

Find my open pull requests with no activity for two days, summarize their state, and draft a short ping for each reviewer.
`,
  "todo-triage": `---
name: TODO triage
schedule: 0 11 * * 4
---

Find TODO and FIXME comments I added or touched in the last seven days, using git blame on the default branch. For each one, say whether it is already resolved, still needed, or worth a ticket, with a one-line reason.

Keep the list to what needs a decision from me. Do not change code or create tickets.
`,
  "weekly-summary": `---
name: Weekly summary
schedule: 0 17 * * 5
---

Summarize what changed this week in the areas I own, grouped by theme, as a draft for my weekly update.
`,
};

export const SAMPLE_SCHEDULES = Object.entries(SOURCES).map(([name, source]) =>
  Object.assign(parseScheduleSource(source), { name }),
);
