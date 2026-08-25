// One-time onboarding wizard for a fresh fork: commits site.yaml + (optionally)
// a first class, then triggers a rebuild — all against the repo typed into the
// form, not window.SITE_CONFIG.repo (which is still whatever this build was
// last configured with, not necessarily this fork). See CLAUDE.md and the
// setup-wizard plan for why this can't just reuse manage-core.js's wireForm.
import { setToken, verifyToken, commitFile, dispatchRebuild, GHError } from "./gh-client.js";
import { setField, appendEntry, slugify } from "./yaml-entry.js";
import { setStatus } from "./manage-core.js";

const form = document.getElementById("form-setup");

function buildClassEntry(fd) {
  const code = (fd.get("code") || "").trim();
  const name = (fd.get("name") || "").trim();
  if (!code && !name && !(fd.get("id") || "").trim()) return null; // class step skipped entirely

  const id = slugify(fd.get("id") || code || name);
  if (!id) throw new Error("Couldn't derive a class ID for the first class — fill in Code or ID, or clear all class fields to skip it.");
  if (!name) throw new Error("The first class needs a Name (or clear all its fields to skip adding one).");

  return {
    id,
    name,
    code: code || id.toUpperCase(),
    term: fd.get("term") || fd.get("current_term") || "",
    instructor: fd.get("instructor") || "",
    meeting_times: fd.get("meeting_times") || "",
    color: fd.get("color") || "#2b6cb0",
    materials_link: fd.get("materials_link") || "",
    status: "active",
    grade_categories: [],
  };
}

function pagesUrl(repo) {
  const [owner, name] = repo.split("/");
  return `https://${owner}.github.io/${name}/`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const statusEl = form.querySelector(".form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  setStatus(statusEl, "", "");

  const fd = new FormData(form);
  const repo = (fd.get("repo") || "").trim();
  const token = (fd.get("token") || "").trim();
  const title = (fd.get("title") || "").trim();
  const currentTerm = (fd.get("current_term") || "").trim();

  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    setStatus(statusEl, "error", 'Repo should look like "owner/repo".');
    return;
  }
  if (!token) {
    setStatus(statusEl, "error", "Paste a GitHub token first.");
    return;
  }

  let classEntry;
  try {
    classEntry = buildClassEntry(fd);
  } catch (err) {
    setStatus(statusEl, "error", err.message);
    return;
  }

  submitBtn.disabled = true;
  try {
    setToken(token);

    setStatus(statusEl, "pending", "Checking token and repo access…");
    const { login } = await verifyToken(repo);

    setStatus(statusEl, "pending", `Connected as ${login}. Saving site settings…`);
    await commitFile(
      repo,
      "src/_data/site.yaml",
      (text) => setField(setField(setField(text, "repo", repo), "title", title), "current_term", currentTerm),
      "Configure site via setup wizard"
    );

    if (classEntry) {
      setStatus(statusEl, "pending", `Adding class "${classEntry.code}"…`);
      await commitFile(
        repo,
        "src/_data/classes.yaml",
        (text) => appendEntry(text, classEntry),
        `Add first class "${classEntry.code}" via setup wizard`
      );
    }

    setStatus(statusEl, "pending", "Triggering a rebuild…");
    try {
      await dispatchRebuild(repo, "nightly-rebuild.yml");
      setStatus(statusEl, "success", `All set. Your instance will be live in a minute or two at ${pagesUrl(repo)} — add more from Manage, or confirm your token on Settings.`);
    } catch (err) {
      setStatus(
        statusEl,
        "success",
        `Saved, but couldn't auto-trigger a rebuild (${err.message}). Trigger "Nightly rebuild" manually from the repo's Actions tab, or wait for the next nightly run — then check ${pagesUrl(repo)}.`
      );
    }
    form.reset();
  } catch (err) {
    setStatus(statusEl, "error", err instanceof GHError ? err.message : `Something went wrong: ${err.message}`);
  } finally {
    submitBtn.disabled = false;
  }
});
