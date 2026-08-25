#!/usr/bin/env node
// Pulls upcoming Outlook calendar events via Microsoft Graph (OAuth device code
// flow) and upserts them into src/_data/reminders.yaml.
//
// Read-only against Graph; only ever writes a local YAML file here — never commits
// or pushes. Review the diff and run through the normal "refresh" flow afterward.
//
// Calendar events aren't tied to a class_id the way Moodle deadlines are (Graph
// has no reliable course mapping), so this syncs into reminders.yaml — a standing,
// class-agnostic list — rather than deadlines.yaml, which requires a class_id FK.
// Mail sync (the other half of Roadmap Phase 3) is left for a future pass; nothing
// here reads mail.
//
// Usage:
//   node scripts/sync-outlook.js
//
// Requires a .env file (see .env.example) with AZURE_CLIENT_ID (a public-client
// Azure AD app registration with the Calendars.Read delegated permission) and
// optionally AZURE_TENANT_ID (defaults to "common"). The first run walks you
// through the device code flow; the resulting refresh token is cached locally in
// .outlook-token-cache.json (gitignored) so later runs don't need to re-prompt.
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "_data");
const TOKEN_CACHE_PATH = path.join(ROOT, ".outlook-token-cache.json");
const TZID = "America/New_York";
const SCOPES = "offline_access Calendars.Read";

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  raw.split("\n").forEach((line) => {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) return;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  });
}
loadEnv();

const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const TENANT_ID = process.env.AZURE_TENANT_ID || "common";
const DAYS_AHEAD = Number(process.env.OUTLOOK_SYNC_DAYS_AHEAD || 30);
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0`;

function loadTokenCache() {
  if (!fs.existsSync(TOKEN_CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveTokenCache(tokens) {
  fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

async function requestDeviceCode() {
  const res = await fetch(`${AUTHORITY}/devicecode`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPES }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Device code request failed: ${data.error_description || data.error}`);
  return data;
}

async function pollForToken(deviceCode, intervalSeconds, expiresInSeconds) {
  const deadline = Date.now() + expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
    const res = await fetch(`${AUTHORITY}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
      }),
    });
    const data = await res.json();
    if (res.ok) return data;
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      intervalSeconds += 5;
      continue;
    }
    throw new Error(`Device code sign-in failed: ${data.error_description || data.error}`);
  }
  throw new Error("Device code sign-in timed out — run the script again.");
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });
  const data = await res.json();
  if (!res.ok) return null; // cached refresh token expired/revoked — fall back to device code
  return data;
}

async function getAccessToken() {
  const cached = loadTokenCache();
  if (cached && cached.refresh_token) {
    const refreshed = await refreshAccessToken(cached.refresh_token);
    if (refreshed) {
      saveTokenCache(refreshed);
      return refreshed.access_token;
    }
    console.log("Cached Outlook sign-in expired — signing in again.");
  }

  const device = await requestDeviceCode();
  console.log(device.message);
  const tokens = await pollForToken(device.device_code, device.interval || 5, device.expires_in || 900);
  saveTokenCache(tokens);
  return tokens.access_token;
}

// Same Intl-based timezone conversion as src/deadlines.11ty.js's floating-local-time
// approach, so a reminder's date matches what the event shows in Outlook regardless
// of what timezone `node scripts/sync-outlook.js` happens to run in.
function toEasternDate(isoDateTime) {
  const date = new Date(isoDateTime.endsWith("Z") ? isoDateTime : `${isoDateTime}Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = {};
  fmt.formatToParts(date).forEach((p) => {
    parts[p.type] = p.value;
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function fetchUpcomingEvents(accessToken) {
  const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "100");
  url.searchParams.set("$select", "id,subject,start,isAllDay,location,webLink");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph calendarview request failed: ${data.error?.message || res.status}`);
  return data.value || [];
}

// Graph event ids are long opaque strings — hashed down to a short, stable suffix
// so reminders.yaml stays readable.
function stableSuffix(raw) {
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

// Preserves the hand-written schema-comment header (everything up to the first
// non-comment, non-blank line) so a full load/dump round-trip doesn't strip it —
// same concern as scripts/process-issue.js.
function splitHeader(raw) {
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length && (lines[i].startsWith("#") || lines[i].trim() === "")) i += 1;
  return { header: lines.slice(0, i).join("\n"), rest: lines.slice(i).join("\n") };
}

// Only touches entries whose id we generated (outlook-event-*); hand-written
// reminders are left completely alone. On update, keeps `done` rather than
// stomping something you've already checked off.
function upsertReminders(newEntries) {
  const filePath = path.join(DATA_DIR, "reminders.yaml");
  const raw = fs.readFileSync(filePath, "utf8");
  const { header, rest } = splitHeader(raw);
  const list = yaml.load(rest) || [];
  const byId = new Map(list.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  newEntries.forEach((entry) => {
    const existing = byId.get(entry.id);
    if (existing) {
      Object.assign(existing, entry, { done: existing.done });
      updated += 1;
    } else {
      byId.set(entry.id, entry);
      added += 1;
    }
  });
  const merged = [...byId.values()];
  const dumped = yaml.dump(merged, { lineWidth: -1, quotingType: '"' });
  fs.writeFileSync(filePath, `${header}\n\n${dumped}`);
  return { added, updated };
}

async function sync() {
  const accessToken = await getAccessToken();
  const events = await fetchUpcomingEvents(accessToken);

  const newReminders = events.map((ev) => {
    const noteParts = [];
    if (ev.location?.displayName) noteParts.push(ev.location.displayName);
    noteParts.push("From Outlook calendar");
    return {
      id: `outlook-event-${stableSuffix(ev.id)}`,
      title: ev.subject || "(untitled event)",
      date: toEasternDate(ev.start.dateTime),
      note: noteParts.join(" · "),
      done: false,
    };
  });

  const result = upsertReminders(newReminders);
  console.log(`Reminders: ${result.added} added, ${result.updated} updated.`);
  console.log('Review the diff, then run "npm run build" and commit if it looks right.');
}

async function main() {
  if (!CLIENT_ID) {
    console.error("Missing AZURE_CLIENT_ID. Copy .env.example to .env and fill it in — see CLAUDE.md's Roadmap (Phase 3) for the Azure AD app registration steps.");
    process.exit(1);
  }
  await sync();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { toEasternDate, splitHeader, upsertReminders, stableSuffix };
