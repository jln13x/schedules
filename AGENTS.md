# agent-schedules

Schedules are recurring prompts for coding agents, kept as Markdown files in a repository's `.agents/schedules/`. This monorepo holds the `agent-schedules` CLI that pushes them into agents and apps, and schedules.sh, the directory where they are found.

## Layout

- `apps/cli`: the npm package `agent-schedules`. `src/cli.ts` wires the commands; `src/harness.ts` defines what a harness provides; `src/harnesses/` has one file per harness, named after it. The apps (t3, codex-desktop, claude-desktop) schedule tasks themselves; the command-line agents (codex, claude-code, pi, opencode, cursor-agent) only say how their CLI is started, and `harnesses/cron/` schedules and runs them with cron. `scripts/` holds the sandbox checks.
- `apps/web`: schedules.sh, Next.js with Drizzle on Postgres, deployed on Vercel. Listings are skills read hourly from skills.sh and judged by Jev (`src/lib/schedulable.ts`, `src/lib/skill-import.ts`); nothing is submitted on the site. Server code is Effect programs over the services in `src/db` and `src/lib`, run at pages, route handlers, and actions through `src/server/runtime.ts`; pages read through the `"use cache"` loaders in `src/server/cached.ts`, and a mutation revalidates their tag. Tests build their own runtime from `src/server/testing.ts`. UI primitives come from shadcn on Base UI (`components.json`, `src/components/ui`); `scripts/render-brand.tsx` regenerates the logo SVGs. `src/lib/docs.tsx` is the public documentation.
- `packages/format`: parses and writes the schedule file format; shared by both apps.
- `.agents/skills/verify-harness`: the verification skill, its check list, and the Docker sandbox that runs the newest agent releases.

## Working here

- Bun workspace. Root scripts: `bun run lint`, `bun run fmt:check`, `bun run typecheck`, `bun run knip`, `bun run test`. CI runs all of them on every push; run the ones your change can affect before handing off.
- The CLI and the web app's server code are written with Effect. Reach for its primitives (retry, schedules, timeouts, scoped resources, Schema) before hand-rolling control flow, and keep pure calculations plain TypeScript. Treat the installed `node_modules/effect` as the reference for its APIs.
- Comments explain reasons, constraints, and tradeoffs, not mechanics. Names carry the mechanics.
- A change to CLI behavior updates `apps/web/src/lib/docs.tsx` in the same change, and ships with a changeset (`bun changeset`). Keep implementation details that may change out of the public docs.
- A change to how an agent is invoked (`harnesses/<agent>.ts`) or to an app adapter needs a verification run: `bash .agents/skills/verify-harness/sandbox/run.sh` for the command-line agents, `/verify-harness <harness>` on a Mac for the desktop apps. Passing runs update `apps/cli/src/harnesses/verified.ts`.

## Constraints

- The site records nothing about who installs or schedules a skill; forms never record personal data, and Discord notifications carry none.
- The sponsor price lives only in Stripe, never in the UI. The sponsored row stays out of organic ranking, the search API, and `llms.txt`.
- Secrets come in through hidden-input wizards and `stdin`, never through chat, argv, or committed files.
- Verification work uses only `verify-*` schedules in a throwaway repository and never `--access full`.
