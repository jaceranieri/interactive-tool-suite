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
  round-trip, plus click through Export, the Layers panel, folder
  support, and this session's UI-polish animations once for real. **The
  person already hit one real "forgot to redeploy" issue this project**
  — a stale `TabManagerJs.html` in their live Apps Script project threw
  `tabManager.reorderBlock is not a function` after the Layers panel was
  added. Always re-paste every file listed above together, not just
  whichever one seems related to the latest change.
- **Storage folders**: `apiSaveProject`/`apiListProjects`/etc. in
  `AppScript/Code.gs` all gained a `folder` parameter, plus new
  `apiMoveProject`/`apiCreateFolder`/`apiDeleteFolder`. Re-paste `Code.gs`
  (and, if using the standalone fallback, `storage-backend.gs`) and do a
  real folder create/browse/delete/save-into-folder round-trip before
  trusting it in production.
- **This session's shared-file changes**: `AppShellCss.html`/
  `AppShellJs.html` (button press animation, toast spinner, entrance
  keyframes), `SlideManagerJs.html`, `TabManagerJs.html` all changed —
  same "re-paste everything together" caution applies.

## This session: UI polish — micro-animations, loading spinners, entrance animations

Added across both tools, CSS-only (no GSAP dependency added), respecting
`prefers-reduced-motion`. See CLAUDE.md's new "UI polish/micro-animation
conventions" bullet under "Conventions" for the full writeup — summary:

- **Button press**: `.btn:active` (plus `.project-action-btn`/
  `.modal-close`) scale down slightly on click — `shared/app-shell.css`,
  applies everywhere automatically.
- **Loading spinners**: `Shell.toast(msg, 'pending')` now renders a small
  spinner alongside the message. Since every Save/Load/Rename/Delete/
  folder operation in both tools already goes through this one function,
  this single change covers loading feedback for every GitHub round trip
  — no per-tool or per-button spinner wiring needed.
- **New tab/slide/block entrance animation**: a newly created slide
  thumbnail (v2), tab thumbnail (Tabbed Panels), or block (Tabbed Panels)
  fades/scales in once, rather than just appearing. **This surfaced and
  required fixing a genuine pre-existing-pattern timing bug**, not just
  new code — see CLAUDE.md for the full explanation:
  1. A manager's `onChange`/`onSlideChange` hook (which triggers the
     render reading the "newly added" flag) fires *before* `addSlide()`/
     `addTab()`/`addBlock()` return the new id — so the flag has to live
     on the manager itself (`SlideManager.lastAddedSlideId`,
     `TabManager.lastAddedTabId`/`lastAddedBlockId`, set internally
     right before the onChange call), not be set by the caller from a
     return value.
  2. Tabbed Panels' "add block" flow renders `renderBlockList()` *twice*
     back-to-back in one synchronous burst — clearing the flag
     synchronously after the first render wiped it before the second
     (the one actually painted) could use it, so the animation silently
     never played. Fixed by deferring the clear to the next
     `requestAnimationFrame` instead.
  This was caught by Playwright testing that specifically checked *which*
  element got the animation class across successive adds, not just
  whether one did — an earlier, less rigorous check ("is there exactly
  one `.thumb-enter` in the DOM") passed while the underlying bug (wrong
  element, or block case: no element at all once painted) was still
  present. Worth remembering as a testing lesson, not just a code one.
- Applied to both repo source and deployed `AppScript/` copies for all
  four touched files (`AnimatedSlidesV2.html`, `TabbedPanels.html`,
  `SlideManagerJs.html`, `TabManagerJs.html`, plus the shared
  `AppShellCss.html`/`AppShellJs.html`); diffed source vs. deployed
  afterward to confirm only the expected 5-substitution boilerplate
  differs.
- **Not done, explicitly out of scope this round** (see the brainstormed
  list from this session if picking it back up): exit/delete animations,
  drag-and-drop reorder reflow animation, folder-navigation crossfade in
  the Open modal, a save-success pulse on the Save button itself, an
  unsaved-changes-dot pulse, animated tab-switching in Tabbed Panels
  (v2's slide switch already GSAP-crossfades; Tabbed Panels' tab switch
  is still instant), selection-outline transitions, invalid-input shake.

## Earlier session: folder support wired into Tabbed Panels

Open modal (breadcrumb, folder rows, new/delete folder) plus a **new**
explicit Save-folder-picker modal (name + folder browser) for a
project's first save — v2 still only infers the destination from
whichever folder the Open modal was last browsing; Tabbed Panels now
lets the person pick/create it directly. Worth considering backporting
the explicit picker to v2 for consistency — not done.

## Earlier session: Tabbed Panels Layers panel

Left-rail drawer (`fa-layer-group` icon) listing the active tab's
blocks, drag or chevron reorder (`TabManager.reorderBlock(id,
direction)`), row click selects + opens the property panel. Mirrors v2's
`layer-panel.js`. Touch/tablet drag-and-drop, a narrow-window layout
pass, and an accessibility pass were considered and explicitly deferred
that session — still open.

## Earlier session: folder support in shared storage (all tools)

See CLAUDE.md's "Storage" bullet — paths, `.gitkeep` placeholders,
`moveProject`/`createFolder`/`deleteFolder`, `renderProjectList()`'s
opt-in folder params. First wired into v2, then Tabbed Panels (above).
**v1 still has no folder support** — no code changes needed until
someone adds it, following either tool's `index.html` as the pattern.

## What's next

1. **Do the real Apps Script round-trips** described above — still the
   single most important unverified thing, and the one that's already
   bitten the person once (the `reorderBlock` stale-deploy error). This
   session added five more files to the "must re-paste together" list.
2. Consider the deferred polish ideas above (exit animations, drag
   reflow, tab-switch animation in Tabbed Panels, etc.) if the person
   wants a further round.
3. Consider backporting the explicit Save-folder-picker to v2 for
   consistency with Tabbed Panels.
4. **Wire folder browsing into v1's Open modal** — the only tool left
   without it.
5. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   not started; needs its own look at
   `tools/animated-slides-v2/index.html`'s settings-panel CSS/JS.
6. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — standing gaps, deferred multiple times now.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Every session now touches more
  `AppScript/*.html` files to hand-sync (this one touched six), worth
  revisiting sooner rather than later — especially given the
  `reorderBlock` stale-deploy bug this project already produced once.

## Where to find things

`CLAUDE.md` has the architecture (including Tabbed Panels' full internal
architecture, the project-wide styles system, content-model decisions,
the shared storage/folder system, and the new UI-polish/micro-animation
conventions), the Apps Script deployment pipeline checklist, and the
local-preview workflow.
