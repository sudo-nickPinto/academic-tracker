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

  function pctOf(g) {
    return typeof g.score === "number" && typeof g.max === "number" && g.max > 0
      ? (g.score / g.max) * 100
      : null;
  }

  function simpleAverage(entries) {
    const pcts = entries.map(pctOf).filter((p) => p !== null);
    if (pcts.length === 0) return null;
    const sum = pcts.reduce((a, b) => a + b, 0);
    return Math.round((sum / pcts.length) * 10) / 10;
  }

  // Groups a class's grades by the category weights defined on the class
  // (cls.grade_categories). Entries whose `category` doesn't match a known
  // category land in an "Other" bucket that's shown but not weighted.
  eleventyConfig.addFilter("gradeBreakdown", (grades, cls) => {
    const list = grades || [];
    const categories = (cls && cls.grade_categories) || [];

    if (categories.length === 0) {
      return [{ name: null, weight: null, entries: list, average: simpleAverage(list) }];
    }

    const buckets = categories.map((cat) => {
      const entries = list.filter((g) => g.category === cat.name);
      return { name: cat.name, weight: cat.weight, entries, average: simpleAverage(entries) };
    });

    const knownNames = categories.map((c) => c.name);
    const other = list.filter((g) => !knownNames.includes(g.category));
    if (other.length > 0) {
      buckets.push({ name: "Other", weight: null, entries: other, average: simpleAverage(other) });
    }

    return buckets;
  });

  eleventyConfig.addFilter("weightedOverall", (breakdown) => {
    const list = breakdown || [];
    const weighted = list.filter((b) => typeof b.weight === "number" && b.average !== null);

    if (weighted.length > 0) {
      let totalWeight = 0;
      let weightedSum = 0;
      weighted.forEach((b) => {
        weightedSum += b.average * b.weight;
        totalWeight += b.weight;
      });
      return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;
    }

    return simpleAverage(list.flatMap((b) => b.entries));
  });

  // Past deadlines only (real due dates, not "TBD", not in the future).
  // A `status: done` entry is a "hit"; a past-due `status: upcoming` entry
  // is a "miss." Streaks walk chronologically over hits/misses.
  eleventyConfig.addFilter("deadlineStreaks", (deadlines) => {
    const past = (deadlines || [])
      .filter((d) => d.due_date && d.due_date !== "TBD" && daysUntilOf(d.due_date) < 0)
      .sort((a, b) => parseDate(a.due_date) - parseDate(b.due_date));

    if (past.length === 0) {
      return { current: 0, longest: 0, onTimeRate: null, doneCount: 0, missedCount: 0 };
    }

    let longest = 0;
    let running = 0;
    let current = 0;
    let doneCount = 0;

    past.forEach((d) => {
      const hit = d.status === "done";
      if (hit) doneCount += 1;
      running = hit ? running + 1 : 0;
      if (running > longest) longest = running;
    });

    // Current streak = run of hits at the very end of the chronological list.
    for (let i = past.length - 1; i >= 0; i -= 1) {
      if (past[i].status === "done") current += 1;
      else break;
    }

    const missedCount = past.length - doneCount;
    const onTimeRate = Math.round((doneCount / past.length) * 1000) / 10;

    return { current, longest, onTimeRate, doneCount, missedCount };
  });

  function isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  // Buckets not-done deadlines with real due dates into upcoming ISO weeks.
  eleventyConfig.addFilter("weeklyWorkload", (deadlines) => {
    const upcoming = (deadlines || []).filter(
      (d) => d.status !== "done" && d.due_date && d.due_date !== "TBD" && daysUntilOf(d.due_date) >= 0
    );

    const byWeek = new Map();
    upcoming.forEach((d) => {
      const date = parseDate(d.due_date);
      const key = isoWeekKey(date);
      if (!byWeek.has(key)) {
        byWeek.set(key, { week: key, start: date, count: 0 });
      }
      const bucket = byWeek.get(key);
      bucket.count += 1;
      if (date < bucket.start) bucket.start = date;
    });

    const weeks = [...byWeek.values()].sort((a, b) => a.start - b.start);
    const maxCount = weeks.reduce((m, w) => Math.max(m, w.count), 0);
    weeks.forEach((w) => {
      w.pct = maxCount > 0 ? Math.round((w.count / maxCount) * 100) : 0;
    });

    return weeks;
  });

  // Per-class note counts + most recent note date.
  eleventyConfig.addFilter("notesActivity", (notes, classesList) => {
    const list = notes || [];
    return (classesList || [])
      .map((cls) => {
        const classNotes = list.filter((n) => n.class_id === cls.id);
        const dates = classNotes.map((n) => parseDate(n.date)).filter(Boolean);
        const lastDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;
        return { cls, count: classNotes.length, lastDate };
      })
      .sort((a, b) => b.count - a.count);
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
