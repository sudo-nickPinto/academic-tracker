# Academic Dashboard

A personal static dashboard for classes, deadlines, materials, announcements, reminders, notes, and grades — built with [Eleventy](https://www.11ty.dev/) and hand-edited YAML data files, published via GitHub Pages.

**Live site:** https://sudo-nickPinto.github.io/academic-tracker/

## How it works

All content lives in plain YAML files under `src/_data/` — classes, deadlines, materials, announcements, reminders, notes, grades, and site settings. Eleventy reads those files and generates a static HTML site into `docs/`, which GitHub Pages serves directly (`main` branch, `/docs` folder).

There's no live sync yet — updates happen on demand. See [`CLAUDE.md`](./CLAUDE.md) for the data schema and the "refresh" workflow used to update the dashboard through a Claude Code session.

A [GitHub Action](.github/workflows/nightly-rebuild.yml) rebuilds the site nightly (and on demand via `workflow_dispatch`) so date-relative sections — Overdue/This Week groupings, the calendar feed — stay accurate day to day without a manual refresh. It only touches `docs/`; your data still only changes when you ask for a refresh.

## Calendar feed

`/deadlines.ics` is an auto-generated calendar feed built from `deadlines.yaml`. Subscribe to it (not a one-time import) from Outlook, Google Calendar, or Apple Calendar and new/changed deadlines show up automatically after each rebuild:

```
https://sudo-nickPinto.github.io/academic-tracker/deadlines.ics
```

## Build & preview locally

```bash
npm install
npm run build     # writes the static site to docs/
npm run serve     # local dev server with live reload
```

`npm run serve` runs Eleventy's own dev server (respects `pathPrefix`, so links resolve correctly locally). To preview the exact `docs/` output as GitHub Pages would serve it, serve it from a parent folder named `academic-tracker/` so the `/academic-tracker/` path prefix matches, e.g.:

```bash
mkdir -p /tmp/preview/academic-tracker && cp -R docs/. /tmp/preview/academic-tracker/
cd /tmp/preview && python3 -m http.server 8000
# then visit http://localhost:8000/academic-tracker/
```

## Structure

```
src/_data/               source-of-truth YAML data (classes, deadlines, materials, announcements, reminders, notes, grades, site)
src/_includes/           shared layout + partials
src/*.njk                page templates (home, per-class, all-deadlines, all-notes)
src/deadlines.11ty.js    generates /deadlines.ics
src/css/                 stylesheet (passthrough-copied, unprocessed)
.github/workflows/       nightly-rebuild Action
docs/                    generated site — do not hand-edit, regenerate with `npm run build`
```

## Roadmap

- **Phase 2:** pull deadlines/materials/announcements from Moodle via its Web Services API.
- **Phase 3:** pull calendar events and mail from Outlook via Microsoft Graph.

Both are future, opt-in integrations that would populate the same YAML files described above — see `CLAUDE.md` for details.
