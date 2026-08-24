const yaml = require("js-yaml");
const md = require("markdown-it")({ html: false, linkify: true, breaks: true });

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addDataExtension("yaml", (contents) => yaml.load(contents));

  eleventyConfig.addPassthroughCopy("src/css");

  eleventyConfig.addFilter("formatDate", (dateStr) => {
    const d = parseDate(dateStr);
    if (!d) return "TBD";
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  });

  eleventyConfig.addFilter("formatDateShort", (dateStr) => {
    const d = parseDate(dateStr);
    if (!d) return "TBD";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  function daysUntilOf(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return Infinity;
    const now = new Date();
    const diffMs = new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0);
    return Math.round(diffMs / 86400000);
  }

  eleventyConfig.addFilter("daysUntil", daysUntilOf);

  eleventyConfig.addFilter("isToday", (dateStr) => {
    const d = parseDate(dateStr);
    if (!d) return false;
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  eleventyConfig.addFilter("byClass", (items, classId) =>
    (items || []).filter((i) => i.class_id === classId)
  );

  eleventyConfig.addFilter("classById", (classesList, id) =>
    (classesList || []).find((c) => c.id === id) || {}
  );

  eleventyConfig.addFilter("sortByDate", (items, field) => {
    return [...(items || [])].sort((a, b) => {
      const da = parseDate(a[field]);
      const db = parseDate(b[field]);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  });

  eleventyConfig.addFilter("notDone", (items) =>
    (items || []).filter((i) => i.status !== "done")
  );

  eleventyConfig.addFilter("doneOnly", (items) =>
    (items || []).filter((i) => i.status === "done")
  );

  eleventyConfig.addFilter("todaysReminders", (items) => {
    const isToday = (dateStr) => {
      const d = parseDate(dateStr);
      if (!d) return false;
      return d.toDateString() === new Date().toDateString();
    };
    return (items || []).filter((r) => !r.done && (!r.date || isToday(r.date)));
  });

  eleventyConfig.addFilter("limit", (items, n) => (items || []).slice(0, n));

  eleventyConfig.addFilter("overdue", (items) =>
    (items || []).filter((i) => daysUntilOf(i.due_date) < 0)
  );

  eleventyConfig.addFilter("dueThisWeek", (items) =>
    (items || []).filter((i) => {
      const n = daysUntilOf(i.due_date);
      return n >= 0 && n <= 7;
    })
  );

  eleventyConfig.addFilter("dueLater", (items) =>
    (items || []).filter((i) => daysUntilOf(i.due_date) > 7)
  );

  eleventyConfig.addFilter("markdown", (content) => md.render(content || ""));

  eleventyConfig.addFilter("gradeAverage", (items) => {
    const list = items || [];
    const hasWeights = list.some((i) => typeof i.weight === "number");

    if (hasWeights) {
      let totalWeight = 0;
      let weightedSum = 0;
      list.forEach((i) => {
        if (typeof i.weight === "number" && typeof i.score === "number" && typeof i.max === "number") {
          weightedSum += (i.score / i.max) * 100 * i.weight;
          totalWeight += i.weight;
        }
      });
      return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;
    }

    let sum = 0;
    let count = 0;
    list.forEach((i) => {
      if (typeof i.score === "number" && typeof i.max === "number") {
        sum += (i.score / i.max) * 100;
        count += 1;
      }
    });
    return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
  });

  return {
    dir: {
      input: "src",
      output: "docs",
      includes: "_includes",
      data: "_data",
    },
    pathPrefix: "/academic-tracker/",
  };
};
