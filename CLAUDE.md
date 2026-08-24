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

### `grades.yaml` (list)
- `id`, `class_id`, `item` (e.g. "Test 1"), `score`, `max` (both numeric)
- `weight` — optional percent of final grade (e.g. `20`). If any entry for a class has a `weight`, that class's displayed average is weighted; otherwise it's a simple mean.
- `date` — optional ISO date

### `site.yaml` (singleton)
- `title`, `current_term`, `last_refreshed` (ISO datetime) — keep free of personal identifiers, this file (like all data files) is public.

## Generated extras

- **`/deadlines.ics`** — an auto-generated calendar feed built from `deadlines.yaml` (`src/deadlines.11ty.js`). Entries with `due_date: "TBD"` are skipped since there's nothing to schedule yet. Event times are emitted as floating local time with `TZID=America/New_York` (not converted through `Date`/UTC) so the feed is correct regardless of what timezone the machine running `npm run build` is in — this matters because the nightly Action below builds on a UTC runner. If a class ever meets in a different timezone, that will need to become per-event instead of a single constant.
- **Nightly rebuild** — `.github/workflows/nightly-rebuild.yml` runs `npm run build` daily and pushes `docs/` if it changed, so date-relative sections (Overdue/This Week, the deadlines feed) stay accurate without a manual `refresh`. It does **not** touch `src/_data/`, so `last_refreshed` in `site.yaml` still reflects the last real data edit. This workflow needs the repo's Settings → Actions → General → Workflow permissions set to "Read and write permissions" for the default `GITHUB_TOKEN` to be able to push.

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

## Roadmap (not yet built)

- **Phase 2 — Moodle:** a future `scripts/sync_moodle.py` would call Moodle's Web Services REST API and write into the same YAML schema above. Requires the user to generate a Moodle web-service token (Preferences → Security keys, or via school IT) — feasibility depends on what the school's Moodle instance allows. The token must never be committed to this public repo (use a `.env` file, already gitignored).
- **Phase 3 — Outlook / Microsoft Graph:** a future sync script would pull calendar events and mail into `deadlines.yaml` / `announcements.yaml` / `reminders.yaml` via Microsoft Graph OAuth (device code flow). Requires an Azure AD app registration, which the user or their school IT must set up — may be blocked entirely on a school-managed tenant. Credentials must never be committed to this public repo.

Both phases populate the exact same data files and schema described above — no template or site rework should be needed when they land.

## Conventions

- `docs/` is generated output — never hand-edit it, regenerate with `npm run build`.
- This is a public repo. Never add personal contact info (phone numbers, personal emails), tokens, or credentials to any tracked file.
- `pathPrefix` is set to `/academic-tracker/` in `eleventy.config.js` since this is a GitHub Pages *project* page — don't remove it without also updating the Pages URL expectations.
