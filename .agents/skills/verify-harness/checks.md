# Verify every agent-schedules harness end to end

You are verifying the `agent-schedules` CLI on this machine, end to end, for every harness. Use the terminal for the CLI and computer use for the desktop apps. Your job is to find out what works and what doesn't, with evidence. Do not change implementation code and do not fix bugs you find: report them. The one file you may edit is `apps/cli/src/harnesses/verified.ts`, after a command-line agent passes.

## Ground rules

- Work only in a throwaway repository and only with schedules named `verify-*`. Never push, pull into, edit, or delete anything else, including tasks already in T3 Code, the Codex app, or the Claude app.
- Set `DO_NOT_TRACK=1` for every command so nothing is counted on schedules.sh.
- Never use `--access full`. Never run an agent in a real repository.
- If a harness's tool or app isn't installed, mark that harness SKIP with the reason `doctor` gives. Do not install anything.
- Clean up everything you created at the end, even if checks fail.
- Note the OS (`uname -a`, or `sw_vers` on macOS) at the top of the report. Run this once on macOS and once on Linux. `codex-desktop` and `claude-desktop` are verified on macOS only, so on Linux mark them n/a.

## Setup

1. Build the CLI from this repository and use the build, not npx, because the published npm version is older:
   ```sh
   cd <repo>/apps/cli && bun run build
   export AS="node <repo>/apps/cli/dist/cli.js"
   export DO_NOT_TRACK=1
   ```
2. Create a throwaway repository under your home folder, not under `/tmp`, because some agents' read-only sandboxes still allow writes to temp folders and that would hide a real violation: `mkdir -p $HOME/.agent-schedules-verify/repo && cd $HOME/.agent-schedules-verify/repo && git init -q && git commit -q --allow-empty -m init`. Run every command from there unless a step says otherwise.
3. Run `$AS doctor <harness>` for each of: `t3`, `codex-desktop`, `claude-desktop`, `codex`, `claude-code`, `pi`, `opencode`, `cursor-agent`. Save the output. A command-line agent counts as testable only when doctor says `preflight: ok`; one whose preflight failed is SKIP with doctor's reason, so sign-in problems never show up as run failures. OpenCode's preflight is skipped until a push sets `--model`; run its doctor again after check 13.
4. Pick a run time 5 minutes from now in local time, and today's cron weekday (0 is Sunday). Call it `M H`.
5. For each testable harness, write schedule files in `$HOME/.agent-schedules-verify/repo/.agents/schedules/`. The format is:
   ```md
   ---
   name: verify-<harness>-<variant>
   schedule: M H * * <today>
   ---

   <prompt>
   ```
   - For the five command-line agents (`codex`, `claude-code`, `pi`, `opencode`, `cursor-agent`), write two files per agent:
     - `verify-<agent>-read`, prompt: `Create a file named verify-<agent>-read.txt in the repository root containing the word ok. Whether or not that worked, then reply with the single line SCHEDULES-VERIFY-<agent>-read.` A read run is expected to refuse or fail the write; it should still reply.
     - `verify-<agent>-edit`, same prompt with `edit` instead of `read`.
   - For `t3`, `codex-desktop` and `claude-desktop`, write one file each, `verify-<harness>`, prompt: `Reply with the single line SCHEDULES-VERIFY-<harness>. Do not change any files.`

## Checks per harness

Record PASS, FAIL or SKIP for every check, with the command and the relevant output as evidence.

**For every harness**

1. **Dry run writes nothing.** `$AS push <harness> --all --dry-run` lists the creates, then `$AS list <harness>` shows none of them.
2. **No terminal, no names.** With the `verify-*` files not yet pushed, `echo | $AS push <harness>` fails with a message asking for `--all` or names, and creates nothing. (Once nothing is pending, a push without names succeeds quietly.)
3. **Push.** Push the harness's `verify-*` files (see the per-harness notes for flags; for command-line agents this is check 9, done now). Each prints `create`.
4. **Idempotent.** Push the same names again. Each is reported unchanged.
5. **Listed.** `$AS list <harness>` shows each task, the right time, and `active`.
6. **It runs.** Wait until 2 minutes after `M H` (10 minutes for `claude-desktop`, which can start a few minutes late). Confirm the run happened (see per-harness notes for where). For command-line agents, `$AS list <harness>` shows a last run for each task; the logs are in `jobs/<id>/logs/` under the state folder `$AS doctor <harness>` prints, and `jobs/<id>/last.json` names the latest one. Confirm the log contains the `SCHEDULES-VERIFY-…` line as the agent's reply, not only in the echoed prompt.
7. **Round trip.** Tasks belong to the repository they were pushed from, so pull back into the same one: copy `.agents/schedules/` to `$HOME/.agent-schedules-verify/originals`, delete the `verify-*` files from the repo, run `$AS pull <harness> --all`, then `diff -r $HOME/.agent-schedules-verify/originals .agents/schedules`. The files were written by this CLI, so the pulled ones must match byte for byte.
8. **Update.** In `$HOME/.agent-schedules-verify/repo`, move one task's minute forward by 1 and push it by name. It reports `update`, and `list` shows the new time.

