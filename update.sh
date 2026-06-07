#!/usr/bin/env bash
#
# Update the dashboard to the latest version and restart it.
# Run on the Pi:  ./update.sh
#
# Pulls the latest code (hard reset — the repo history may have been rewritten),
# reinstalls dependencies if they changed, and restarts the systemd service.
# Your .env and .token.json are gitignored and left untouched.
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="hubstaff-dashboard"
cd "$APP_DIR"

echo "• Fetching latest…"
git fetch origin

# Reinstall deps only if package files changed.
BEFORE="$(git rev-parse HEAD)"
git reset --hard origin/main
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  echo "• Already up to date ($AFTER)."
else
  echo "• Updated: $BEFORE -> $AFTER"
  if ! git diff --quiet "$BEFORE" "$AFTER" -- package.json package-lock.json 2>/dev/null; then
    echo "• Dependencies changed — running npm install…"
    npm install --no-audit --no-fund
  fi
fi

# Restart however it's running.
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}.service"; then
  echo "• Restarting service ${SERVICE_NAME}…"
  sudo systemctl restart "${SERVICE_NAME}"
  sleep 1
  systemctl is-active --quiet "${SERVICE_NAME}" && echo "  ✓ running" || {
    echo "  ✗ not running — check: journalctl -u ${SERVICE_NAME} -n 30 --no-pager"; exit 1;
  }
else
  echo "• No systemd service found. Restart manually: npm start"
fi

echo "Done."
