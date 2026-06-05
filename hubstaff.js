// Hubstaff API v2 client.
//
// Auth: the Hubstaff "Personal Access Token" is a long-lived *refresh token*. We exchange
// it at https://account.hubstaff.com/access_tokens for a short-lived (~24h) access token,
// which is then sent as `Authorization: Bearer`. The exchange itself is RATE LIMITED, so we
// cache the access token (and its expiry) to .token.json and only re-exchange when it's
// about to expire.
//
// Data:
//   - members + users   -> name, avatar
//   - projects          -> project id -> name
//   - daily activities  -> hours (tracked) + activity % (overall/tracked) per day
//   - recent activities -> "working now" (online) + current project
//
// Field mapping lives in shapeDashboard() — the one place to tweak if the API shifts.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_BASE = "https://account.hubstaff.com";
const API_BASE = "https://api.hubstaff.com/v2";
const TOKEN_FILE = path.join(__dirname, ".token.json");
// Org timezone — daily `date` strings are in org-local time. Defaults to Moscow (RUB team).
const ORG_TZ = process.env.HUBSTAFF_TZ || "Europe/Moscow";

let memo = { accessToken: null, expiresAt: 0, refreshToken: null };
// Backoff so we never call the (rate-limited) refresh endpoint more than once per window,
// no matter how many dashboard requests come in.
const REFRESH_BACKOFF_MS = 5 * 60_000;
let refreshBlockedUntil = 0;
let lastRefreshError = null;