**Command-line agents only** (`codex`, `claude-code`, `pi`, `opencode`, `cursor-agent`)

9. The first push (check 3) is `$AS push <agent> verify-<agent>-read --access read` and `$AS push <agent> verify-<agent>-edit --access edit`, by name. A later push with a different `--access` reports `update`.
10. **Read can't write.** After the run, `verify-<agent>-read.txt` does not exist, and the run finished rather than hanging (it has a last run within a few minutes).
11. **Edit can write.** `verify-<agent>-edit.txt` exists and contains `ok`.
12. **Access is remembered.** Change the read task's prompt slightly and push it again without `--access`. `$AS doctor <agent>` still shows `read access` for it.
13. **opencode needs a model.** Before the OpenCode tasks exist, `$AS push opencode verify-opencode-read --access read` without `--model` is blocked with a message about `--model`. Then push with `--model <a model you have configured in OpenCode>`; later pushes remember it.
14. **Crontab entry exists, then is gone after remove.** Before cleanup, confirm `crontab -l | grep agent-schedules` shows the job. After `$AS remove <agent> <names>`, the entries are gone, every line that isn't an agent-schedules entry is still there, and `list` shows nothing.
15. **macOS only:** record any permission prompt the first push or a run shows, such as one asking to let the terminal administer the computer, and whether the run could still sign in to the agent.

**t3**

- Push with a model if the project has no default: `$AS doctor t3` lists them. Pick a cheap one.
- The first push should add `$HOME/.agent-schedules-verify/repo` as a T3 project. Confirm it in the T3 Code app with computer use.
- Confirm the task appears in T3's scheduled tasks, runs at `M H`, and its run shows the `SCHEDULES-VERIFY-t3` reply.
- Clean up by deleting the task in the T3 app, and remove the `$HOME/.agent-schedules-verify/repo` project from T3 if the push added it.

**codex-desktop**

- The Codex app must be open. The push output should say whether the app loaded the task. If it says it can't confirm, check whether `sqlite3` is installed and record that.
- Confirm that the task appears on the app's Scheduled page, and that a run produces the reply. Computer use may refuse the Codex app; if so, ask the user to look and tell you what the app shows, and record that it came from them. If nobody can look, mark the app checks SKIP rather than pushing a task nobody can delete.
- `$AS push codex-desktop --all --model x` must be rejected because the app picks its own model.
- Clean up by deleting the automation in the Codex app, or asking the user to.

**claude-desktop**

- With the Claude app open, `$AS push claude-desktop --all` must be blocked with a message to quit the app. Record the message.
- Quit the app, push, then reopen it. Confirm with computer use that the task appears in the app's scheduled tasks.
- Record the permission-mode note the push printed. If the run waits for approval, record that, click **Run now**, and choose **Always allow** as the docs describe.
- Confirm a run produces the reply, and that `$AS list claude-desktop` shows a last run.
- `--access read` and `--model x` must both be rejected for this harness.
- Clean up by deleting the task in the Claude app.

**Across harnesses**

- `$AS remove t3 verify-t3` must be refused with a message that app tasks are removed in the app.
- `$AS list` with no harness lists every harness that has tasks for `$HOME/.agent-schedules-verify/repo` and skips harnesses that aren't set up, without erroring.
- `$AS list --all` from `/tmp` lists the command-line tasks with their repository.
- `$AS push codex --global --all --dry-run` from inside `$HOME/.agent-schedules-verify/repo` reads `~/.agents/schedules` instead of the repo. Dry run only.
- Docs drift: open https://schedules.sh/docs/harnesses and https://schedules.sh/docs/cli. List any statement that doesn't match what you observed.

## Cleanup

1. `$AS remove <agent> <all verify names>` for every command-line agent you pushed to.
2. Delete the `verify-*` tasks in T3 Code, the Codex app and the Claude app.
3. Confirm no crontab entries remain (check 14), and `$AS list --all` shows no `verify-*` tasks.
4. `rm -rf $HOME/.agent-schedules-verify/repo $HOME/.agent-schedules-verify/originals`.

## Report

Finish with:

1. A table: one row per harness, one column per check, each cell PASS, FAIL, SKIP or n/a.
2. For every FAIL: the exact command, what you expected, what happened, and the output.
3. Anything surprising even if it passed, such as a run that took much longer than expected, a confusing message, or a prompt waiting for approval.
4. Docs statements that don't match what you saw.
5. Confirmation that cleanup is complete, or exactly what is left behind.
