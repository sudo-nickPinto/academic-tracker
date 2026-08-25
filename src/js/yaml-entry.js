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

/**
 * Replaces one top-level field's value in a singleton (non-list) data file
 * like site.yaml. Same field-matching regex as setEntryField, minus the
 * `- id:`-block scoping — there's no list entry to scope to.
 */
export function setField(fileText, field, newValue) {
  const pattern = new RegExp(`(^|\\n)(${escapeRegExp(field)}: ).*?(\\n|$)`);
  if (!pattern.test(fileText)) {
    throw new Error(`No "${field}" field found in this file.`);
  }
  return fileText.replace(pattern, (_, pre, mid, suffix) => `${pre}${mid}${dumpValue(newValue)}${suffix}`);
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

/**
 * Makes an uploaded file's original name safe to use as a repo path segment,
 * and prefixes a short timestamp so two people (or two drops) dropping
 * "syllabus.pdf" on the same day don't collide.
 */
export function sanitizeFilename(name) {
  const clean = String(name || "file")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 60);
  const short = Date.now().toString(36).slice(-6);
  return `${short}-${clean || "file"}`;
}

/**
 * Reassembles a data file's entries in `orderedIds` order, preserving the
 * header (schema comments) above the first entry untouched. Any id present
 * in the file but missing from `orderedIds` (e.g. a concurrent edit added an
 * entry this reorder didn't know about) is appended at the end rather than
 * dropped.
 */
export function reorderEntries(fileText, orderedIds) {
  const firstIdx = fileText.search(/^- id: /m);
  if (firstIdx === -1) return fileText;
  const header = fileText.slice(0, firstIdx);

  const blocks = new Map();
  let cursor = firstIdx;
  while (cursor < fileText.length) {
    const lineEnd = fileText.indexOf("\n", cursor);
    const idLine = fileText.slice(cursor, lineEnd === -1 ? fileText.length : lineEnd);
    const idMatch = /^- id: "?([^"\n]+)"?$/.exec(idLine);
    const nextEntryAt = fileText.indexOf("\n- id: ", cursor + 1);
    const blockEnd = nextEntryAt === -1 ? fileText.length : nextEntryAt + 1;
    const block = fileText.slice(cursor, blockEnd);
    if (idMatch) blocks.set(idMatch[1], block);
    cursor = blockEnd;
  }

  const ordered = [];
  orderedIds.forEach((id) => {
    if (blocks.has(id)) {
      ordered.push(blocks.get(id));
      blocks.delete(id);
    }
  });
  blocks.forEach((block) => ordered.push(block));

  return header + ordered.join("");
}
