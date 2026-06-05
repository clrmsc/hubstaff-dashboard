#!/usr/bin/env bash
#
# Hubstaff Mini Dashboard — installer for Raspberry Pi (and other Debian/Ubuntu boxes).
#
# Usage:
#   git clone https://github.com/clrmsc/hubstaff-dashboard.git
#   cd hubstaff-dashboard
#   ./install.sh
#
# What it does:
#   1. Checks that Node.js is installed (does NOT install it).
#   2. Installs npm dependencies.
#   3. Creates .env from the template (and asks for your Hubstaff token).
#   4. Optionally installs a systemd service so the dashboard starts on boot.
#   5. Optionally sets up a fullscreen browser kiosk on login.
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_USER="${SUDO_USER:-$(id -un)}"
SERVICE_NAME="hubstaff-dashboard"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
info() { printf '  • %s\n' "$1"; }
ask()  { local p="$1" d="${2:-y}" a; read -r -p "$p [$d] " a || true; echo "${a:-$d}"; }

bold "Hubstaff Mini Dashboard installer"
echo "App dir: $APP_DIR"
echo "Run as user: $RUN_USER"
echo

# --- 1. Node.js (check only) --------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  bold "1/5 Node.js not found"
  echo "  Node.js is required. Install it, e.g.:" >&2
  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs" >&2
  exit 1
fi
bold "1/5 Node.js found: $(node -v)"

# --- 2. Dependencies ----------------------------------------------------------
bold "2/5 Installing npm dependencies…"
( cd "$APP_DIR" && npm install --no-audit --no-fund )

# --- 3. .env ------------------------------------------------------------------
bold "3/5 Configuration (.env)"
if [ -f "$APP_DIR/.env" ]; then
  info ".env already exists — leaving it as is."
else
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  info "Created .env from template."
  token="$(ask 'Paste your Hubstaff Personal Access Token (or leave blank to edit later):' '')"
  if [ -n "$token" ]; then
    # set USE_MOCK=false and the token
    sed -i "s/^USE_MOCK=.*/USE_MOCK=false/" "$APP_DIR/.env"
    sed -i "s|^HUBSTAFF_PAT=.*|HUBSTAFF_PAT=$token|" "$APP_DIR/.env"
    info "Token saved to .env (USE_MOCK=false)."
  else
    info "Edit $APP_DIR/.env later: set USE_MOCK=false and HUBSTAFF_PAT=…"
  fi
fi

# --- 4. systemd service -------------------------------------------------------
bold "4/5 Auto-start on boot (systemd)"
if [ "$(ask 'Install systemd service so the dashboard runs on boot?' 'y')" = "y" ]; then
  NODE_BIN="$(command -v node)"
  sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Hubstaff Mini Dashboard
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5
User=$RUN_USER
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now "${SERVICE_NAME}.service"
  info "Service installed. Status: sudo systemctl status ${SERVICE_NAME}"
  info "Logs:               journalctl -u ${SERVICE_NAME} -f"
else
  info "Skipped. Run manually with: npm start"
fi

# --- 5. Kiosk -----------------------------------------------------------------
bold "5/5 Fullscreen kiosk on login (optional)"
if [ "$(ask 'Set up a fullscreen browser kiosk on desktop login?' 'y')" = "y" ]; then
  PORT="$(grep -E '^PORT=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2)"; PORT="${PORT:-3000}"
  URL="http://localhost:${PORT}"

  # Pick an available browser.
  if command -v chromium-browser >/dev/null 2>&1; then
    KIOSK_CMD="chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito $URL"
  elif command -v chromium >/dev/null 2>&1; then
    KIOSK_CMD="chromium --kiosk --noerrdialogs --disable-infobars --incognito $URL"
  elif command -v firefox >/dev/null 2>&1; then
    KIOSK_CMD="firefox --kiosk $URL"
  else
    KIOSK_CMD=""
  fi

  if [ -z "$KIOSK_CMD" ]; then
    info "No browser found. Install one: sudo apt-get install -y chromium-browser"
  else
    # Try the common autostart locations across Pi OS versions.
    HOME_DIR="$(eval echo "~$RUN_USER")"
    WROTE=0
    # Wayland / labwc (Pi OS Bookworm default)
    if [ -d "$HOME_DIR/.config/labwc" ] || command -v labwc >/dev/null 2>&1; then
      mkdir -p "$HOME_DIR/.config/labwc"
      { echo "#!/bin/sh"; echo "$KIOSK_CMD &"; } >> "$HOME_DIR/.config/labwc/autostart"
      chmod +x "$HOME_DIR/.config/labwc/autostart" 2>/dev/null || true
      WROTE=1; info "Added kiosk to ~/.config/labwc/autostart"
    fi
    # X11 / LXDE (older Pi OS)
    if [ -d "$HOME_DIR/.config/lxsession" ] || command -v lxsession >/dev/null 2>&1; then
      AUTO="$HOME_DIR/.config/lxsession/LXDE-pi/autostart"
      mkdir -p "$(dirname "$AUTO")"
      echo "@$KIOSK_CMD" >> "$AUTO"
      WROTE=1; info "Added kiosk to $AUTO"
    fi
    if [ "$WROTE" = 0 ]; then
      info "Could not detect the desktop autostart. Launch manually:"
      info "  $KIOSK_CMD"
    else
      info "Kiosk will start on next desktop login (reboot to test)."
    fi
    chown -R "$RUN_USER":"$RUN_USER" "$HOME_DIR/.config" 2>/dev/null || true
  fi
else
  info "Skipped."
fi

echo
bold "Done."
PORT="$(grep -E '^PORT=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2)"; PORT="${PORT:-3000}"
echo "Dashboard: http://localhost:${PORT}"
