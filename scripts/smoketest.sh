#!/usr/bin/env bash
#
# Smoke-test the built Next.js app: boot `next start`, hit a handful of
# critical routes, fail if anything 5xx's.
#
# Catches the broad class of route-handler module-load crashes (a missing
# polyfill, a top-level require that throws on import, a broken tRPC root
# router) before they reach a deployed environment. Won't catch
# Vercel-runtime-specific bugs — that's what the post-deploy preview-URL
# smoke workflow (.github/workflows/preview-smoke.yml) is for.
#
# Usage: scripts/smoketest.sh
# Requires: a prior `npm run build`.

set -euo pipefail

PORT="${SMOKETEST_PORT:-4099}"
READY_TIMEOUT_SECONDS="${SMOKETEST_READY_TIMEOUT:-60}"
HOST="http://127.0.0.1:${PORT}"
LOG_FILE="$(mktemp -t smoketest-server.XXXXXX.log)"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  if [[ "${SMOKE_OK:-0}" != "1" ]]; then
    echo "----- smoketest server log (last 80 lines) -----" >&2
    tail -n 80 "${LOG_FILE}" >&2 || true
  fi
  rm -f "${LOG_FILE}"
}
trap cleanup EXIT

# Boot `next start` in the background. Inherit env from the caller so CI
# can inject AUTH_SECRET / DATABASE_URL / dummies for env.js validation.
PORT="${PORT}" npm run start >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

# Wait for server readiness (or hard exit on crash).
deadline=$(( $(date +%s) + READY_TIMEOUT_SECONDS ))
while :; do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "smoketest: next start exited before reporting ready" >&2
    exit 1
  fi
  if grep -q "Ready in" "${LOG_FILE}" 2>/dev/null; then
    break
  fi
  if [[ $(date +%s) -ge ${deadline} ]]; then
    echo "smoketest: server did not become ready within ${READY_TIMEOUT_SECONDS}s" >&2
    exit 1
  fi
  sleep 0.5
done

# Endpoints to probe. Each is "label|method|path|expected-http-status-regex".
# auth.getConfiguredProviders is the canonical smoke target: it's public,
# reads only process.env, and is what gates the /signin OAuth buttons.
# This is the exact request that 500'd for ~27h after PR #100 merged.
PROBES=(
  "tRPC auth.getConfiguredProviders|GET|/api/trpc/auth.getConfiguredProviders?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D|^200$"
  "Landing page|GET|/|^200$"
)

fail=0
for probe in "${PROBES[@]}"; do
  IFS='|' read -r label method path expected <<<"${probe}"
  body_file="$(mktemp -t smoke-body.XXXXXX)"
  status=$(curl -sS --connect-timeout 5 --max-time 30 -o "${body_file}" -w "%{http_code}" -X "${method}" "${HOST}${path}" || echo "000")
  if [[ "${status}" =~ ${expected} ]]; then
    echo "✓ ${label} (${status})"
  else
    echo "✗ ${label} expected ${expected} got ${status}" >&2
    echo "  body (first 400 chars):" >&2
    head -c 400 "${body_file}" >&2
    echo >&2
    fail=1
  fi
  rm -f "${body_file}"
done

if [[ ${fail} -ne 0 ]]; then
  exit 1
fi

SMOKE_OK=1
echo "smoketest: all probes passed"
