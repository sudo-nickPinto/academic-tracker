# CLAUDE.md

This repo is a static academic dashboard (Eleventy + YAML data files → GitHub Pages). This file tells a future Claude Code session how the data is shaped and how to run a "refresh."

## Data schema (`src/_data/`)

### `classes.yaml` (list)
- `id` — slug, used as the URL segment and foreign key from other files
- `code` — short course code (e.g. "CS 391")
- `name` — full course title
- `term` — e.g. "Fall 2026"
- `instructor` — name only; **do not add phone numbers or personal email addresses** (this repo is public)
- `meeting_times` — free text (days/time/room)
- `color` — hex color used for this class's tags/badges across the site
- `materials_link` — optional course website URL
- `status` — `active` | `archived`
- `grade_categories` — optional list of `{ name, weight }` (`weight` = percent of final grade, e.g. `20`). Entries in `grades.yaml` reference a category by `name`. Leave `[]` until the real breakdown is known.

### `deadlines.yaml` (list)
- `id`, `class_id` (FK into classes), `title`
- `type` — `assignment` | `exam` | `reading` | `project` | `other`
- `due_date` — ISO datetime string, or the literal string `"TBD"` if not yet announced (sorts last, displays as "TBD")
- `status` — `upcoming` | `done`
- `link`, `notes` — optional. Use `notes` to flag any date that was inferred/guessed rather than stated explicitly in a syllabus.

### `announcements.yaml` (list)
- `id`, `class_id`, `date` (ISO), `title`, `body`
- `source` — `manual` | `Moodle` | `Outlook` (provenance, for future phases)

### `materials.yaml` (list)
- `id`, `class_id`, `title`
- `type` — `syllabus` | `slides` | `reading` | `recording` | `link` | `other`
- `link`, `date_added` (ISO date)

### `reminders.yaml` (list)
- `id`, `title`, `date` (optional ISO date — omit for a standing/undated reminder), `note`, `done`

### `notes.yaml` (list)
- `id`, `class_id`, `date` (ISO), `title`
- `body` — Markdown (rendered on the class page and the `/notes/` page via the `markdown` filter)
- `attachment` — optional URL, set when the note was added with a dropped file (see `src/uploads/` below). Omitted entirely when there's no attachment, same convention as `reminders.yaml`'s optional `date`.

### `grades.yaml` (list)
- `id`, `class_id`, `item` (e.g. "Test 1"), `score`, `max` (both numeric)
- `category` — should match a `name` in that class's `grade_categories` (see `classes.yaml`) so it counts toward the weighted average. Anything else (or any class with no `grade_categories` defined) falls back to a simple mean, shown as an "Other" bucket when some categories are defined and others aren't.
- `date` — optional ISO date

### `site.yaml` (singleton)
- `title`, `current_term`, `last_refreshed` (ISO datetime) — keep free of personal identifiers, this file (like all data files) is public.
- `repo` — `"owner/repo"` on GitHub. Read by `src/js/gh-client.js` (via `window.SITE_CONFIG`, injected in `base.njk`) so the on-site Manage/Settings pages know which repo to commit to through the GitHub REST API. Not a secret.
- `rebuild_workflow` — workflow filename (in `.github/workflows/`) dispatched after an on-site edit commits, so `docs/` rebuilds automatically. Currently reuses `nightly-rebuild.yml`, which already has `workflow_dispatch: {}`.

## Generated extras

