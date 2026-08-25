# Academic Dashboard

A personal static dashboard for classes, deadlines, materials, announcements, reminders, notes, and grades — built with [Eleventy](https://www.11ty.dev/) and YAML data files, published via GitHub Pages.

**Live site:** https://sudo-nickPinto.github.io/academic-tracker/

## Start your own instance

Want your own copy of this dashboard for your own classes? This repo has a `template` branch — same code, but with the owner's classes/deadlines/grades/etc. cleared out to placeholders — meant to be forked instead of `main`:

1. **Fork this repo** on GitHub. On the fork step, make sure "Copy the `main` branch only" is **unchecked** so your fork gets `template` too.
2. In your fork's **Settings → Branches**, switch the default branch to `template` (or, if you'd rather keep `main` as the name, delete your fork's `main` and rename `template` to `main`).
3. In **Settings → Pages**, set the source to the (now-default) branch, `/docs` folder.
4. In **Settings → Actions → General → Workflow permissions**, select "Read and write permissions" — both the nightly rebuild and the self-serve issue-form pipeline need this to push commits back to your repo.
5. Wait for GitHub Pages to publish (Settings → Pages shows the URL once it's live), then visit `<your-pages-url>/setup/` and fill in the one-time form: your `owner/repo`, a GitHub token scoped to just that repo (the wizard explains exactly what scopes), your site title and current term, and — optionally — your first class. Submitting commits your settings (and first class, if you added one) and kicks off a rebuild.
6. From there, add the rest of your classes/deadlines/grades from [`/manage/`](#adding-content-yourself), the Issue Forms, or a Claude Code "refresh" session against your fork.

Your fork's `main` (or `template`, if you kept the two-branch setup) stays independent of this repo after that — nothing here writes back to your fork, and nothing in your fork writes back here.

## How it works

All content lives in plain YAML files under `src/_data/` — classes, deadlines, materials, announcements, reminders, notes, grades, and site settings. Eleventy reads those files and generates a static HTML site into `docs/`, which GitHub Pages serves directly (`main` branch, `/docs` folder).

Data comes from a Claude Code "refresh" session, the on-site [Manage page](#adding-content-yourself), the issue forms below, or (for calendar events) the Outlook sync script — see Roadmap. See [`CLAUDE.md`](./CLAUDE.md) for the data schema and the "refresh" workflow.

A [GitHub Action](.github/workflows/nightly-rebuild.yml) rebuilds the site nightly (and on demand via `workflow_dispatch`) so date-relative sections — Overdue/This Week groupings, the calendar feed — stay accurate day to day without a manual refresh. It only touches `docs/`; your data still only changes when you ask for a refresh.

## Calendar feed

`/deadlines.ics` is an auto-generated calendar feed built from `deadlines.yaml`. Subscribe to it (not a one-time import) from Outlook, Google Calendar, or Apple Calendar and new/changed deadlines show up automatically after each rebuild:

```
https://sudo-nickPinto.github.io/academic-tracker/deadlines.ics
```

## Adding content yourself

Two ways to add content without a Claude Code session, both committing straight to `main` (no separate review step, same trust model as the nightly rebuild):

**On-site, from `/manage/`.** First visit [`/settings/`](https://sudo-nickPinto.github.io/academic-tracker/settings/) once and paste in a GitHub [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to just this repo (Contents: Read/write, Actions: Read/write, Metadata: Read-only) — it's saved only in your browser's local storage, never sent anywhere but GitHub's API, never committed anywhere. After that, [`/manage/`](https://sudo-nickPinto.github.io/academic-tracker/manage/) has a form for each data type, and every deadline/reminder row on the site gets a one-click "Mark done" toggle. Submitting commits the change directly and kicks off a rebuild, which finishes in a minute or two.

**GitHub Issue Forms.** Open a new issue from the repo's **Issues** tab (works from the GitHub mobile app too) and pick one of: **Add Note**, **Add Grade**, **Add Deadline**, **Add Reminder**, **Add Announcement**. Filling out the form and submitting is enough — a GitHub Action parses it, commits the new entry to the right `src/_data/*.yaml` file, rebuilds the site, comments a link back on the issue once it's live, and closes the issue.

If a submission (either path) is missing something required, you get a specific error instead of a silent bad commit — for the Issue Forms, the Action comments what's wrong and leaves the issue open so re-editing and saving automatically retries it.

## Analytics

The home page leads with a streaks-and-analytics snapshot (current/longest deadline streak, done rate, overall grade, overdue/due-this-week counts), then what needs attention, then a 7-day agenda, before classes and announcements. `/analytics/` has the full breakdown: deadline-completion streaks, upcoming workload by week, per-class grade standing, and notes activity — all computed from the same data files, no separate tracking needed. `/reminders/` lists every reminder, pending and done.

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
src/*.njk                page templates (home, per-class, all-deadlines, all-notes, analytics, reminders, manage, settings)
src/deadlines.11ty.js    generates /deadlines.ics
src/css/                 stylesheet (passthrough-copied, unprocessed)
src/js/                  browser JS for on-site editing (passthrough-copied, unprocessed) — see below
scripts/process-issue.js parses + commits self-serve issue-form submissions
scripts/sync-outlook.js  pulls Outlook calendar events into reminders.yaml (opt-in, run manually — see Roadmap)
.github/ISSUE_TEMPLATE/  issue forms for self-serve submissions
.github/workflows/       nightly-rebuild + process-submission Actions
docs/                    generated site — do not hand-edit, regenerate with `npm run build`
```

`src/js/gh-client.js` wraps the GitHub REST API for the browser (commit a file, dispatch a rebuild) using the token from `/settings/`; `src/js/yaml-entry.js` is a small hand-rolled YAML append/edit helper (no YAML library ships to the browser); `src/js/manage.js`, `settings.js`, `actions.js` wire up the corresponding pages/buttons.

## Roadmap

- **Phase 2 — Moodle:** not yet built. Would pull deadlines/materials/announcements from Moodle via its Web Services API.
- **Phase 3 — Outlook:** calendar half is built — `npm run sync:outlook` pulls upcoming events from your Outlook calendar (via Microsoft Graph, OAuth device code flow) into `reminders.yaml`. Requires your own Azure AD app registration; see `.env.example` and `CLAUDE.md`. It only writes local YAML — review the diff and go through a normal refresh/commit afterward, same as everything else here. Mail sync is not built yet.

Both phases populate the same YAML files described above — see `CLAUDE.md` for details.
