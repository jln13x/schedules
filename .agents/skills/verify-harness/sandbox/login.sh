#!/usr/bin/env bash
# shellcheck disable=SC2034 # ENV_FILE and TOTAL_STAGES are read by wizard.sh
set -euo pipefail
# shellcheck source=wizard.sh
source "$(dirname "$0")/wizard.sh"

# Signs agents in inside the sandbox image, with your subscription logins instead of API keys. The
# logins live in ~/.agent-schedules-sandbox, outside the repo, and run.sh mounts them into every run.
#
# Run from the repository root as `bash .agents/skills/verify-harness/sandbox/login.sh`:
#
#   login.sh                Cursor, OpenCode and Pi
#   login.sh cursor-agent   just these
#   login.sh callback       finish a sign-in whose browser ended on a 127.0.0.1:1455 page that
#                           didn't load; it asks for that page's address

cd "$(dirname "$0")"
ENV_FILE=.env
IMAGE="agent-schedules-sandbox"
LOGINS_DIR="${AGENT_SCHEDULES_SANDBOX_LOGINS:-$HOME/.agent-schedules-sandbox}"

# The agent waits for that address inside its container, where a browser elsewhere can't reach it.
# The address holds a one-time code, so it goes in hidden and reaches curl through stdin, not argv.
if [[ "${1:-}" == "callback" ]]; then
  container=$(docker ps -q --filter "ancestor=$IMAGE" | head -n1)
  [[ -n "$container" ]] || { printf 'no sign-in is waiting; start one with bash .agents/skills/verify-harness/sandbox/login.sh\n' >&2; exit 1; }
  ask_secret ADDRESS "Paste the address the browser ended on (hidden):"
  printf 'url = "%s"\n' "$ADDRESS" | docker exec -i "$container" curl -fsS -o /dev/null -K - \
    && printf 'sent; the sign-in should finish in the other terminal\n'
  exit
fi