async function loadTokenFile() {
  try {
    return JSON.parse(await readFile(TOKEN_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveTokenFile(data) {
  await writeFile(TOKEN_FILE, JSON.stringify(data, null, 2));
}

async function getAccessToken() {
  // 1) Valid in-memory token?
  if (memo.accessToken && Date.now() < memo.expiresAt - 60_000) return memo.accessToken;

  // 2) Valid token cached on disk (survives restarts, avoids the refresh rate limit)?
  const stored = await loadTokenFile();
  if (stored.access_token && stored.expires_at && Date.now() < stored.expires_at - 60_000) {
    memo = {
      accessToken: stored.access_token,
      expiresAt: stored.expires_at,
      refreshToken: stored.refresh_token || null,
    };
    return memo.accessToken;
  }

  // 3) Exchange the refresh token for a fresh access token.
  // Respect backoff: if a recent exchange failed, don't pummel the rate-limited endpoint.
  if (Date.now() < refreshBlockedUntil) {
    throw new Error(lastRefreshError || "Token refresh backing off (rate limit).");
  }

  const refreshToken =
    stored.refresh_token || process.env.HUBSTAFF_PAT || process.env.HUBSTAFF_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("No Hubstaff token. Set HUBSTAFF_PAT in .env (or USE_MOCK=true).");
  }

  const res = await fetch(`${ACCOUNTS_BASE}/access_tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    refreshBlockedUntil = Date.now() + REFRESH_BACKOFF_MS;
    lastRefreshError = `Token refresh failed (${res.status}): ${text}`;
    // If we're rate-limited but still hold a (just-expired) token, keep using it rather
    // than hard-failing the dashboard.
    if (stored.access_token) {
      console.warn(`[hubstaff] token refresh failed (${res.status}); reusing cached token`);
      memo = {
        accessToken: stored.access_token,
        expiresAt: stored.expires_at || Date.now() + 60_000,
        refreshToken,
      };
      return memo.accessToken;
    }
    throw new Error(lastRefreshError);
  }

  refreshBlockedUntil = 0;
  lastRefreshError = null;

  const json = await res.json();
  const expiresAt = Date.now() + (json.expires_in || 86400) * 1000;
  memo = {
    accessToken: json.access_token,
    expiresAt,
    refreshToken: json.refresh_token || refreshToken,
  };
  await saveTokenFile({
    access_token: json.access_token,
    expires_at: expiresAt,
    refresh_token: json.refresh_token || refreshToken,
  });
  return memo.accessToken;
}

async function api(pathname, params = {}) {
  const token = await getAccessToken();
  const url = new URL(API_BASE + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hubstaff ${pathname} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function resolveOrgId() {
  if (process.env.HUBSTAFF_ORG_ID) return process.env.HUBSTAFF_ORG_ID;
  const { organizations = [] } = await api("/organizations");
  if (!organizations.length) throw new Error("No organizations visible to this token.");
  return organizations[0].id;
}

// Follow Hubstaff cursor pagination (pagination.next_page_start_id).
async function collectPaged(pathname, params, key) {
  const out = [];
  let startId;
  for (let i = 0; i < 30; i++) {
    const p = { ...params };
    if (startId) p["page_start_id"] = startId;
    const json = await api(pathname, p);
    out.push(...(json[key] || []));
    startId = json.pagination?.next_page_start_id;
    if (!startId) break;
  }
  return out;
}

// --- timezone-aware calendar helpers (operate on YYYY-MM-DD strings) ---
function dateStrInTz(date, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date); // "2026-06-05"
}
function currentWeekDates(now, tz) {
  const todayStr = dateStrInTz(now, tz);
  const base = new Date(todayStr + "T00:00:00Z"); // pure calendar date in UTC space
  const dow = (base.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - dow);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return { weekDates: dates, todayStr };
}

export async function getDashboard() {
  const orgId = await resolveOrgId();
  const now = new Date();
  const { weekDates, todayStr } = currentWeekDates(now, ORG_TZ);

  // 1) Members + user names/avatars
  const membersResp = await api(`/organizations/${orgId}/members`, {
    include: "users",
    page_limit: 200,
  });
  const users = new Map((membersResp.users || []).map((u) => [u.id, u]));
  const members = (membersResp.members || []).filter(
    (m) => m.membership_status === "active"
  );

  // 2) Project id -> name
  const projectList = await collectPaged(
    `/organizations/${orgId}/projects`,
    { page_limit: 500, status: "active" },
    "projects"
  );
  const projects = new Map(projectList.map((p) => [p.id, p.name]));

  // 3) Daily activities for the current week
  const daily = await collectPaged(
    `/organizations/${orgId}/activities/daily`,
    { "date[start]": weekDates[0], "date[stop]": weekDates[6], page_limit: 500 },
    "daily_activities"
  );

  // 4) Recent activities -> online + current project
  const threshMin = Number(process.env.ONLINE_THRESHOLD_MIN || 10);
  const since = new Date(now.getTime() - threshMin * 60_000);
  let recent = [];
  try {
    recent = await collectPaged(
      `/organizations/${orgId}/activities`,
      { "time_slot[start]": since.toISOString(), "time_slot[stop]": now.toISOString(), page_limit: 500 },
      "activities"
    );
  } catch (e) {
    console.warn("[hubstaff] recent activities failed:", e.message);
  }

  return shapeDashboard({ now, weekDates, todayStr, users, members, projects, daily, recent, threshMin });
}

function shapeDashboard({ now, weekDates, todayStr, users, members, projects, daily, recent, threshMin }) {
  const todayIdx = weekDates.indexOf(todayStr);
  const dateIndex = new Map(weekDates.map((d, i) => [d, i]));

  // last activity (time_slot) + current project per user, from recent activities
  const lastSeen = new Map();
  const currentProject = new Map();
  for (const a of recent) {
    const t = new Date(a.time_slot || a.starts_at || a.created_at || 0).getTime();
    if (!lastSeen.has(a.user_id) || t > lastSeen.get(a.user_id)) {
      lastSeen.set(a.user_id, t);
      if (a.project_id) currentProject.set(a.user_id, a.project_id);
    }
  }

  // per user: 7 day-slots of {tracked, overall} + remember most recent project from dailies
  const perUser = new Map();
  const lastDailyProject = new Map();
  const ensure = (id) => {
    if (!perUser.has(id)) perUser.set(id, weekDates.map(() => ({ tracked: 0, overall: 0 })));
    return perUser.get(id);
  };
  for (const m of members) ensure(m.user_id);

  for (const d of daily) {
    const idx = dateIndex.get(d.date);
    if (idx === undefined) continue;
    const slot = ensure(d.user_id)[idx];
    slot.tracked += d.tracked || 0;
    slot.overall += d.overall || 0;
    if (d.project_id) lastDailyProject.set(d.user_id, d.project_id); // dates ascend -> ends on latest
  }

  const threshMs = threshMin * 60_000;

  const people = members.map((m) => {
    const id = m.user_id;
    const u = users.get(id) || {};
    const days = perUser.get(id);

    const week = days.map((s, i) => ({
      hours: +(s.tracked / 3600).toFixed(2),
      activity: s.tracked ? Math.round((s.overall / s.tracked) * 100) : 0,
      future: i > todayIdx, // days later this week -> render as dashed/empty
    }));

    const today = week[todayIdx] || { hours: 0, activity: 0 };
    const totalTracked = days.reduce((a, s) => a + s.tracked, 0);
    const totalOverall = days.reduce((a, s) => a + s.overall, 0);
    const weekTotal = {
      hours: +(totalTracked / 3600).toFixed(2),
      activity: totalTracked ? Math.round((totalOverall / totalTracked) * 100) : 0,
    };

    const seen = lastSeen.get(id);
    const online = seen ? now.getTime() - seen <= threshMs : false;

    const projId = currentProject.get(id) || lastDailyProject.get(id);
    const project = projId ? projects.get(projId) || null : null;

    return {
      id,
      name: u.name || u.email || `User ${id}`,
      avatar: u.avatar_url || u.avatar || null,
      online,
      project,
      lastActive: seen ? new Date(seen).toISOString() : null,
      today: { hours: today.hours, activity: today.activity },
      weekTotal,
      week,
    };
  });

  // Only show people who worked this week or are working now (hide dormant accounts).
  const visible = people.filter((p) => p.weekTotal.hours > 0 || p.online);

  return { source: "hubstaff", updatedAt: now.toISOString(), people: visible };
}
