import { wireForm, todayISO, siteUrl, createEl, pendingBadge, appendToList } from "./manage-core.js";
import { makeId, sanitizeFilename } from "./yaml-entry.js";
import { uploadFile } from "./gh-client.js";
import { addReorderItem } from "./reorder.js";

const CLASS_ID = window.CLASS_ID;
const SITE = window.SITE_CONFIG || {};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Uploads a dropped file (if any) to src/uploads/<class_id>/... and returns
// its public site URL, or "" if no file was attached. Size is checked before
// any network call, matching the sync-validation contract handleAddForm
// expects from buildEntry.
async function uploadIfPresent(fd, describe) {
  const file = fd.get("file");
  if (!file || !(file instanceof File) || file.size === 0) return "";
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is too large (max 5 MB).`);
  }
  const filename = sanitizeFilename(file.name);
  const path = `src/uploads/${CLASS_ID}/${filename}`;
  const buffer = await file.arrayBuffer();
  await uploadFile(SITE.repo, path, buffer, `Add ${describe} file "${file.name}" via on-site Manage page`);
  return siteUrl(`/uploads/${CLASS_ID}/${filename}`);
}

// --- Optimistic previews ------------------------------------------------
// Deliberately lightweight rather than a full render of deadline-row.njk /
// gradeBreakdown-style logic: reproducing that here would drift from the
// server templates over time. Grades, Reminders, and Class have no preview
// (see CLAUDE.md) — grades because a correct weighted-average recompute
// would duplicate real business logic, Reminders/Class because /manage/
// shows no list for either to insert into.

function previewDeadline(entry) {
  const row = createEl("div", { className: "deadline-row pending-row" });
  row.appendChild(createEl("span", { className: "deadline-date", text: entry.due_date === "TBD" ? "TBD" : entry.due_date.slice(0, 10) }));
  row.appendChild(createEl("span", { className: "deadline-title", text: entry.title }));
  row.appendChild(createEl("span", { className: "deadline-type", text: entry.type }));
  row.appendChild(pendingBadge());
  appendToList('[data-list="deadlines"]', row);
}

function previewNote(entry) {
  const div = createEl("div", { className: "note pending-row" });
  div.appendChild(createEl("p", { className: "note-date", text: entry.date }));
  div.appendChild(createEl("h3", { children: [document.createTextNode(`${entry.title} `), pendingBadge()] }));
  div.appendChild(createEl("div", { className: "note-body", text: entry.body }));
  appendToList('[data-list="notes"]', div);
}

function previewAnnouncement(entry) {
  const div = createEl("div", { className: "announcement pending-row" });
  div.appendChild(createEl("p", { className: "announcement-date", text: entry.date }));
  div.appendChild(createEl("h3", { children: [document.createTextNode(`${entry.title} `), pendingBadge()] }));
  div.appendChild(createEl("p", { text: entry.body }));
  appendToList('[data-list="announcements"]', div);
}

function previewMaterial(entry) {
  const container = document.querySelector('[data-list="materials"]');
  if (!container) return;
  const list = container.querySelector("[data-reorder-list]");
  if (!list) return;
  const empty = container.querySelector(".empty");
  if (empty) empty.remove();
  const li = createEl("li", { className: "pending-row", attrs: { "data-id": entry.id, draggable: "true" } });
  li.appendChild(createEl("span", { className: "drag-handle", text: "⠿", attrs: { "aria-hidden": "true" } }));
  li.appendChild(document.createTextNode(`${entry.title} `));
  li.appendChild(createEl("span", { className: "tag", text: entry.type }));
  li.appendChild(pendingBadge());
  addReorderItem(list, li);
}

wireForm("form-deadline", {
  file: "deadlines.yaml",
  buildEntry: (fd) => {
    const title = (fd.get("title") || "").trim();
    const type = fd.get("type");
    const dueDate = (fd.get("due_date") || "").trim();
    if (!title) throw new Error("Title is required.");
    if (dueDate !== "TBD" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueDate)) {
      throw new Error('Due date must look like "2026-09-29T14:35", or be "TBD".');
    }
    return {
      id: makeId(`${CLASS_ID}-deadline`, title),
      class_id: CLASS_ID,
      title,
      type,
      due_date: dueDate,
      status: "upcoming",
      link: fd.get("link") || "",
      notes: fd.get("notes") || "",
    };
  },
  describe: (e) => `deadline "${e.title}"`,
  link: () => siteUrl("/deadlines/"),
  preview: previewDeadline,
});

wireForm("form-note", {
  file: "notes.yaml",
  buildEntry: async (fd) => {
    const title = (fd.get("title") || "").trim();
    const body = (fd.get("body") || "").trim();
    if (!title) throw new Error("Title is required.");
    if (!body) throw new Error("Body is required.");
    const entry = {
      id: makeId(`${CLASS_ID}-note`, title),
      class_id: CLASS_ID,
      date: fd.get("date") || todayISO(),
      title,
      body,
    };
    const attachment = await uploadIfPresent(fd, "note");
    if (attachment) entry.attachment = attachment;
    return entry;
  },
  describe: (e) => `note "${e.title}"`,
  link: () => siteUrl("/notes/"),
  preview: previewNote,
});

wireForm("form-grade", {
  file: "grades.yaml",
  buildEntry: (fd) => {
    const item = (fd.get("item") || "").trim();
    const category = (fd.get("category") || "").trim();
    const score = Number(fd.get("score"));
    const max = Number(fd.get("max"));
    if (!item) throw new Error("Item is required.");
    if (!Number.isFinite(score)) throw new Error("Score must be a number.");
    if (!Number.isFinite(max) || max <= 0) throw new Error("Max must be a positive number.");
    const entry = { id: makeId(`${CLASS_ID}-grade`, item), class_id: CLASS_ID, item, category: category || "Other", score, max };
    const date = fd.get("date");
    if (date) entry.date = date;
    return entry;
  },
  describe: (e) => `grade "${e.item}"`,
  link: () => siteUrl(`/classes/${CLASS_ID}/`),
});

wireForm("form-announcement", {
  file: "announcements.yaml",
  buildEntry: (fd) => {
    const title = (fd.get("title") || "").trim();
    const body = (fd.get("body") || "").trim();
    if (!title) throw new Error("Title is required.");
    if (!body) throw new Error("Body is required.");
    return {
      id: makeId(`${CLASS_ID}-ann`, title),
      class_id: CLASS_ID,
      date: fd.get("date") || todayISO(),
      title,
      body,
      source: "manual",
    };
  },
  describe: (e) => `announcement "${e.title}"`,
  link: () => siteUrl(`/classes/${CLASS_ID}/`),
  preview: previewAnnouncement,
});

wireForm("form-material", {
  file: "materials.yaml",
  buildEntry: async (fd) => {
    const title = (fd.get("title") || "").trim();
    const type = fd.get("type");
    if (!title) throw new Error("Title is required.");
    const uploaded = await uploadIfPresent(fd, "material");
    return {
      id: makeId(`${CLASS_ID}-material`, title),
      class_id: CLASS_ID,
      title,
      type,
      link: uploaded || fd.get("link") || "",
      date_added: todayISO(),
      source: "manual",
    };
  },
  describe: (e) => `material "${e.title}"`,
  link: () => siteUrl(`/classes/${CLASS_ID}/`),
  preview: previewMaterial,
});

function wireDropZones() {
  document.querySelectorAll("[data-drop-zone]").forEach((zone) => {
    const input = zone.querySelector('input[type="file"]');
    const hint = zone.querySelector(".drop-zone-hint");
    if (!input) return;

    const showFilename = () => {
      if (hint && input.files && input.files.length > 0) {
        hint.textContent = `Selected: ${input.files[0].name}`;
      }
    };
    input.addEventListener("change", showFilename);

    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        zone.classList.add("drop-zone-active");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, () => zone.classList.remove("drop-zone-active"))
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) {
        input.files = files;
        showFilename();
      }
    });
  });
}

wireDropZones();
