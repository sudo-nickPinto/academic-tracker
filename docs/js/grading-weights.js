// Wires the per-class "Edit Grading Weights" form (see classes.njk). Unlike
// the add-forms in class-manage.js (which append a new entry via
// wireForm/handleAddForm), this replaces the whole `grade_categories` array
// on the class's existing entry, so it talks to commitFile/setArrayField
// directly instead of going through that shared helper.
import { getToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { setArrayField } from "./yaml-entry.js";
import { setStatus } from "./manage-core.js";

const SITE = window.SITE_CONFIG || {};

function categoryRows(container) {
  return Array.from(container.querySelectorAll("[data-category-row]"));
}

function updateTotal(form) {
  const container = form.querySelector("[data-category-rows]");
  const totalEl = form.querySelector("[data-category-total]");
  if (!container || !totalEl) return;
  const total = categoryRows(container).reduce((sum, row) => {
    const weight = Number(row.querySelector('[name="category-weight"]').value);
    return sum + (Number.isFinite(weight) ? weight : 0);
  }, 0);
  const rounded = Math.round(total * 100) / 100;
  totalEl.textContent = rounded;
  totalEl.classList.toggle("total-warning", categoryRows(container).length > 0 && rounded !== 100);
}

function collectCategories(container) {
  const categories = categoryRows(container).map((row) => {
    const name = row.querySelector('[name="category-name"]').value.trim();
    const weight = Number(row.querySelector('[name="category-weight"]').value);
    if (!name) throw new Error("Every category needs a name.");
    if (!Number.isFinite(weight) || weight < 0) throw new Error(`"${name}" needs a non-negative weight.`);
    return { name, weight };
  });

  const seen = new Set();
  categories.forEach(({ name }) => {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate category name "${name}" — names must be unique.`);
    seen.add(key);
  });

  return categories;
}

function wireGradingWeights() {
  const form = document.getElementById("form-grading-weights");
  if (!form) return;

  const classId = form.dataset.classId;
  const container = form.querySelector("[data-category-rows]");
  const template = document.getElementById("category-row-template");
  const addBtn = document.getElementById("add-category-row");
  const statusEl = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');

  addBtn.addEventListener("click", () => {
    container.appendChild(template.content.cloneNode(true));
    updateTotal(form);
  });

  container.addEventListener("click", (e) => {
    if (!e.target.matches("[data-remove-row]")) return;
    e.target.closest("[data-category-row]").remove();
    updateTotal(form);
  });

  container.addEventListener("input", () => updateTotal(form));
  updateTotal(form);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus(statusEl, "", "");

    let categories;
    try {
      if (!getToken()) throw new Error("No GitHub token saved yet — add one on the Settings page first.");
      categories = collectCategories(container);
    } catch (err) {
      setStatus(statusEl, "error", err.message);
      return;
    }

    submitBtn.disabled = true;
    setStatus(statusEl, "pending", "Saving…");

    try {
      await commitFile(
        SITE.repo,
        "src/_data/classes.yaml",
        (text) => setArrayField(text, classId, "grade_categories", categories),
        `Update grading weights for ${classId} via on-site Manage page`
      );
      try {
        await dispatchRebuild(SITE.repo, SITE.rebuildWorkflow);
        setStatus(statusEl, "success", "Saved grading weights. This page will reflect them after the next rebuild, in a minute or two.");
      } catch (err) {
        setStatus(
          statusEl,
          "success",
          `Saved grading weights, but couldn't auto-trigger a rebuild (${err.message}). It'll show up after the next nightly rebuild, or trigger "Nightly rebuild" manually from the repo's Actions tab.`
        );
      }
    } catch (err) {
      setStatus(statusEl, "error", err instanceof GHError ? err.message : `Something went wrong: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

wireGradingWeights();
