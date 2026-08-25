#!/usr/bin/env node
// Scans a local folder tree of course files and registers any file not
// already tracked as a src/_data/materials.yaml entry.
//
// Only ever writes a local YAML file here — never builds, commits, or
// pushes. Review the diff and run through the normal "refresh" flow
// afterward, same as scripts/sync-outlook.js.
//
// The source folder is expected to have one subfolder per class (matched to
// classes.yaml ids by name, case-insensitively, ignoring a leading non-
// alphanumeric marker like "*cs440"), with course files anywhere underneath.
// Raw files are never copied or uploaded anywhere — they may contain
// personal or copyrighted content unsuitable for this public repo (see the
// .gitignore comment above /cs391/ etc.), so every entry this script adds
// gets link: "", same convention as the hand-added *-syllabus entries. This
// script's job is only to make sure a material *exists* in the tracker, not
// to publish the file.
//
// Usage:
//   node scripts/sync-materials.js
//
// Requires MATERIALS_SYNC_DIR in .env (see .env.example) — an absolute path
// to the local folder tree to scan. Not hardcoded here since it embeds a
// local username/path, which doesn't belong in a public repo's tracked code.
"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "_data");

const IGNORED_BASENAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
const SLIDE_EXTENSIONS = new Set([".ppt", ".pptx", ".key", ".odp"]);
const RECORDING_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mp3", ".m4a", ".wav"]);
const READING_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".mhtml", ".epub", ".rtf"]);

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

const SOURCE_DIR = process.env.MATERIALS_SYNC_DIR;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
}

// Same djb2-based short hash as sync-outlook.js's stableSuffix — turns a
// relative file path into a short, stable id suffix so reruns are idempotent
// and two same-named files in different subfolders don't collide.
function stableSuffix(raw) {
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) + hash + raw.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function loadClassIds() {
  const raw = fs.readFileSync(path.join(DATA_DIR, "classes.yaml"), "utf8");
  const list = yaml.load(raw) || [];
  return list.map((c) => c.id);
}

function loadExistingMaterials() {
  const raw = fs.readFileSync(path.join(DATA_DIR, "materials.yaml"), "utf8");
  return yaml.load(raw) || [];
}

// A class only ever needs one syllabus. Hand-written entries (e.g.
// "cs391-syllabus") predate this script and use a different id shape, so an
// id-only check would add a second syllabus material every time this runs
// against a class whose syllabus was already logged by hand.
function classesWithSyllabus(materials) {
  return new Set(materials.filter((m) => m.type === "syllabus").map((m) => m.class_id));
}

// Strips a leading non-alphanumeric marker (e.g. the "*" in "*cs440",
// apparently used locally to flag something about that class) and
// lowercases, so folder names match classes.yaml ids.
function normalizeFolderName(name) {
  return name.replace(/^[^a-z0-9]+/i, "").toLowerCase();
}

function matchClassFolders(sourceDir, classIds) {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  const matched = [];
  const unmatched = [];
  entries.forEach((entry) => {
    const classId = classIds.find((id) => normalizeFolderName(entry.name) === id.toLowerCase());
    if (classId) {
      matched.push({ folder: entry.name, classId });
    } else {
      unmatched.push(entry.name);
    }
  });
  return { matched, unmatched };
}

function walkFiles(dir, baseDir) {
  const results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name.startsWith(".")) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      if (IGNORED_BASENAMES.has(entry.name.toLowerCase())) return;
      results.push(path.relative(baseDir, fullPath));
    }
  });
  return results;
}

function inferType(filename) {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);
  if (lower.includes("syllabus")) return "syllabus";
  if (SLIDE_EXTENSIONS.has(ext)) return "slides";
  if (RECORDING_EXTENSIONS.has(ext)) return "recording";
  if (READING_EXTENSIONS.has(ext)) return "reading";
  return "other";
}

function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base.trim() || filename;
}

// Ports process-issue.js's appendEntry (text-append, not a load/dump
// round-trip) so materials.yaml's hand-written header and every existing
// entry's exact formatting survive untouched — only new entries are added.
function appendEntry(fileText, entry) {
  const dumped = yaml.dump([entry], { lineWidth: -1, quotingType: '"' }).trimEnd();
  const trimmed = fileText.trimEnd();
  if (/\[\]$/.test(trimmed)) {
    return `${trimmed.slice(0, -2)}\n${dumped}\n`;
  }
  return `${trimmed}\n\n${dumped}\n`;
}

function main() {
  if (!SOURCE_DIR) {
    console.error(
      "Missing MATERIALS_SYNC_DIR. Copy .env.example to .env and set it to the absolute path of your local course-files folder."
    );
    process.exit(1);
  }
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`MATERIALS_SYNC_DIR does not exist: ${SOURCE_DIR}`);
    process.exit(1);
  }

  const classIds = loadClassIds();
  const { matched, unmatched } = matchClassFolders(SOURCE_DIR, classIds);

  if (unmatched.length) {
    console.log(`Skipping folders that don't match a class id in classes.yaml: ${unmatched.join(", ")}`);
  }

  const existingMaterials = loadExistingMaterials();
  const existingIds = new Set(existingMaterials.map((m) => m.id));
  const syllabusClasses = classesWithSyllabus(existingMaterials);
  const filePath = path.join(DATA_DIR, "materials.yaml");
  let fileText = fs.readFileSync(filePath, "utf8");
  const today = todayISO();

  let added = 0;
  let skipped = 0;

  matched.forEach(({ folder, classId }) => {
    const classDir = path.join(SOURCE_DIR, folder);
    const relativeFiles = walkFiles(classDir, classDir);

    relativeFiles.forEach((relativeFile) => {
      const id = `${classId}-${slugify(titleFromFilename(relativeFile))}-${stableSuffix(relativeFile)}`;
      if (existingIds.has(id)) {
        skipped += 1;
        return;
      }

      const type = inferType(relativeFile);
      if (type === "syllabus" && syllabusClasses.has(classId)) {
        skipped += 1;
        return;
      }

      const entry = {
        id,
        class_id: classId,
        title: titleFromFilename(relativeFile),
        type,
        link: "",
        date_added: today,
      };
      fileText = appendEntry(fileText, entry);
      existingIds.add(id);
      if (type === "syllabus") syllabusClasses.add(classId);
      added += 1;
      console.log(`+ [${classId}] ${entry.title} (${entry.type})`);
    });
  });

  if (added > 0) {
    fs.writeFileSync(filePath, fileText);
  }

  console.log(`\nMaterials: ${added} added, ${skipped} already tracked.`);
  if (added > 0) {
    console.log(
      'Files are registered as materials but NOT copied or uploaded — link is left "" since these are local/personal course files. Add a public link by hand if you have one (or attach the actual file via the class page\'s Material upload form instead, if you want it hosted).'
    );
    console.log('Review the diff, then run "npm run build" and go through the normal refresh flow to commit.');
  }
}

main();

module.exports = { normalizeFolderName, inferType, titleFromFilename, stableSuffix, appendEntry };
