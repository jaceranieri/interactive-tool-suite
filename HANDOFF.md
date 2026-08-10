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
  round-trip, plus click through Export and the new Layers panel once for
  real.
- **Storage folders** (added this session, both tools' shared backend):
  `apiSaveProject`/`apiListProjects`/etc. in `AppScript/Code.gs` all
  gained a `folder` parameter, plus new `apiMoveProject`/
  `apiCreateFolder`/`apiDeleteFolder`. This is a live-code-path change to
  something both tools already depend on — re-paste `Code.gs` (and, if
  using the standalone fallback, `storage-backend.gs`) and do a real
  folder create/browse/delete/save-into-folder round-trip before trusting
  it in production, not just the folder UI smoke-tested locally.

## This session: Tabbed Panels Layers panel

Added a Layers panel to Tabbed Panels' left rail (icon: `fa-layer-group`,
next to Styles), mirroring Animated Slides v2's `layer-panel.js`:

- Lists the active tab's blocks in display order (top of list = top of
  the block list — no inversion needed here, unlike v2's stacking-order
  array, since `tab.blocks` is already stored top-to-bottom).
- Each row shows a type icon and a short content-derived label
  (`blockSummary()` in `index.html` — heading/button/badge text, a
  paragraph's stripped-of-HTML text, list item count, table dimensions,
  or just the type name for a separator) rather than a generic "Heading",
  "Text", etc. for every row of the same type.
- Reorder via drag-and-drop (reuses `TabManager.moveBlockAfter`, same
  mechanic already used by the in-canvas block list) or via up/down
  chevrons, which called for a **new** `TabManager.reorderBlock(id,
  direction)` method (`tools/tabbed-panels/tab-manager.js`) — the
  one-step-at-a-time equivalent v2's `SlideManager.reorderLayer` provides
  for elements. Chevrons disable at the top/bottom of the list rather
  than silently no-op'ing.
- Clicking a row selects that block, same as clicking it on the canvas —
  opens the property panel (closing Layers, since both share the one
  `.side-panel` drawer slot via `openPanel()`/`closePanel()`), consistent
  with how selection already works everywhere else in this tool.
- Applied to both `tools/tabbed-panels/{index.html,tab-manager.js}` (repo
  source) and `AppScript/{TabbedPanels.html,TabManagerJs.html}` (deployed
  copy) in the same commit, hand-synced per CLAUDE.md's deployment
  pipeline section — `reorderBlock` doesn't need adding to
  `MODULE_SOURCES` since Export's embedded bundle is learner-facing only
  (tab-types/block-renderer/tab-nav), not the authoring-only TabManager.
- Verified via Playwright against local preview: chevron reorder,
  drag-and-drop reorder (dispatched DragEvents), row-click-selects-and-
  opens-property-panel, and the block-list canvas staying in sync — all
  passed with zero console/page errors. Icons didn't render in the
  screenshot only because the sandboxed test environment has no outbound
  access to the Font Awesome CDN; not a real bug (see CLAUDE.md's Local
  preview section).

**Explicitly deferred this session** (asked, declined): touch/tablet
drag-and-drop, a narrow-window layout pass, and an accessibility pass for
Tabbed Panels — all still open items, see CLAUDE.md's "What's NOT built
yet" for Tabbed Panels.

## Previous session: folder support in Save/Open (both tools' shared storage)

Added folder browsing/organizing to the shared save/load system used by
every tool — see CLAUDE.md's "Storage" bullet for the full architecture
(paths, `.gitkeep` placeholders, `moveProject`/`createFolder`/
`deleteFolder`, `renderProjectList()`'s opt-in folder-browsing params).
Wired end-to-end into `animated-slides-v2` as the reference
implementation (Open modal breadcrumbs, New/Delete folder, save-into-
last-browsed-folder). **Not yet wired into v1 or Tabbed Panels** — both
still show a flat project list; no code changes needed on their end
until someone adds the same `folders`/`currentFolder`/`onOpenFolder`/etc.
keys to their `Storage.listProjects()` → `Shell.renderProjectList()` call,
following `animated-slides-v2/index.html`'s pattern.

## What's next

1. **Do the real Apps Script round-trips** described above — for both
   Tabbed Panels generally and the new folder-support storage changes
   specifically. Still the single most important unverified thing.
2. **Wire folder browsing into v1 and Tabbed Panels' Open modals** —
   optional, no urgency, but currently only v2 has it.
3. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   not started; needs its own look at
   `tools/animated-slides-v2/index.html`'s settings-panel CSS/JS.
4. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — standing gaps, explicitly deferred again this session.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Now genuinely two tools' worth of
  `AppScript/*.html` files to hand-sync, worth revisiting sooner rather
  than later.

## Where to find things

`CLAUDE.md` has the architecture (including Tabbed Panels' full internal
architecture, the project-wide styles system, content-model decisions,
and the shared storage/folder system), conventions, the Apps Script
deployment pipeline checklist, and the local-preview workflow.
