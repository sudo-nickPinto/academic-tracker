#!/usr/bin/env node
// Parses a GitHub Issue Form submission and appends the entry to the matching
// src/_data/*.yaml file as text (not a full YAML load/dump round-trip), so the
// hand-written schema-comment headers in those files survive untouched.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "_data");

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_BODY = process.env.ISSUE_BODY || "";
const ISSUE_LABELS = JSON.parse(process.env.ISSUE_LABELS || "[]").map((l) => l.name);
const ISSUE_STATE = process.env.ISSUE_STATE;

const SITE_URL = "https://sudo-nickpinto.github.io/academic-tracker/";

function gh(args) {
  execFileSync("gh", args, { stdio: "inherit" });
}

function fail(message) {
  gh(["issue", "comment", ISSUE_NUMBER, "--body", `Couldn't add this: ${message}`]);
  console.error(message);
  process.exit(1);
}

function parseFields(body) {
  const fields = {};
  const chunks = ("\n" + body.trim()).split(/\n### /).slice(1);
  chunks.forEach((chunk) => {
    const nl = chunk.indexOf("\n");
    const label = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    let value = nl === -1 ? "" : chunk.slice(nl + 1).trim();
    if (value === "_No response_") value = "";
    fields[label] = value;
  });
  return fields;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
}

function knownClassIds() {
  const raw = fs.readFileSync(path.join(DATA_DIR, "classes.yaml"), "utf8");
  const list = yaml.load(raw) || [];
  return list.map((c) => c.id);
}

function appendEntry(fileName, entry) {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const dumped = yaml
    .dump([entry], { lineWidth: -1, quotingType: '"' })
    .trimEnd();
  const trimmed = raw.trimEnd();
  const next = /\[\]$/.test(trimmed)
    ? `${trimmed.slice(0, -2)}\n${dumped}\n`
    : `${trimmed}\n\n${dumped}\n`;
  fs.writeFileSync(filePath, next);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const HANDLERS = {
  "add-note": (fields) => {
    const classId = fields["Class"];
    const title = fields["Title"];
    const body = fields["Body (Markdown supported)"];
    if (!classId) return fail("Class is required.");
    if (!knownClassIds().includes(classId)) return fail(`Unknown class id "${classId}".`);
    if (!title) return fail("Title is required.");
    if (!body) return fail("Body is required.");
    const date = fields["Date (YYYY-MM-DD)"] || todayISO();
    const entry = {
      id: `${classId}-${slugify(title)}-${ISSUE_NUMBER}`,
      class_id: classId,
      date,
      title,
      body,
    };
    appendEntry("notes.yaml", entry);
    return { file: "notes.yaml", link: `${SITE_URL}notes/`, describe: `note "${title}"` };
  },

  "add-grade": (fields) => {
    const classId = fields["Class"];
    const item = fields["Item"];
    const category = fields["Category"];
    const scoreRaw = fields["Score"];
    const maxRaw = fields["Max"];
    if (!classId) return fail("Class is required.");
    if (!knownClassIds().includes(classId)) return fail(`Unknown class id "${classId}".`);
    if (!item) return fail("Item is required.");
    if (!category) return fail("Category is required.");
    const score = Number(scoreRaw);
    const max = Number(maxRaw);
    if (!Number.isFinite(score)) return fail(`Score "${scoreRaw}" isn't a number.`);
    if (!Number.isFinite(max) || max <= 0) return fail(`Max "${maxRaw}" isn't a positive number.`);
    const entry = {
      id: `${classId}-${slugify(item)}-${ISSUE_NUMBER}`,
      class_id: classId,
      item,
      category,
      score,
      max,
    };
    const date = fields["Date (YYYY-MM-DD, optional)"];
    if (date) entry.date = date;
    appendEntry("grades.yaml", entry);
    return { file: "grades.yaml", link: `${SITE_URL}classes/${classId}/`, describe: `grade "${item}"` };
  },

  "add-deadline": (fields) => {
    const classId = fields["Class"];
    const title = fields["Title"];
    const type = fields["Type"];
    const dueDate = fields["Due date (ISO, e.g. 2026-09-29T14:35, or TBD)"];
    if (!classId) return fail("Class is required.");
    if (!knownClassIds().includes(classId)) return fail(`Unknown class id "${classId}".`);
    if (!title) return fail("Title is required.");
    const validTypes = ["assignment", "exam", "reading", "project", "other"];
    if (!validTypes.includes(type)) return fail(`Type "${type}" must be one of: ${validTypes.join(", ")}.`);
    if (!dueDate) return fail("Due date is required (or the literal \"TBD\").");
    if (dueDate !== "TBD" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueDate)) {
      return fail(`Due date "${dueDate}" must look like "2026-09-29T14:35" or be "TBD".`);
    }
    const entry = {
      id: `${classId}-${slugify(title)}-${ISSUE_NUMBER}`,
      class_id: classId,
      title,
      type,
      due_date: dueDate,
      status: "upcoming",
      link: fields["Link (optional)"] || "",
      notes: fields["Notes (optional)"] || "",
    };
    appendEntry("deadlines.yaml", entry);
    return { file: "deadlines.yaml", link: `${SITE_URL}deadlines/`, describe: `deadline "${title}"` };
  },

  "add-reminder": (fields) => {
    const title = fields["Title"];
    if (!title) return fail("Title is required.");
    const entry = {
      id: `${slugify(title)}-${ISSUE_NUMBER}`,
      title,
      note: fields["Note (optional)"] || "",
      done: false,
    };
    const date = fields["Date (YYYY-MM-DD, optional)"];
    if (date) entry.date = date;
    appendEntry("reminders.yaml", entry);
    return { file: "reminders.yaml", link: SITE_URL, describe: `reminder "${title}"` };
  },

  "add-announcement": (fields) => {
    const classId = fields["Class"];
    const date = fields["Date (YYYY-MM-DD)"];
    const title = fields["Title"];
    const body = fields["Body"];
    if (!classId) return fail("Class is required.");
    if (!knownClassIds().includes(classId)) return fail(`Unknown class id "${classId}".`);
    if (!date) return fail("Date is required.");
    if (!title) return fail("Title is required.");
    if (!body) return fail("Body is required.");
    const entry = {
      id: `${classId}-${slugify(title)}-${ISSUE_NUMBER}`,
      class_id: classId,
      date,
      title,
      body,
      source: "manual",
    };
    appendEntry("announcements.yaml", entry);
    return { file: "announcements.yaml", link: `${SITE_URL}classes/${classId}/`, describe: `announcement "${title}"` };
  },
};

function main() {
  if (ISSUE_STATE && ISSUE_STATE !== "open") {
    console.log(`Issue state is "${ISSUE_STATE}", not "open" — skipping (already processed or closed).`);
    return;
  }

  const label = ISSUE_LABELS.find((l) => HANDLERS[l]);
  if (!label) {
    console.log("No matching submission label found, nothing to do.");
    return;
  }

  const fields = parseFields(ISSUE_BODY);
  const result = HANDLERS[label](fields);

  execFileSync("npm", ["run", "build"], { stdio: "inherit", cwd: ROOT });

  execFileSync("git", ["config", "user.name", "github-actions[bot]"], { cwd: ROOT });
  execFileSync("git", ["config", "user.email", "github-actions[bot]@users.noreply.github.com"], { cwd: ROOT });
  execFileSync("git", ["add", `src/_data/${result.file}`, "docs"], { cwd: ROOT });

  let hasChanges = true;
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT });
    hasChanges = false;
  } catch {
    hasChanges = true;
  }

  if (!hasChanges) {
    fail("Nothing changed after processing — this shouldn't happen. Please check manually.");
    return;
  }

  execFileSync("git", ["commit", "-m", `Add ${result.describe} via issue #${ISSUE_NUMBER}`], { cwd: ROOT });
  execFileSync("git", ["push"], { cwd: ROOT });

  gh([
    "issue",
    "comment",
    ISSUE_NUMBER,
    "--body",
    `Added ${result.describe}. Live at ${result.link} once GitHub Pages redeploys (usually a minute or two).`,
  ]);
  gh(["issue", "close", ISSUE_NUMBER]);
}

if (require.main === module) {
  main();
}

module.exports = { parseFields, slugify, appendEntry, knownClassIds, HANDLERS };
