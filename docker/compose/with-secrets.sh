#!/bin/sh
# Compose entrypoint for the app, scheduler and Mastra: load the secrets
# secrets-init generated, then exec the service's command.
#
#   entrypoint: ["/bin/sh", "/selfhost/with-secrets.sh"]
#   command: ["npm", "run", "start:selfhost"]
#
# The app also sets SELFHOST_MASTRA_HOST=mastra. Mastra (the Assistant) is
# opt-in behind the `assistant` profile, and an unset MASTRA_API_URL means "no
# Assistant", so MASTRA_API_URL is pointed at Mastra only when that service is
# part of this stack: its name resolves on the Compose network exactly when the
# profile is on. The app waits for Mastra to start when the profile is on
# (depends_on ... required: false), so there is no race. An explicit
# MASTRA_API_URL in the service's environment always wins.
set -eu

SECRETS_FILE="${SECRETS_FILE:-/selfhost-secrets/selfhost.env}"

if [ ! -r "$SECRETS_FILE" ]; then
  echo "[selfhost] $SECRETS_FILE is missing or unreadable: secrets-init must run first (docker compose up runs it)." >&2
  exit 1
fi
# shellcheck disable=SC1090 # generated at runtime by secrets-init.sh
. "$SECRETS_FILE"

if [ -n "${SELFHOST_MASTRA_HOST:-}" ] && [ -z "${MASTRA_API_URL:-}" ]; then
  if getent hosts "$SELFHOST_MASTRA_HOST" > /dev/null 2>&1; then
    export MASTRA_API_URL="http://$SELFHOST_MASTRA_HOST:${SELFHOST_MASTRA_PORT:-4111}"
    echo "[selfhost] The assistant profile is on: MASTRA_API_URL=$MASTRA_API_URL"
  else
    echo "[selfhost] The assistant profile is off: no Assistant (start with --profile assistant to add Mastra)."
  fi
fi

exec "$@"