AGENTS=("$@")
(( ${#AGENTS[@]} )) || AGENTS=(cursor-agent opencode pi)

for agent in "${AGENTS[@]}"; do
  case "$agent" in
    cursor-agent | opencode | pi) ;;
    *) printf 'unknown agent %s: use cursor-agent, opencode or pi\n' "$agent" >&2; exit 1 ;;
  esac
done

# Runs one command in the sandbox with the login folders mounted, as run.sh does.
in_sandbox() {
  local tty=()
  [[ -t 0 ]] && tty=(-it)
  docker run --rm "${tty[@]}" -e NO_OPEN_BROWSER=1 \
    -v "$LOGINS_DIR/cursor:/root/.config/cursor" \
    -v "$LOGINS_DIR/opencode:/root/.local/share/opencode" \
    -v "$LOGINS_DIR/pi:/root/.pi" \
    --entrypoint "$1" "$IMAGE" "${@:2}"
}

wants() { [[ " ${AGENTS[*]} " == *" $1 "* ]]; }

# The container runs as root, so what it writes into the login folders is handed back to you.
trap 'docker run --rm -v "$LOGINS_DIR:/l" --entrypoint chown "$IMAGE" -R "$(id -u):$(id -g)" /l >/dev/null 2>&1 || true' EXIT

TOTAL_STAGES=$((1 + ${#AGENTS[@]} + 1))

banner "Sign agents in for the sandbox"

stage "Prepare the sandbox"
say "Logins are kept in $LOGINS_DIR, readable only by you."
mkdir -p "$LOGINS_DIR/cursor" "$LOGINS_DIR/opencode" "$LOGINS_DIR/pi"
chmod 700 "$LOGINS_DIR"
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  printf '  %s✓%s sandbox image found\n' "$GREEN" "$RESET"
else
  say "Building the sandbox image with the newest agents. This takes a few minutes."
  docker build -t "$IMAGE" .
fi
pause

if wants cursor-agent; then
  stage "Cursor: sign in with the account for verification"
  current=$(in_sandbox cursor-agent status 2>&1 </dev/null || true)
  if grep -qi "logged in as" <<<"$current"; then
    note "$current"
    if confirm "Sign out and use a different Cursor account?"; then
      in_sandbox cursor-agent logout </dev/null
    fi
  fi
  if ! grep -qi "logged in as" <<<"$(in_sandbox cursor-agent status 2>&1 </dev/null || true)"; then
    step "Cursor prints a sign-in link. Open it in your browser and sign in with the new account."
    step "Come back here once the browser says you're signed in; Cursor notices by itself."
    in_sandbox cursor-agent login
  fi
  status=$(in_sandbox cursor-agent status 2>&1 </dev/null || true)
  if grep -qi "logged in as" <<<"$status"; then
    printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$(grep -i "logged in as" <<<"$status")"
  else
    warn "Cursor still isn't signed in: $status"
    SKIPPED+=("Cursor sign-in (re-run: bash .agents/skills/verify-harness/sandbox/login.sh cursor-agent)")
  fi
  pause
fi

if wants opencode; then
  stage "OpenCode: sign in with ChatGPT"
  step "Pick OpenAI, then 'ChatGPT Pro/Plus (headless)'."
  step "Open the link it shows in your browser, enter the code, and sign in."
  note "If you pick the browser option and it keeps waiting, run bash .agents/skills/verify-harness/sandbox/login.sh callback"
  note "in another terminal and give it the address the browser ended on."
  in_sandbox opencode auth login || true
  if in_sandbox opencode auth list 2>&1 </dev/null | grep -q "\b0 credentials\b"; then
    warn "OpenCode has no credentials yet."
    SKIPPED+=("OpenCode sign-in (re-run: bash .agents/skills/verify-harness/sandbox/login.sh opencode)")
  else
    printf '  %s✓%s OpenCode is signed in\n' "$GREEN" "$RESET"
    say "Models your ChatGPT login can use:"
    in_sandbox opencode models openai 2>/dev/null </dev/null | sed 's/^/    /' | head -20 || true
    ask AS_MODEL_OPENCODE "Model for OpenCode runs [openai/gpt-6.1-sol]:"
    write_env AS_MODEL_OPENCODE "${AS_MODEL_OPENCODE:-openai/gpt-6.1-sol}"
  fi
  pause
fi

if wants pi; then
  stage "Pi: sign in with your subscription"
  say "Pi opens its own screen. In it:"
  step "Type /login and pick the provider your subscription is with, such as ChatGPT."
  step "Open the link it shows and sign in. The browser then lands on a page that doesn't load."
  step "Copy that page's whole address from the address bar and paste it into Pi's prompt."
  step "Once Pi says you're signed in, type /quit."
  pause "Press Enter to open Pi"
  in_sandbox pi || true
  models=$(in_sandbox pi --list-models 2>&1 </dev/null || true)
  if grep -q "^provider" <<<"$models"; then
    printf '  %s✓%s Pi is signed in. Models it can use:\n' "$GREEN" "$RESET"
    sed 's/^/    /' <<<"$models" | head -20
    ask AS_MODEL_PI "Model for Pi runs as provider/model, or Enter for Pi's default:"
    if [[ -n "${AS_MODEL_PI:-}" ]]; then
      write_env AS_MODEL_PI "$AS_MODEL_PI"
    fi
  else
    warn "Pi has no models yet, so the sign-in didn't finish."
    SKIPPED+=("Pi sign-in (re-run: bash .agents/skills/verify-harness/sandbox/login.sh pi)")
  fi
  pause
fi

stage "Run the sandbox"
say "Every sandbox run now uses these logins. To run each agent for real:"
step "MARKER=1 bash .agents/skills/verify-harness/sandbox/run.sh ${AGENTS[*]}"
note "Codex and Claude Code still come from this machine with LOGINS=1."
note "To sign out, re-run this wizard, or delete $LOGINS_DIR with: docker run --rm -v $LOGINS_DIR:/l --entrypoint rm $IMAGE -rf /l/cursor /l/opencode /l/pi"
pause "Press Enter to finish"

finish
