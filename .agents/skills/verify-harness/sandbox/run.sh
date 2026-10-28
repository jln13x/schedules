#!/usr/bin/env bash
# Builds the sandbox with the newest agent releases and runs the harness checks in it. Run it from
# the repository root; `sandbox/` below is short for `.agents/skills/verify-harness/sandbox/`.
#
#   bash sandbox/run.sh                     flag probe only, no credentials needed
#   MARKER=1 bash sandbox/run.sh            also one read and one edit run per agent; needs logins or keys
#   FRESH=1 bash sandbox/run.sh             rebuild the image to pick up new agent releases
#   bash sandbox/run.sh codex claude-code   limit marker runs to these agents
#   LOGINS=1 MARKER=1 bash sandbox/run.sh   copy this machine's Codex, Claude, OpenCode and Pi logins
#                                           into the container (copies, so refreshes don't touch yours)
#
# Logins made with login.sh (Cursor, OpenCode, Pi) are always used, and win over LOGINS=1.
set -euo pipefail
sandbox=$(cd "$(dirname "$0")" && pwd)
cd "$sandbox/../../../.."
image=agent-schedules-sandbox
stage=$(mktemp -d)
logins=$(mktemp -d)
sandbox_logins="${AGENT_SCHEDULES_SANDBOX_LOGINS:-$HOME/.agent-schedules-sandbox}"
mkdir -p "$sandbox_logins"

# The container writes as root, so its files are deleted or handed back from inside Docker.
cleanup() {
  docker run --rm -v "$logins:/logins" -v "$sandbox_logins:/own" --entrypoint sh "$image" \
    -c "rm -rf /logins/* /logins/.[!.]*; chown -R $(id -u):$(id -g) /own" >/dev/null 2>&1 || true
  rm -rf "$stage" "$logins"
}
trap cleanup EXIT

build=(docker build -t "$image" "$sandbox")
[[ "${FRESH:-0}" == "1" ]] && build+=(--no-cache --pull)
"${build[@]}"

# Only tracked files go in, so .env files, .vercel, .git and anything untracked stay out of the
# agents' reach.
git ls-files -cz | tar --null -T - --ignore-failed-read -cf - | tar -C "$stage" -xf -

# Agents sandbox their own commands with bubblewrap namespaces, which need SYS_ADMIN and relaxed
# profiles; see README.md for what that means.
run=(docker run --rm -v "$stage:/src:ro" -e "MARKER=${MARKER:-0}"
  --cap-add SYS_ADMIN --security-opt seccomp=unconfined --security-opt apparmor=unconfined)
[[ -f "$sandbox/.env" ]] && run+=(--env-file "$sandbox/.env")
# Logins made with login.sh are mounted as they are, so token refreshes are kept.
own=()
for login in cursor:.config/cursor:auth.json opencode:.local/share/opencode:auth.json pi:.pi:agent/auth.json; do
  IFS=: read -r name dir file <<<"$login"
  # Pi writes an empty {} before anyone signs in.
  if [[ -n "$(find "$sandbox_logins/$name/$file" -size +2c 2>/dev/null)" ]]; then
    run+=(-v "$sandbox_logins/$name:/root/$dir")
    own+=("$dir")
  fi
done
if [[ "${LOGINS:-0}" == "1" ]]; then
  # Only the login files: caches hold machine-specific helpers (Codex's sandbox binary) that break
  # in the container, and history doesn't belong in it.
  for file in .codex/auth.json .codex/config.toml .claude/.credentials.json \
    .local/share/opencode/auth.json .pi/agent/auth.json; do
    if [[ -f "$HOME/$file" ]]; then
      mkdir -p "$logins/$(dirname "$file")" && cp "$HOME/$file" "$logins/$file"
    fi
  done
  for dir in .codex .claude .local/share/opencode .pi; do
    if [[ -d "$logins/$dir" && " ${own[*]} " != *" $dir "* ]]; then
      run+=(-v "$logins/$dir:/root/$dir")
    fi
  done
fi
"${run[@]}" "$image" "$@"
