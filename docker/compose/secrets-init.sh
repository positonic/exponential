#!/bin/sh
# Compose `secrets-init`: generate the install's secrets once, never overwrite.
#
# Writes $SECRETS_FILE (default /selfhost-secrets/selfhost.env, on a named
# volume) as `export KEY='value'` lines that with-secrets.sh sources before
# each service starts:
#
#   AUTH_SECRET              signs sessions and the app <-> Mastra tokens
#   DATABASE_ENCRYPTION_KEY  base64 of 32 random bytes; encrypts stored
#                            integration credentials
#   CRON_SECRET              the scheduler's bearer secret for the cron routes
#
# A key already in the file is kept as it is: rotating AUTH_SECRET signs
# everyone out, and rotating DATABASE_ENCRYPTION_KEY makes every stored
# credential unreadable. Only missing keys are added, so a later version can
# add a secret without touching the existing ones. The file is replaced
# atomically (write a temp file, then rename), so an interrupted run never
# leaves a half-written file behind.
#
# POSIX sh plus head, base64 and tr: runs on busybox (alpine) and macOS.
set -eu

SECRETS_FILE="${SECRETS_FILE:-/selfhost-secrets/selfhost.env}"
# The uid:gid the app, scheduler and Mastra images run as (the `node` user).
SECRETS_OWNER="${SECRETS_OWNER:-1000:1000}"

random_base64() {
  # `tr -d '\n'`: some base64 implementations wrap long output.
  head -c "$1" /dev/urandom | base64 | tr -d '\n'
}

has_key() {
  [ -f "$SECRETS_FILE" ] && grep -q "^export $1=" "$SECRETS_FILE"
}

mkdir -p "$(dirname "$SECRETS_FILE")"
tmp="$SECRETS_FILE.tmp.$$"
trap 'rm -f "$tmp"' EXIT

if [ -f "$SECRETS_FILE" ]; then
  cp "$SECRETS_FILE" "$tmp"
else
  : > "$tmp"
fi

added=""
for key in AUTH_SECRET DATABASE_ENCRYPTION_KEY CRON_SECRET; do
  if has_key "$key"; then
    continue
  fi
  printf "export %s='%s'\n" "$key" "$(random_base64 32)" >> "$tmp"
  added="$added $key"
done

if [ -z "$added" ]; then
  echo "[secrets-init] Keeping the existing secrets in $SECRETS_FILE (nothing generated)."
  exit 0
fi

chmod 0400 "$tmp"
# Best effort: the owner only matters when the services run as a non-root user
# (they do, in the images). Running this script outside a container as an
# ordinary user, chown is not permitted and not needed.
chown "$SECRETS_OWNER" "$tmp" 2>/dev/null || true
mv -f "$tmp" "$SECRETS_FILE"
trap - EXIT
echo "[secrets-init] Generated$added in $SECRETS_FILE. Back this volume up: losing it signs everyone out and makes stored credentials unreadable."
