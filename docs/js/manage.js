import { wireForm, siteUrl } from "./manage-core.js";
import { makeId, slugify } from "./yaml-entry.js";

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