- **`/deadlines.ics`** — an auto-generated calendar feed built from `deadlines.yaml` (`src/deadlines.11ty.js`). Entries with `due_date: "TBD"` are skipped since there's nothing to schedule yet. Event times are emitted as floating local time with `TZID=America/New_York` (not converted through `Date`/UTC) so the feed is correct regardless of what timezone the machine running `npm run build` is in — this matters because the nightly Action below builds on a UTC runner. If a class ever meets in a different timezone, that will need to become per-event instead of a single constant.
- **Nightly rebuild** — `.github/workflows/nightly-rebuild.yml` runs `npm run build` daily and pushes `docs/` if it changed, so date-relative sections (Overdue/This Week, the deadlines feed) stay accurate without a manual `refresh`. It does **not** touch `src/_data/`, so `last_refreshed` in `site.yaml` still reflects the last real data edit. This workflow needs the repo's Settings → Actions → General → Workflow permissions set to "Read and write permissions" for the default `GITHUB_TOKEN` to be able to push.
- **`/analytics/`** (`src/analytics.njk`) — deadline-completion streaks, a GitHub-contribution-graph-style deadline heatmap, upcoming workload by week, per-class grade standing, and notes activity. All computed by pure-JS filters in `eleventy.config.js` (`deadlineStreaks`, `deadlineHeatmap`, `weeklyWorkload`, `notesActivity`, plus `gradeBreakdown`/`weightedOverall` reused from the class pages). Streaks only look at *past* deadlines (`due_date` in the past, not `"TBD"`): `status: done` is a hit, past-due `status: upcoming` is a miss — it's a completion-rate metric, not a true "submitted on time" metric, since the schema doesn't track submission timestamps. The heatmap (`deadlineHeatmap`) buckets deadlines by due date into a Sunday-to-Saturday week grid, coloring each day's cell by how many deadlines due that day are `status: done` relative to the busiest day in range (0–4, rendered via `data-level` + `color-mix` CSS, no JS/library) — **it's colored by due date, not completion date**, since the schema has no completion timestamp, so marking an old deadline done later brightens that deadline's original due-date cell on the next rebuild rather than today's cell. Bar charts are plain CSS (`width: X%` computed server-side), no JS or charting library. Two more filters built for the home page reuse this same layer: `overallAverage(classesList, grades)` averages each class's `weightedOverall` (skipping classes with no gradeable data) into one headline number, and `agendaByDay(deadlines, reminders, days)` buckets not-yet-done deadlines and pending reminders due within `days` (default 7) by calendar date, for a combined mini-calendar view.
- **`/reminders/`** (`src/reminders.njk`) — full reminders list, split into Pending (`pendingReminders` filter) and Done (`doneReminders` filter) sections, each sorted by date. The home page only surfaces *pending* reminders in its "Needs Your Attention" section; this page is the complete list including done ones.
- **Home page (`src/index.njk`) order** — reordered per the user's request to lead with analytics/streaks rather than raw lists: "This Term at a Glance" (stat grid: current streak, longest streak, done rate, overall grade via `overallAverage`, overdue count, due-this-week count) → "Needs Your Attention" (overdue + due-this-week deadlines, plus pending reminders, each with a one-click done toggle) → "This Week" (7-day agenda via `agendaByDay`, deadlines and reminders interleaved by date) → "Your Classes" → "Recent Announcements".
- **Self-serve submissions via GitHub Issue Forms** — five issue templates under `.github/ISSUE_TEMPLATE/` (`add-note.yml`, `add-grade.yml`, `add-deadline.yml`, `add-reminder.yml`, `add-announcement.yml`) let the user add content from the GitHub UI or mobile app without a Claude Code session. Opening, editing, or reopening one of these issues triggers `.github/workflows/process-submission.yml`, which runs `scripts/process-issue.js`: it skips silently if the issue is already closed (so stray edits to old, already-processed issues are a no-op), otherwise parses the issue body's `### <Label>\n\n<value>` blocks, validates required fields (commenting the specific problem and leaving the issue open on failure — editing the issue's fields re-triggers a retry automatically), generates an id as `<slug>-<issue number>`, **appends** the new entry as text to the matching `src/_data/*.yaml` file (via `yaml.dump` of just that one entry, not a full load/dump round-trip — this preserves the hand-written schema-comment headers, which `js-yaml`'s `dump()` would otherwise strip), rebuilds, commits `src/_data/` + `docs/` together, pushes to `main`, then comments a confirmation with a live-page link and closes the issue. **This auto-commits directly to `main` with no review step** — same trust model as the nightly rebuild, appropriate for a single-owner repo. The `class_id` dropdown options in each issue template are static and need a manual one-line edit whenever `classes.yaml`'s class list changes (new term, dropped/added class) — a "refresh" session should check for this drift when classes change. A `refresh` session should be aware this pipeline exists and not duplicate entries it already added.
- **On-site Manage/Settings pages (bring-your-own PAT)** — a second, faster write path alongside the Issue Forms above, for adding content without leaving the site. `/settings/` (`src/settings.njk` + `src/js/settings.js`) walks the user through creating a fine-grained GitHub PAT scoped to just this repo (Contents: Read/write, Actions: Read/write, Metadata: Read-only) and stores it **only in the browser's `localStorage`**, under the key `academic-tracker:gh-token` — never sent anywhere but `api.github.com`, never written to a tracked file. Every add-form's engine (`setStatus`/`todayISO`/`siteUrl`/`handleAddForm`/`wireForm`) lives in shared `src/js/manage-core.js`; `handleAddForm` `await`s `buildEntry(...)`, so a form's `buildEntry` can be either sync or async (async is what the file-upload forms below need). `src/js/gh-client.js` wraps the GitHub REST API: `getFile`/`commitFile` (Contents API, sha-based optimistic concurrency, one retry on a 409 conflict), `dispatchRebuild` (`workflow_dispatch` on `rebuild_workflow` from `site.yaml`, fired after a successful commit so `docs/` picks up the change within a few minutes), and `uploadFile` (single PUT of a new binary file, no sha, no 409-retry — see `src/uploads/` below). `src/js/yaml-entry.js` is a small hand-rolled YAML mutation module — **not a general YAML library**, purpose-built for this repo's flat-list-of-mappings schema — used instead of `js-yaml` because no YAML library is bundled for the browser; every function (`appendEntry`, `setEntryField`, `reorderEntries`) is designed to always produce output `js-yaml` (used at build time) parses back correctly. Deadline rows and reminder rows also get a `data-toggle-btn` (see `src/_includes/deadline-row.njk`, `reminder-row.njk`) wired by `src/js/actions.js`, so marking something done/not-done is a single click that commits a one-field change via `setEntryField`. If no token is saved yet, clicking a toggle or submitting a form prompts the user to go set one up first. **All write paths use distinct id shapes that can't collide** (Issue Forms use `<slug>-<issue number>`; Manage/class-page forms use `<prefix>-<slug>-<short>` from `makeId()`, `<short>` being a base36 timestamp) so entries from any path coexist safely.
- **Per-class management** — deadlines, notes, grades, materials, and announcements are added from the class's own page (`src/classes.njk`), not a global page: each of those 5 read-sections ends with a `<details class="inline-manage">` (collapsed by default) holding that section's add-form, scoped implicitly to the class via `window.CLASS_ID` (injected in `classes.njk`, read by `src/js/class-manage.js`, which wires all 5 forms — no class `<select>` needed). `/manage/` (`src/manage.njk` + `src/js/manage.js`) only keeps Add Reminder and Add Class, since neither is class-scoped; both js files import the shared engine from `manage-core.js` rather than duplicating it.
- **`src/uploads/`** — destination for files dropped on the Material or Note forms on a class page (both forms carry a `data-drop-zone` div wired by `src/js/class-manage.js`, native HTML5 drag-and-drop, no library). On submit, a present file (5 MB client-side cap, checked before any network call) is committed via `uploadFile()` to `src/uploads/<class_id>/<timestamp36>-<sanitized-filename>` (filename sanitized by `sanitizeFilename()` in `yaml-entry.js`), then the resulting `/uploads/<class_id>/...` URL becomes the material's `link` (overriding the manual link field, if both are given) or the note's `attachment`. Passed through to `docs/uploads/` by `eleventyConfig.addPassthroughCopy("src/uploads")` in `eleventy.config.js` (same mechanism as the `src/css`/`src/js` passthroughs) — reachable only after the next rebuild, not immediately after the commit. Never write into `docs/uploads/` directly.
- **Materials drag-to-reorder** — `materials.yaml` renders in raw file order with no sort filter, so on a class page its `<ul>` (`data-reorder-list`, `data-file="materials.yaml"`) has `<li draggable="true" data-id="...">` entries wired by `src/js/reorder.js` (native HTML5 Drag and Drop, loaded only from `classes.njk`). Dropping an item reorders the DOM optimistically, then commits the new id sequence via `reorderEntries(fileText, orderedIds)` in `yaml-entry.js` — splits the file into its header (schema comments) plus one text block per `id`, reassembles in the given order, and defensively appends any id it doesn't recognize (e.g. a concurrent edit) at the end rather than dropping it — through the existing `commitFile()` pipeline. `notes.yaml` is always rendered sorted by date, so it intentionally has no reorder UI.

## The "refresh" workflow

When the user types `refresh`, do the following:

1. **Ask what changed.** New or completed deadlines, new announcements or materials, updated class info, new/cleared reminders — including text pasted or described from Moodle or Outlook, since there's no live API sync yet (see Roadmap below). Parse whatever they give you into the structured shapes above.
2. **Update the relevant `src/_data/*.yaml` file(s).** Keep ids stable when editing an existing entry (don't regenerate ids for unrelated reasons — other data may reference them). Bump `site.yaml`'s `last_refreshed` to the current time.
3. **Rebuild:** `npm run build`.
4. **Show a diff** of both the changed data files and the regenerated `docs/` output.
5. **Get explicit confirmation** from the user before committing/pushing.
6. **Commit** `src/_data/` and `docs/` together, then push.
7. **Report the live Pages URL** so the user can check it.

Never invent data — if a date or detail isn't provided or confirmable, use `"TBD"` (for `due_date`) or leave the field out, and add a `notes` entry explaining what's uncertain.

## Roadmap

- **Phase 2 — Moodle:** not yet built on this branch. A future `scripts/sync-moodle.js` would call Moodle's Web Services REST API and write into the same YAML schema above. Requires the user to generate a Moodle web-service token (Preferences → Security keys, or via school IT) — feasibility depends on what the school's Moodle instance allows. The token must never be committed to this public repo (use a `.env` file, already gitignored).
- **Phase 3 — Outlook / Microsoft Graph:** scaffolding built — `scripts/sync-outlook.js` (`npm run sync:outlook`). Pulls upcoming calendar events via Microsoft Graph's OAuth device code flow (plain `fetch`, no OAuth library — mirrors Moodle's dependency-free approach) and upserts them into `reminders.yaml`, matched/updated by a `outlook-event-<hash>` id so re-running is idempotent and never stomps a `done` you've already set. Calendar events don't reliably map to a `class_id`, so this writes to `reminders.yaml` (no FK required) rather than `deadlines.yaml`. **Mail sync is not built** — Phase 3's `announcements.yaml` half is still open, since Graph mail has the same class-mapping ambiguity as calendar events, but for arbitrary inbox mail rather than a class's dedicated calendar. Setup requires an Azure AD app registration (public client, "Allow public client flows" on, `Calendars.Read` delegated permission) — see `.env.example` for the exact env vars (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `OUTLOOK_SYNC_DAYS_AHEAD`). May be blocked entirely on a school-managed tenant that disallows app registration. The first run's device-code sign-in caches a refresh token in `.outlook-token-cache.json` (gitignored, mode `0600`) so later runs don't re-prompt; delete that file to force a fresh sign-in. Like `sync-moodle.js`, this only ever writes the local YAML file — it never builds, commits, or pushes; run it, review the diff, then go through the normal `refresh` steps.

Both phases populate the exact same data files and schema described above — no template or site rework should be needed when they land.

## Conventions

- `docs/` is generated output — never hand-edit it, regenerate with `npm run build`.
- This is a public repo. Never add personal contact info (phone numbers, personal emails), tokens, or credentials to any tracked file.
- `pathPrefix` is set to `/academic-tracker/` in `eleventy.config.js` since this is a GitHub Pages *project* page — don't remove it without also updating the Pages URL expectations.
- The GitHub PAT used by `/manage/` and `/settings/` lives **only in the browser's `localStorage`** (see `src/js/gh-client.js`) — it is never sent anywhere but `api.github.com`, never written to a tracked file, and never logged. Sync-script credentials (`.env`, `.outlook-token-cache.json`) follow the same rule and are gitignored. If a future change needs to persist a secret server-side, that's a real architecture decision (this repo currently has no backend) — flag it rather than quietly committing something.
