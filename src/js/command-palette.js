// Site-wide Cmd/Ctrl+K quick-jump: search across static pages and classes,
// keyboard-navigable, no matches beyond a fuzzy substring filter needed for
// a handful of items. Loaded from base.njk on every page. window.CLASSES is
// injected in base.njk (the same pattern SITE_CONFIG already uses).
import { createEl } from "./manage-core.js";

const SITE = window.SITE_CONFIG || {};
const CLASSES = window.CLASSES || [];

function siteUrl(path) {
  const base = (SITE.pathPrefix || "/").replace(/\/$/, "");
  return `${base}${path}`;
}

const PAGES = [
  { label: "Home", path: "/" },
  { label: "Deadlines", path: "/deadlines/" },
  { label: "Reminders", path: "/reminders/" },
  { label: "Notes", path: "/notes/" },
  { label: "Materials", path: "/materials/" },
  { label: "Analytics", path: "/analytics/" },
  { label: "Manage", path: "/manage/" },
  { label: "Settings", path: "/settings/" },
];

const ALL_ITEMS = [
  ...PAGES.map((p) => ({ kind: "Page", label: p.label, sub: "", href: siteUrl(p.path) })),
  ...CLASSES.map((c) => ({ kind: "Class", label: c.code, sub: c.name || "", href: siteUrl(`/classes/${c.id}/`) })),
];

let overlay = null;
let input = null;
let list = null;
let filtered = ALL_ITEMS;
let activeIndex = 0;

function go(item) {
  closePalette();
  window.location.href = item.href;
}

function renderList() {
  list.textContent = "";
  if (filtered.length === 0) {
    list.appendChild(createEl("li", { className: "cmdk-empty", text: "No matches." }));
    return;
  }
  filtered.forEach((item, i) => {
    const li = createEl("li", {
      className: `cmdk-item${i === activeIndex ? " cmdk-active" : ""}`,
      attrs: { role: "option", "aria-selected": String(i === activeIndex) },
      children: [
        createEl("span", { className: "cmdk-kind", text: item.kind }),
        createEl("span", { className: "cmdk-label", text: item.label }),
        item.sub ? createEl("span", { className: "cmdk-sub", text: item.sub }) : null,
      ],
    });
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      go(item);
    });
    list.appendChild(li);
  });
}

function filterItems(query) {
  const q = query.trim().toLowerCase();
  filtered = q
    ? ALL_ITEMS.filter((it) => it.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q))
    : ALL_ITEMS;
  activeIndex = 0;
  renderList();
}

function move(delta) {
  if (filtered.length === 0) return;
  activeIndex = (activeIndex + delta + filtered.length) % filtered.length;
  renderList();
}

function buildPalette() {
  input = createEl("input", {
    className: "cmdk-input",
    attrs: { type: "text", placeholder: "Jump to a page or class…", "aria-label": "Quick jump search" },
  });
  list = createEl("ul", { className: "cmdk-list", attrs: { role: "listbox" } });

  input.addEventListener("input", () => filterItems(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) go(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  });

  const panel = createEl("div", {
    className: "cmdk-panel",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Quick jump" },
    children: [input, list],
  });

  overlay = createEl("div", { className: "cmdk-overlay", attrs: { hidden: "" }, children: [panel] });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) closePalette();
  });
  document.body.appendChild(overlay);
}

function openPalette() {
  if (!overlay) buildPalette();
  overlay.hidden = false;
  input.value = "";
  filterItems("");
  input.focus();
  document.body.style.overflow = "hidden";
}

function closePalette() {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
    e.preventDefault();
    if (overlay && !overlay.hidden) closePalette();
    else openPalette();
  }
});

const trigger = document.querySelector("[data-cmdk-trigger]");
if (trigger) trigger.addEventListener("click", openPalette);
