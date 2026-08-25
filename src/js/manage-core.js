// Shared engine behind every on-site "add" form — both the slim global
// /manage/ page (Reminder, Class) and each class page's inline forms
// (Deadline, Note, Grade, Announcement, Material) wire their markup to this
// via wireForm(). Extracted from the original single-page manage.js so both
// callers share one implementation instead of two copies drifting apart.
import { getToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { appendEntry } from "./yaml-entry.js";

const SITE = window.SITE_CONFIG || {};

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function siteUrl(path) {
  const base = (SITE.pathPrefix || "/").replace(/\/$/, "");
  return `${window.location.origin}${base}${path}`;
}

export function setStatus(el, kind, message) {
  el.className = `form-status form-status-${kind}`;
  el.textContent = message;
}

// --- Optimistic-preview DOM helpers -----------------------------------
// A form's `preview` option builds a small, honestly-labeled "just added"
// node so the page reflects an add immediately instead of only after the
// next rebuild. Built with createElement/textContent (never innerHTML) so
// user-entered text can never be interpreted as markup.

export function createEl(tag, { className, text, attrs, children } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (children) children.forEach((c) => c && el.appendChild(c));
  return el;
}

export function pendingBadge() {
  return createEl("span", { className: "badge-pending", text: "Just added" });
}

/** Appends `node` into the first element matching `selector`, clearing any ".empty" placeholder inside it. */
export function appendToList(selector, node) {
  const container = document.querySelector(selector);
  if (!container) return;
  const empty = container.querySelector(".empty");
  if (empty) empty.remove();
  container.appendChild(node);
}

// buildEntry may be sync or async (the latter is what a drop-zone file
// upload needs, since it has to read + commit the file before the entry
// object is complete) — `await` on a plain object is a no-op either way.
export async function handleAddForm(form, { file, buildEntry, describe, link, preview }) {
  const statusEl = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  setStatus(statusEl, "", "");

  let entry;
  try {
    if (!getToken()) throw new Error('No GitHub token saved yet — add one on the Settings page first.');
    entry = await buildEntry(new FormData(form));
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
    if (preview) {
      try {
        preview(entry);
      } catch {
        // Cosmetic only — never let a preview-rendering bug mask a successful save.
      }
    }
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

/** Reads every named field in a form into a plain object, coercing number inputs. */
export function collectFieldValues(form) {
  const values = {};
  form.querySelectorAll("[name]").forEach((el) => {
    if (!el.name) return;
    values[el.name] = el.type === "number" ? Number(el.value) : el.value.trim();
  });
  return values;
}

export function wireForm(id, opts) {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleAddForm(form, opts);
  });
}
