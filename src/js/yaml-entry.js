// Minimal, purpose-built YAML helpers for this repo's flat-list data files
// (src/_data/*.yaml — see CLAUDE.md for the schema). Not a general YAML
// library: every entry in those files is a flat object of strings/numbers/
// booleans (at most one empty-array field, grade_categories), so a
// hand-rolled emitter that always double-quotes strings is simpler and
// safer in a dependency-free browser script than shipping js-yaml. Output
// only has to be valid YAML that `npm run build`'s js-yaml re-parses
// correctly — it doesn't have to match js-yaml's own (more minimal)
// quoting style. Mirrors scripts/process-issue.js's appendEntry, which does
// the equivalent text-append on the GitHub Actions side.

function quoteYamlString(value) {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

function dumpValue(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.length === 0) return "[]";
  return quoteYamlString(value);
}

/** Renders one flat object as a YAML list-entry block, e.g. `- id: "x"\n  title: "y"`. */
export function dumpEntry(entry) {
  return Object.keys(entry)
    .map((key, i) => `${i === 0 ? "- " : "  "}${key}: ${dumpValue(entry[key])}`)
    .join("\n");
}

/** Appends a new entry to the end of a data file's text content. */
export function appendEntry(fileText, entry) {
  const dumped = dumpEntry(entry);
  const trimmed = fileText.trimEnd();
  if (/\[\]$/.test(trimmed)) {
    return `${trimmed.slice(0, -2)}\n${dumped}\n`;
  }
  return `${trimmed}\n\n${dumped}\n`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces one field's value within the entry whose `id:` matches `id`.
 * Used for "mark done" / "mark not done" toggles. Matches the field line
 * whether or not it's quoted (hand-written files use plain `status:
 * upcoming`; on-site-appended ones use quoted strings).
 */
export function setEntryField(fileText, id, field, newValue) {
  const idPattern = new RegExp(`(^|\\n)(- id: )"?${escapeRegExp(id)}"?(\\n|$)`);
  const idMatch = idPattern.exec(fileText);
  if (!idMatch) {
    throw new Error(`Couldn't find an entry with id "${id}" in this file.`);
  }

  const blockStart = idMatch.index + idMatch[1].length;
  const nextEntryAt = fileText.indexOf("\n- id:", blockStart + 1);
  const blockEnd = nextEntryAt === -1 ? fileText.length : nextEntryAt + 1;
  const block = fileText.slice(blockStart, blockEnd);

  const fieldPattern = new RegExp(`(\\n\\s*${escapeRegExp(field)}: ).*?(\\n|$)`);
  if (!fieldPattern.test(block)) {
    throw new Error(`Entry "${id}" has no "${field}" field to update.`);
  }
  const newBlock = block.replace(fieldPattern, (_, prefix, suffix) => `${prefix}${dumpValue(newValue)}${suffix}`);

  return fileText.slice(0, blockStart) + newBlock + fileText.slice(blockEnd);
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
}

/** Generates a reasonably-unique, readable id: "<prefix>-<slug>-<short>". */
export function makeId(prefix, title) {
  const slug = slugify(title);
  const short = Date.now().toString(36).slice(-5);
  return [prefix, slug, short].filter(Boolean).join("-");
}
