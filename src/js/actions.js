// Wires up "Mark done" / "Mark not done" toggle buttons (deadlines,
// reminders) anywhere they appear (home page, /deadlines/, /reminders/,
// class pages). Loaded on every page from base.njk; harmless no-op if a
// page has no toggle buttons.
import { getToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { setEntryField } from "./yaml-entry.js";

const SITE = window.SITE_CONFIG || {};

function parseValue(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

async function toggle(button) {
  if (!getToken()) {
    if (confirm("You need a GitHub token saved first. Go to Settings now?")) {
      window.location.href = `${SITE.pathPrefix || "/"}settings/`;
    }
    return;
  }

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

document.querySelectorAll("[data-toggle-btn]").forEach((btn) => {
  btn.addEventListener("click", () => toggle(btn));
});
