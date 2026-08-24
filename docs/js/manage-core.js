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

// buildEntry may be sync or async (the latter is what a drop-zone file
// upload needs, since it has to read + commit the file before the entry
// object is complete) — `await` on a plain object is a no-op either way.
export async function handleAddForm(form, { file, buildEntry, describe, link }) {
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

export function wireForm(id, opts) {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleAddForm(form, opts);
  });
}
