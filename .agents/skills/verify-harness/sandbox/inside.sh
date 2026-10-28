#!/usr/bin/env bash
# Runs inside the sandbox image. The repository's tracked files are mounted read-only at /src and
# copied here, so this Linux build gets its own node_modules.
set -euo pipefail

cp -R /src/. /work/
cd /work
bun install --frozen-lockfile >/dev/null

echo "== agent versions vs verified"
bun apps/cli/scripts/check-versions.ts || echo "   (newer releases exist; the checks below run against them)"

echo
echo "== flag probe (no model calls)"
probe=0
bun apps/cli/scripts/probe-flags.ts || probe=$?

if [[ "${MARKER:-0}" == "1" ]]; then
  echo
  echo "== marker runs (calls each agent once per schedule)"
  bun apps/cli/scripts/marker-run.ts "$@"
else
  echo
  echo "Marker runs skipped. Sign in with bash .agents/skills/verify-harness/sandbox/login.sh, then: MARKER=1 bash .agents/skills/verify-harness/sandbox/run.sh"
fi
exit $probe
