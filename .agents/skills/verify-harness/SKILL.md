---
name: verify-harness
description: Verify one agent-schedules harness end to end on this machine — t3, codex-desktop, claude-desktop, or a command-line agent (codex, claude-code, pi, opencode, cursor-agent). Pushes verify-* schedules from a throwaway repo, watches a real run, pulls them back, cleans up, and reports PASS/FAIL per check. Use before a release, after the app or agent updated, or when `doctor` says the installed version is unverified. Usage: /verify-harness <harness>
---

# Verify a harness

You are verifying the `agent-schedules` CLI against one harness on this machine, with evidence. Do not change implementation code and do not fix bugs you find: report them; the only file you may edit is `apps/cli/src/harnesses/verified.ts`, after a pass. The harness is the argument; if none was given, ask which one.

## Before you start

1. `cd` to the repository root (the one containing `apps/cli`) and build the CLI: `cd apps/cli && bun run build`. Use the build for every command, as `AS`, and never npx:
   ```sh
   export AS="node <repo>/apps/cli/dist/cli.js"
   export DO_NOT_TRACK=1
   ```
2. `codex-desktop` and `claude-desktop` are verified on macOS only; on any other OS, stop and report n/a. Run `$AS doctor <harness>` and read it. If it says the harness isn't set up (app not installed, agent not on PATH, or a failed `preflight`), stop and report that with doctor's output. Don't install or sign in to anything.
3. Note the OS and the harness version: `sw_vers` or `uname -a`, the agent's `--version`, or the app's version from its About window.
4. Create the throwaway repository under your home folder (not `/tmp`, where some read-only sandboxes still allow writes) and work only there:
   ```sh
   mkdir -p $HOME/.agent-schedules-verify/repo && cd $HOME/.agent-schedules-verify/repo && git init -q && git commit -q --allow-empty -m init
   ```

## What to run

Follow `checks.md` next to this file, but only the parts for this harness: the "Setup" section, the "For every harness" checks, the section for this harness, and "Cleanup". Skip the other harnesses and the "Across harnesses" section.

Ground rules from that file apply: only `verify-*` names, never `--access full`, never touch tasks you didn't create, clean up even when checks fail.

For the desktop apps, use computer use to confirm what the app shows, and say what you saw. Screenshots count as evidence. Computer use may refuse some apps, such as Codex; then ask the user to check the app and report what they saw.

## Report

Finish with:

1. The harness, OS, and harness version.
2. A table of every check with PASS, FAIL, or SKIP and one line of evidence.
3. For each FAIL: the exact command, what was expected, and the output.
4. Anything that looked wrong even if it passed.
5. Statements in `apps/web/src/lib/docs.tsx` (the Harnesses page) that didn't match what you saw.
6. Confirmation that cleanup is complete, or exactly what is left.

## If everything passed

For a command-line agent, update its entry in `apps/cli/src/harnesses/verified.ts` to the version you tested and today's date, and say so in the report. For a desktop app, there is no version file; the report is the record.
