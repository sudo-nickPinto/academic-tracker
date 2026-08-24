// Drag-to-reorder for the Materials list on a class page. Native HTML5 Drag
// and Drop API, no library. Materials render in raw file order with no sort
// filter applied, so physically moving a block within the YAML file's text
// (via reorderEntries) IS the reorder mechanism — no `order` field needed.
// Loaded only from classes.njk.
import { getToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { reorderEntries } from "./yaml-entry.js";

const SITE = window.SITE_CONFIG || {};

function getDragAfterElement(list, y) {
  const items = [...list.querySelectorAll("li[draggable='true']:not(.dragging)")];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

async function commitOrder(list) {
  const file = list.dataset.file;
  const statusEl = document.querySelector(`[data-reorder-status="${file}"]`);

  if (!getToken()) {
    if (statusEl) statusEl.textContent = "";
    if (confirm("You need a GitHub token saved first. Go to Settings now?")) {
      window.location.href = `${SITE.pathPrefix || "/"}settings/`;
    }
    return;
  }

  const orderedIds = [...list.querySelectorAll("li[draggable='true']")].map((li) => li.dataset.id);
  list.classList.add("reorder-saving");
  if (statusEl) statusEl.textContent = "Saving order…";

  try {
    await commitFile(
      SITE.repo,
      `src/_data/${file}`,
      (text) => reorderEntries(text, orderedIds),
      `Reorder ${file} via drag-and-drop`
    );
    dispatchRebuild(SITE.repo, SITE.rebuildWorkflow).catch(() => {});
    if (statusEl) statusEl.textContent = "Order saved — refresh in a minute to confirm.";
  } catch (err) {
    if (statusEl) statusEl.textContent = err instanceof GHError ? err.message : `Couldn't save order: ${err.message}`;
  } finally {
    list.classList.remove("reorder-saving");
  }
}

function wireReorderList(list) {
  let dragEl = null;

  list.querySelectorAll("li[draggable='true']").forEach((li) => {
    li.addEventListener("dragstart", () => {
      dragEl = li;
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      dragEl = null;
      commitOrder(list);
    });
  });

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragEl) return;
    const after = getDragAfterElement(list, e.clientY);
    if (after == null) {
      list.appendChild(dragEl);
    } else {
      list.insertBefore(dragEl, after);
    }
  });
}

document.querySelectorAll("[data-reorder-list]").forEach(wireReorderList);
