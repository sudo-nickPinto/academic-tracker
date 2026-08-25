// Wires up the three per-row actions that appear on deadlines, reminders,
// notes, materials, announcements, and grades wherever they're listed (home
// page, /deadlines/, /reminders/, class pages): "Mark done" / "Mark not
// done" toggles, inline "Edit" forms, and "Delete" buttons. Loaded on every
// page from base.njk; harmless no-op on a page with none of these.
import { getToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { setEntryField, deleteEntry } from "./yaml-entry.js";
import { collectFieldValues } from "./manage-core.js";

const SITE = window.SITE_CONFIG || {};

function requireToken() {
  if (getToken()) return true;
  if (confirm("You need a GitHub token saved first. Go to Settings now?")) {
    window.location.href = `${SITE.pathPrefix || "/"}settings/`;
  }
  return false;
}

function parseValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

async function toggle(button) {
  if (!requireToken()) return;

  const { id, file, field, valueTrue, valueFalse, current, label } = button.dataset;
  const nextValue = current === "true" ? parseValue(valueFalse) : parseValue(valueTrue);

  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await commitFile(
      SITE.repo,
      `src/_data/${file}`,
      (text) => setEntryField(text, id, field, nextValue),
      `Mark ${id} (${field}=${nextValue}) via on-site toggle`
    );
    dispatchRebuild(SITE.repo, SITE.rebuildWorkflow).catch(() => {});
    button.textContent = "Saved — refresh in a minute";
  } catch (err) {
    alert(err instanceof GHError ? err.message : `Couldn't update: ${err.message}`);
    button.disabled = false;
    button.textContent = label;
  }
}

async function del(button) {
  if (!requireToken()) return;

  const { id, file, label } = button.dataset;
  if (!confirm(`Delete this ${label || "item"}? This can't be undone.`)) return;

  button.disabled = true;
  button.textContent = "Deleting…";

  try {
    await commitFile(
      SITE.repo,
      `src/_data/${file}`,
      (text) => deleteEntry(text, id),
      `Delete ${label || id} via on-site delete`
    );
    dispatchRebuild(SITE.repo, SITE.rebuildWorkflow).catch(() => {});
    const row = button.closest("[data-row]");
    if (row) row.remove();
  } catch (err) {
    alert(err instanceof GHError ? err.message : `Couldn't delete: ${err.message}`);
    button.disabled = false;
    button.textContent = "Delete";
  }
}

async function saveEdit(form) {
  if (!requireToken()) return;

  const statusEl = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  const { id, file } = form.dataset;
  const fields = collectFieldValues(form);

  submitBtn.disabled = true;
  if (statusEl) {
    statusEl.className = "form-status form-status-pending";
    statusEl.textContent = "Saving…";
  }

  try {
    await commitFile(
      SITE.repo,
      `src/_data/${file}`,
      (text) => Object.entries(fields).reduce((t, [field, value]) => setEntryField(t, id, field, value), text),
      `Edit ${id} via on-site edit`
    );
    dispatchRebuild(SITE.repo, SITE.rebuildWorkflow).catch(() => {});
    if (statusEl) {
      statusEl.className = "form-status form-status-success";
      statusEl.textContent = "Saved — refresh in a minute to see it live.";
    }
  } catch (err) {
    if (statusEl) {
      statusEl.className = "form-status form-status-error";
      statusEl.textContent = err instanceof GHError ? err.message : `Couldn't save: ${err.message}`;
    }
  } finally {
    submitBtn.disabled = false;
  }
}

document.querySelectorAll("[data-toggle-btn]").forEach((btn) => {
  btn.addEventListener("click", () => toggle(btn));
});

document.querySelectorAll("[data-delete-btn]").forEach((btn) => {
  btn.addEventListener("click", () => del(btn));
});

document.querySelectorAll("[data-edit-form]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEdit(form);
  });
});
