# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

## Not yet confirmed by the person (do this first if picking this back up)

**Nothing has touched Apps Script for real, for either tool.** Everything
below was verified working via local browser preview (serving the repo
directly and driving it with Playwright — see CLAUDE.md's "Local preview"
section) — that only exercises the repo-source `tools/*/index.html`
files, never the actual `google.script.run` path.

- **Tabbed Panels**: `AppScript/TabbedPanels.html` + module files exist,
  went through the 5-substitution pass, and the `PAGES` entry is
  uncommented — but none of it has actually been pasted into a live Apps
  Script project yet. Before treating it as done: paste
  `AppScript/TabbedPanels.html`, `TabTypesJs.html`, `RichtextEditorJs.html`,
  `BlockRendererJs.html`, `TabNavJs.html`, `TabManagerJs.html` into the
  Apps Script editor (it already has `HistoryJs.html` — Tabbed Panels
  reuses that one as-is), redeploy, and do a real Save/Open/Rename/Delete
  round-trip, plus click through Export, the Layers panel, and the new
  folder support (below) once for real. **The person already hit one
  real "forgot to redeploy" issue this project** — a stale
  `TabManagerJs.html` in their live Apps Script project threw
  `tabManager.reorderBlock is not a function` in the console after the
  Layers panel was added here. Always re-paste every file listed above
  together, not just whichever one seems related to the latest change.
- **Storage folders** (added two sessions ago, both tools' shared
  backend): `apiSaveProject`/`apiListProjects`/etc. in
  `AppScript/Code.gs` all gained a `folder` parameter, plus new
  `apiMoveProject`/`apiCreateFolder`/`apiDeleteFolder`. This is a
  live-code-path change to something both tools already depend on —
  re-paste `Code.gs` (and, if using the standalone fallback,
  `storage-backend.gs`) and do a real folder create/browse/delete/
  save-into-folder round-trip before trusting it in production, not just
  the folder UI smoke-tested locally.

## This session: folder support wired into Tabbed Panels

Extended Tabbed Panels' Open modal and Save flow with the same folder
browsing v2 already had, plus one thing v2 doesn't have yet — see
CLAUDE.md's "Storage" bullet for the full writeup. Summary:

- **Open modal**: breadcrumb navigation, folder rows, "New folder", and
  per-folder delete — reusing `shared/app-shell.js`'s `renderProjectList()`
  opt-in folder params, same as v2. Added `browseFolder` state (reset to
  `''` each time the Open modal opens) and threaded it through
  `Storage.listProjects`/`loadProject`/`renameProject`/`deleteProject`.
- **New: an explicit Save-folder-picker.** v2 only ever infers a new
  project's destination folder from wherever the Open modal was last
  browsing (`browseFolder`) — asked for directly here instead. Added a
  dedicated `#save-modal` (name field + the same folder-browsing UI, just
  with an empty `projects` array since it's picking a destination not a
  file) that opens on a project's first save. `openSaveModal()` seeds its
  starting folder from `browseFolder` as a convenience default, but the
  person explicitly picks/creates the real destination before confirming.
  Existing (already-named) projects still just save straight back to
  `currentProjectFolder`, no modal.
- Applied to both `tools/tabbed-panels/index.html` (repo source) and
  `AppScript/TabbedPanels.html` (deployed copy), hand-synced per
  CLAUDE.md's deployment pipeline section — verified the diff between the
  two afterward contains only the expected 5-substitution boilerplate,
  nothing else drifted.
- Verified via Playwright against local preview: breadcrumb + folder rows
  render and navigate correctly in the Open modal, per-folder delete
  calls through with a confirm dialog, the Save modal's "New folder"
  flow creates a folder and lands inside it without clobbering the name
  field already typed, and the final save call receives the right
  `{name, folder}` pair. Zero console/page errors across all of it.
- **Worth considering, not done**: backporting the explicit
  Save-folder-picker modal to `animated-slides-v2` too, so both tools
  behave the same way on first save instead of v2 still using the
  implicit "wherever Open was last browsing" behavior.

## Previous session: Tabbed Panels Layers panel

Added a Layers panel to the left rail (`fa-layer-group` icon, next to
Styles), mirroring v2's `layer-panel.js` — lists the active tab's blocks,
reorderable by drag or up/down chevrons (needed a new
`TabManager.reorderBlock(id, direction)`), row click selects the block
and opens the property panel. See CLAUDE.md's Tabbed Panels internal-
architecture section for the full writeup. Touch/tablet drag-and-drop, a
narrow-window layout pass, and an accessibility pass were considered that
session and explicitly deferred — still open, see CLAUDE.md's "What's
NOT built yet" for Tabbed Panels.

## Earlier session: folder support in Save/Open (shared storage, all tools)

Added folder browsing/organizing to the shared save/load system used by
every tool — see CLAUDE.md's "Storage" bullet for the full architecture
(paths, `.gitkeep` placeholders, `moveProject`/`createFolder`/
`deleteFolder`, `renderProjectList()`'s opt-in folder-browsing params).
First wired into `animated-slides-v2` as the reference implementation;
now also wired into Tabbed Panels (this session, above). **v1 still has
no folder support and needs no code changes until someone adds it** —
same opt-in pattern, following either tool's `index.html`.

## What's next

1. **Do the real Apps Script round-trips** described above — for Tabbed
   Panels generally, the folder-support storage changes, and this
   session's Open-modal/Save-modal folder work specifically. Still the
   single most important unverified thing, and the one that's already
   bitten the person once (the `reorderBlock` stale-deploy error).
2. Consider backporting the explicit Save-folder-picker to v2 (see
   above) for consistency between the two tools.
3. **Wire folder browsing into v1's Open modal** — the only tool left
   without it.
4. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   not started; needs its own look at
   `tools/animated-slides-v2/index.html`'s settings-panel CSS/JS.
5. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — standing gaps, explicitly deferred twice now.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Now genuinely two tools' worth of
  `AppScript/*.html` files to hand-sync, worth revisiting sooner rather
  than later — especially given the `reorderBlock` stale-deploy bug this
  project already produced once.

## Where to find things

`CLAUDE.md` has the architecture (including Tabbed Panels' full internal
architecture, the project-wide styles system, content-model decisions,
and the shared storage/folder system), conventions, the Apps Script
deployment pipeline checklist, and the local-preview workflow.
