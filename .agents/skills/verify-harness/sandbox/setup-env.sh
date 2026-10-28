#!/usr/bin/env bash
# shellcheck disable=SC2034 # ENV_FILE and TOTAL_STAGES are read by wizard.sh
# Saves one API key for OpenCode and Pi marker runs to .env here, after checking it works.
set -euo pipefail
# shellcheck source=wizard.sh
source "$(dirname "$0")/wizard.sh"

TOTAL_STAGES=3
set +x
umask 077
trap 'printf "%sSetup stopped. Anything already saved stays in .env; rerun to continue.%s\n" "$RED" "$RESET" >&2' ERR
PROJECT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../../.." && pwd)
ENV_FILE="$(dirname -- "${BASH_SOURCE[0]}")/.env"
[[ -t 0 ]] || { say "Run this wizard in an interactive terminal."; exit 1; }
command -v curl >/dev/null 2>&1 || { say "Install curl first."; exit 1; }

# ask_secret keeps an old value on Enter; a key is always entered fresh here.
read_secret() {
  local key="$1" prompt="$2" input
  printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  read -rs input || true
  printf '\n'
  printf -v "$key" '%s' "$input"
}

banner "agent-schedules sandbox: an API key for OpenCode and Pi"

stage "Choose a provider"
say "OpenCode and Pi read a standard API key from the environment, so one key covers both."
say "Codex and Claude Code don't need one here: the sandbox copies their logins with LOGINS=1."
say "Each marker run is a tiny prompt on a small model, so a full run costs a few cents."
if confirm "Use Anthropic? (No uses OpenAI)"; then
  PROVIDER=anthropic VAR=ANTHROPIC_API_KEY MODEL=anthropic/claude-haiku-5-5
  KEYS_URL=https://console.anthropic.com/settings/keys
else
  PROVIDER=openai VAR=OPENAI_API_KEY MODEL=openai/gpt-4.1-mini
  KEYS_URL=https://platform.openai.com/api-keys
fi
say "Runs will use $MODEL."
pause

stage "Create and check the key"
open_url "$KEYS_URL"
step "Create a new key named agent-schedules-sandbox. A spending limit on it is a good idea."
step "Copy the key."
read_secret API_KEY "Paste the key (hidden):"
[[ -n "$API_KEY" ]] || { say "No key entered. Nothing was saved."; exit 1; }
say "Checking the key by listing models. This costs nothing."
# The key goes to curl through stdin so it never shows up in process arguments.
if [[ "$PROVIDER" == anthropic ]]; then
  status=$(printf 'header = "x-api-key: %s"\n' "$API_KEY" | curl -s -o /dev/null -w '%{http_code}' -K - \
    -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/models)
else
  status=$(printf 'header = "Authorization: Bearer %s"\n' "$API_KEY" | curl -s -o /dev/null -w '%{http_code}' -K - \
    https://api.openai.com/v1/models)
fi
if [[ "$status" != 200 ]]; then
  say "The provider rejected the key (HTTP $status). Nothing was saved; rerun to try again."
  exit 1
fi
say "The key works."
write_env "$VAR" "$API_KEY"
write_env AS_MODEL_OPENCODE "$MODEL"
write_env AS_MODEL_PI "$MODEL"
unset API_KEY
pause

stage "Run the sandbox"
say "This rebuilds the image with the newest agents and runs every agent that has a login or key."
if confirm "Run it now? It takes a few minutes."; then
  cd "$PROJECT_DIR"
  FRESH=1 LOGINS=1 MARKER=1 bash .agents/skills/verify-harness/sandbox/run.sh || warn "some checks failed; the table above says which"
else
  SKIPPED+=("run later: FRESH=1 LOGINS=1 MARKER=1 bash .agents/skills/verify-harness/sandbox/run.sh")
fi
finish
