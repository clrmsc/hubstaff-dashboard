# Hubstaff Mini Dashboard

A tiny team-activity dashboard in the style of Hubstaff, meant to run on a
Raspberry Pi 5 and display in a fullscreen browser (kiosk).

Shows, per team member:

- name with a status dot — **green = online**, **grey = offline** (offline members sink to the bottom)
- **Today** — activity % and hours worked
- **This week** — activity % and total hours
- **7 bars** — daily activity for the current week (today is highlighted)

The browser polls the local server once a minute; the server caches and talks
to the Hubstaff API no more often than `CACHE_TTL_SEC`.

---

## Quick start (try the UI with fake data)

```bash
cp .env.example .env      # USE_MOCK=true is the default
npm install
npm start
```

Open <http://localhost:3000>. You'll see demo data — no Hubstaff needed.

## Connect the real Hubstaff API

1. Go to <https://developer.hubstaff.com/> → create an app → grab a
   **Personal Access Token**. (The account must be **Owner/Manager** to see the
   whole team.)
2. Edit `.env`:
   ```
   USE_MOCK=false
   HUBSTAFF_PAT=<your personal access token>
   HUBSTAFF_ORG_ID=<optional; first org used if blank>
   HUBSTAFF_TZ=Europe/Moscow
   ```
3. `npm start`.

Despite its name, the Personal Access Token is a long-lived **refresh token**.
The server exchanges it for a short-lived (~24h) access token and caches that in
`.token.json` (gitignored). The exchange endpoint is **rate-limited**, so the
cache matters — don't delete `.token.json` repeatedly. If you get a persistent
token error, paste a fresh token into `.env` and delete `.token.json` once.

### Settings (.env)

| Variable               | Default         | Meaning                                            |
| ---------------------- | --------------- | -------------------------------------------------- |
| `USE_MOCK`             | `true`          | `false` to hit the real Hubstaff API               |
| `HUBSTAFF_PAT`         | —               | Personal Access Token from developer.hubstaff.com  |
| `HUBSTAFF_ORG_ID`      | —               | organization id (auto-picks first org if empty)    |
| `HUBSTAFF_TZ`          | `Europe/Moscow` | timezone for "today"/weekly day boundaries         |
| `ONLINE_THRESHOLD_MIN` | `15`            | minutes since last activity slot to still count online (≥13 — Hubstaff slots lag ~10 min) |
| `CACHE_TTL_SEC`        | `60`            | min seconds between Hubstaff calls                 |
| `PORT`                 | `3000`          | web port                                           |

---

## Running on Raspberry Pi 5

### Easy way — one command

```bash
git clone https://github.com/clrmsc/hubstaff-dashboard.git
cd hubstaff-dashboard
./install.sh
```

`install.sh` checks that Node is present, installs dependencies, creates `.env`
(asking for your Hubstaff token), and offers to install a **systemd service**
(auto-start on boot) and a **fullscreen kiosk** on desktop login. Re-running it
is safe. (It does not install Node — assumed already present.)

Useful afterwards:

```bash
sudo systemctl status hubstaff-dashboard   # is it running?
journalctl -u hubstaff-dashboard -f        # live logs
./kiosk.sh                                  # launch the kiosk manually
```

### Updating

```bash
cd ~/hubstaff-dashboard
./update.sh
```

`update.sh` pulls the latest code (hard reset — repo history may have been
rewritten), reinstalls dependencies only if they changed, and restarts the
service. Your `.env` and `.token.json` are left untouched.

### Manual way

```bash
# 1. Node (once)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. App
git clone https://github.com/clrmsc/hubstaff-dashboard.git
cd hubstaff-dashboard
cp .env.example .env   # set USE_MOCK=false and HUBSTAFF_PAT=...
npm install
npm start              # http://localhost:3000

# 3. Kiosk
chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:3000
# or: firefox --kiosk http://localhost:3000
```

For auto-start on boot without the installer, create
`/etc/systemd/system/hubstaff-dashboard.service`:

```ini
[Unit]
Description=Hubstaff Mini Dashboard
After=network-online.target

[Service]
WorkingDirectory=/home/pi/hubstaff-dashboard
ExecStart=/usr/bin/node server.js
Restart=always
User=pi
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now hubstaff-dashboard
```

---

## How it maps to Hubstaff data

- **online/offline** — derived from the most recent activity time slot vs. `ONLINE_THRESHOLD_MIN`
- **hours** — `tracked` seconds from the daily-activities endpoint, summed per day / week
- **activity %** — `overall` (input activity) ÷ `tracked`

The data mapping lives in one place — `shapeDashboard()` in `hubstaff.js`. If the
first real API response has slightly different field names, that's the only
function to tweak.
