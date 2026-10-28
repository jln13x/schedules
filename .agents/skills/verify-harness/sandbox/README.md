# Harness sandbox

A disposable Docker image with the newest release of every command-line agent, used to find out
whether an agent update broke the CLI before a user does. Run everything from the repository root.

```sh
bash .agents/skills/verify-harness/sandbox/run.sh                  # flag probe: every flag the CLI passes still exists. Free.
MARKER=1 bash .agents/skills/verify-harness/sandbox/run.sh         # plus one read and one edit run per signed-in agent. Calls models.
FRESH=1 bash .agents/skills/verify-harness/sandbox/run.sh          # rebuild to pick up new agent releases.
bash .agents/skills/verify-harness/sandbox/run.sh codex pi         # limit the marker runs to these agents.
```

## Signing agents in

`bash .agents/skills/verify-harness/sandbox/login.sh` signs Cursor, OpenCode and Pi in inside the image with your subscription
logins. They are kept in `~/.agent-schedules-sandbox`, outside the repository, and every run mounts
them. Codex and Claude Code use this machine's logins when you pass `LOGINS=1`; only their login
files are copied in, and the copies are deleted afterwards.

To use API keys instead, `bash .agents/skills/verify-harness/sandbox/setup-env.sh` saves one OpenAI or Anthropic key to the gitignored
`.env` next to this file, which `docker run` reads as its environment. The marker runs also read
`AS_MODEL_<AGENT>` from it, such as `AS_MODEL_OPENCODE=openai/gpt-6.1-sol`; OpenCode needs one,
the others fall back to their defaults.

## What the container can do

It gets `SYS_ADMIN` with seccomp and AppArmor off, because Codex sandboxes its own commands with
bubblewrap namespaces and can't otherwise. That weakens the boundary between the container and this
machine, so only the repository's tracked files and the login files go in, and the image is thrown
away after each run.

## Keeping the record

`apps/cli/scripts/check-versions.ts` says which agents have an npm release newer than the one in
`apps/cli/src/harnesses/verified.ts`; Cursor isn't on npm, so its installed version is compared
instead. After a marker run passes against a new release, update that file. `doctor` tells users
when their installed agent is newer than the verified one.

Desktop apps (T3 Code, Codex, Claude) can't run here. Verify those on a Mac with the
`/verify-harness` skill next to this folder.
