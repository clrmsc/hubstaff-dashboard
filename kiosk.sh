#!/usr/bin/env bash
#
# Launch the dashboard fullscreen in a browser kiosk.
# Run on the Pi's desktop session:  ./kiosk.sh
#
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="$(grep -E '^PORT=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2)"; PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

if command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito "$URL"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium --kiosk --noerrdialogs --disable-infobars --incognito "$URL"
elif command -v firefox >/dev/null 2>&1; then
  exec firefox --kiosk "$URL"
else
  echo "No browser found. Install one, e.g.: sudo apt-get install -y chromium-browser" >&2
  exit 1
fi
