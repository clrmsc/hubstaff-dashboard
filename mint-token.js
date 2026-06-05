// One-shot: exchange HUBSTAFF_PAT for an access token and cache it to .token.json.
// Run this manually when you need to (re)seed the token. The server also does this
// automatically, but minting once by hand avoids hammering the rate-limited endpoint.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const refreshToken = process.env.HUBSTAFF_PAT || process.env.HUBSTAFF_REFRESH_TOKEN;
if (!refreshToken) {
  console.error("No HUBSTAFF_PAT in .env");
  process.exit(1);
}

const res = await fetch("https://account.hubstaff.com/access_tokens", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
});
const text = await res.text();
if (!res.ok) {
  console.error(`Exchange failed (${res.status}): ${text}`);
  process.exit(2);
}
const json = JSON.parse(text);
const expiresAt = Date.now() + (json.expires_in || 86400) * 1000;
await writeFile(
  path.join(__dirname, ".token.json"),
  JSON.stringify(
    { access_token: json.access_token, expires_at: expiresAt, refresh_token: json.refresh_token || refreshToken },
    null,
    2
  )
);
console.log(`OK: token cached, expires in ${Math.round((json.expires_in || 0) / 3600)}h`);
