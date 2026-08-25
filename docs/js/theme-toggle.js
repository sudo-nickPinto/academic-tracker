// Manual light/dark override on top of the OS `prefers-color-scheme`
// default (see the two dark-mode blocks in style.css). The very first choice
// a viewer makes is persisted to localStorage and re-applied pre-paint by
// the inline script in base.njk, so there's no flash of the wrong theme on
// later visits. Loaded site-wide from base.njk.
const KEY = "academic-tracker:theme";
const root = document.documentElement;

function effectiveTheme() {
  const explicit = root.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateButton(btn, theme) {
  btn.textContent = theme === "dark" ? "☀️" : "🌙";
  btn.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

const btn = document.querySelector("[data-theme-toggle]");
if (btn) {
  updateButton(btn, effectiveTheme());
  btn.addEventListener("click", () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private-browsing/storage-blocked: theme still applies for this page load.
    }
    updateButton(btn, next);
  });
}
