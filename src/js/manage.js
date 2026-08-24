import { getToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { appendEntry, makeId, slugify } from "./yaml-entry.js";

const SITE = window.SITE_CONFIG || {};
const CLASSES = window.CLASSES || [];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function siteUrl(path) {
  const base = (SITE.pathPrefix || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}${path}`;
}

function setStatus(el, kind, message) {
  el.className = `form-status form-status-${kind}`;
  el.textContent = message;
}

function populateClassDropdowns() {
  document.querySelectorAll("select[data-class-select]").forEach((select) => {
    CLASSES.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.code} — ${c.name}`;
      select.appendChild(opt);
    });
  });
}

async function handleAddForm(form, { file, buildEntry, describe, link }) {
  const statusEl = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  setStatus(statusEl, "", "");

  let entry;
  try {
    if (!getToken()) throw new Error('No GitHub token saved yet — add one on the Settings page first.');
    entry = buildEntry(new FormData(form));
  } catch (err) {
    setStatus(statusEl, "error", err.message);
    return;
  }

  submitBtn.disabled = true;
  setStatus(statusEl, "pending", "Saving…");

  try {
    await commitFile(
      SITE.repo,
      `src/_data/${file}`,
      (text) => appendEntry(text, entry),
      `Add ${describe(entry)} via on-site Manage page`
    );
    try {
      await dispatchRebuild(SITE.repo, SITE.rebuildWorkflow);
      setStatus(statusEl, "success", `Added ${describe(entry)}. Live at ${link(entry)} in a minute or two.`);
    } catch (err) {
      setStatus(
        statusEl,
        "success",
        `Added ${describe(entry)}, but couldn't auto-trigger a rebuild (${err.message}). It'll show up after the next nightly rebuild, or trigger "Nightly rebuild" manually from the repo's Actions tab.`
      );
    }
    form.reset();
  } catch (err) {
    setStatus(statusEl, "error", err instanceof GHError ? err.message : `Something went wrong: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

function wireForm(id, opts) {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleAddForm(form, opts);
  });
}

populateClassDropdowns();

wireForm("form-deadline", {
  file: "deadlines.yaml",
  buildEntry: (fd) => {
    const classId = fd.get("class_id");
    const title = (fd.get("title") || "").trim();
    const type = fd.get("type");
    const dueDate = (fd.get("due_date") || "").trim();
    if (!classId) throw new Error("Class is required.");
    if (!title) throw new Error("Title is required.");
    if (dueDate !== "TBD" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueDate)) {
      throw new Error('Due date must look like "2026-09-29T14:35", or be "TBD".');
    }
    return {
      id: makeId(`${classId}-deadline`, title),
      class_id: classId,
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
});

wireForm("form-note", {
  file: "notes.yaml",
  buildEntry: (fd) => {
    const classId = fd.get("class_id");
    const title = (fd.get("title") || "").trim();
    const body = (fd.get("body") || "").trim();
    if (!classId) throw new Error("Class is required.");
    if (!title) throw new Error("Title is required.");
    if (!body) throw new Error("Body is required.");
    return {
      id: makeId(`${classId}-note`, title),
      class_id: classId,
      date: fd.get("date") || todayISO(),
      title,
      body,
    };
  },
  describe: (e) => `note "${e.title}"`,
  link: () => siteUrl("/notes/"),
});

wireForm("form-grade", {
  file: "grades.yaml",
  buildEntry: (fd) => {
    const classId = fd.get("class_id");
    const item = (fd.get("item") || "").trim();
    const category = (fd.get("category") || "").trim();
    const score = Number(fd.get("score"));
    const max = Number(fd.get("max"));
    if (!classId) throw new Error("Class is required.");
    if (!item) throw new Error("Item is required.");
    if (!Number.isFinite(score)) throw new Error("Score must be a number.");
    if (!Number.isFinite(max) || max <= 0) throw new Error("Max must be a positive number.");
    const entry = { id: makeId(`${classId}-grade`, item), class_id: classId, item, category: category || "Other", score, max };
    const date = fd.get("date");
    if (date) entry.date = date;
    return entry;
  },
  describe: (e) => `grade "${e.item}"`,
  link: (e) => siteUrl(`/classes/${e.class_id}/`),
});

wireForm("form-announcement", {
  file: "announcements.yaml",
  buildEntry: (fd) => {
    const classId = fd.get("class_id");
    const title = (fd.get("title") || "").trim();
    const body = (fd.get("body") || "").trim();
    if (!classId) throw new Error("Class is required.");
    if (!title) throw new Error("Title is required.");
    if (!body) throw new Error("Body is required.");
    return {
      id: makeId(`${classId}-ann`, title),
      class_id: classId,
      date: fd.get("date") || todayISO(),
      title,
      body,
      source: "manual",
    };
  },
  describe: (e) => `announcement "${e.title}"`,
  link: (e) => siteUrl(`/classes/${e.class_id}/`),
});

wireForm("form-material", {
  file: "materials.yaml",
  buildEntry: (fd) => {
    const classId = fd.get("class_id");
    const title = (fd.get("title") || "").trim();
    const type = fd.get("type");
    if (!classId) throw new Error("Class is required.");
    if (!title) throw new Error("Title is required.");
    return {
      id: makeId(`${classId}-material`, title),
      class_id: classId,
      title,
      type,
      link: fd.get("link") || "",
      date_added: todayISO(),
      source: "manual",
    };
  },
  describe: (e) => `material "${e.title}"`,
  link: (e) => siteUrl(`/classes/${e.class_id}/`),
});

wireForm("form-reminder", {
  file: "reminders.yaml",
  buildEntry: (fd) => {
    const title = (fd.get("title") || "").trim();
    if (!title) throw new Error("Title is required.");
    const entry = { id: makeId("reminder", title), title, note: fd.get("note") || "", done: false };
    const date = fd.get("date");
    if (date) entry.date = date;
    return entry;
  },
  describe: (e) => `reminder "${e.title}"`,
  link: () => siteUrl("/"),
});

wireForm("form-class", {
  file: "classes.yaml",
  buildEntry: (fd) => {
    const code = (fd.get("code") || "").trim();
    const name = (fd.get("name") || "").trim();
    const id = slugify(fd.get("id") || code || name);
    if (!id) throw new Error("Couldn't derive a class ID — fill in Code or ID.");
    if (!name) throw new Error("Name is required.");
    return {
      id,
      name,
      code: code || id.toUpperCase(),
      term: fd.get("term") || "",
      instructor: fd.get("instructor") || "",
      meeting_times: fd.get("meeting_times") || "",
      color: fd.get("color") || "#2b6cb0",
      materials_link: fd.get("materials_link") || "",
      status: "active",
      grade_categories: [],
    };
  },
  describe: (e) => `class "${e.code}"`,
  link: (e) => siteUrl(`/classes/${e.id}/`),
});
