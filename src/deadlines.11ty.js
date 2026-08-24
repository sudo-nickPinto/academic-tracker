function pad(n) {
  return String(n).padStart(2, "0");
}

// due_date strings are wall-clock times in the school's local timezone
// (America/New_York) with no offset, e.g. "2026-09-29T14:35". Building this
// with `new Date()` and converting to UTC would depend on the *build
// machine's* local timezone — fine locally, but wrong on a UTC GitHub
// Actions runner. Instead, emit a floating local time tagged with an
// explicit TZID so calendar apps do the UTC/DST conversion themselves.
const EVENT_TZID = "America/New_York";

function toFloatingLocal(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(dateStr || "");
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}${mo}${d}T${h}${mi}${s || "00"}`;
}

// DTSTAMP must be a real UTC instant (the moment the feed was generated),
// unlike DTSTART above — this one is safe with `new Date()` since
// toISOString()/getUTC* are timezone-independent.
function toUTCStamp(date) {
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

module.exports = class {
  data() {
    return {
      permalink: "/deadlines.ics",
      eleventyExcludeFromCollections: true,
    };
  }

  render(data) {
    const { deadlines, classes, site } = data;
    const classById = (id) => (classes || []).find((c) => c.id === id) || {};
    const stamp = toUTCStamp(new Date());

    const events = (deadlines || [])
      .filter((d) => d.due_date && d.due_date !== "TBD")
      .map((d) => {
        const dt = toFloatingLocal(d.due_date);
        if (!dt) return "";
        const cls = classById(d.class_id);
        const summary = escapeText(`${cls.code ? cls.code + ": " : ""}${d.title}`);
        const desc = escapeText([d.type, d.notes].filter(Boolean).join(" — "));
        return [
          "BEGIN:VEVENT",
          `UID:${d.id}@academic-tracker`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=${EVENT_TZID}:${dt}`,
          `SUMMARY:${summary}`,
          desc ? `DESCRIPTION:${desc}` : "",
          "END:VEVENT",
        ]
          .filter(Boolean)
          .join("\r\n");
      })
      .filter(Boolean);

    return (
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//academic-tracker//EN",
        "CALSCALE:GREGORIAN",
        `X-WR-CALNAME:${escapeText((site && site.title) || "Academic Dashboard")} Deadlines`,
        ...events,
        "END:VCALENDAR",
      ].join("\r\n") + "\r\n"
    );
  }
};
