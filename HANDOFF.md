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
  support, the UI-polish animations, and this session's link fix + table/
  tab-colour/badge styling once for real. **The person already hit one
  real "forgot to redeploy" issue this project** — a stale
  `TabManagerJs.html` in their live Apps Script project threw
  `tabManager.reorderBlock is not a function` after the Layers panel was
  added. Always re-paste every file listed above together, not just
  whichever one seems related to the latest change.
- **Storage folders**: `apiSaveProject`/`apiListProjects`/etc. in
  `AppScript/Code.gs` all gained a `folder` parameter, plus new
  `apiMoveProject`/`apiCreateFolder`/`apiDeleteFolder`. Re-paste `Code.gs`
  (and, if using the standalone fallback, `storage-backend.gs`) and do a
  real folder round-trip before trusting it in production.
- **This session touched five more Tabbed Panels files**:
  `RichtextEditorJs.html` (link fix), `TabManagerJs.html` (new style
  fields + deeper backfill), `BlockRendererJs.html` (table wrapper),
  `TabNavJs.html` (active tab colour), and `TabbedPanels.html` itself
  (CSS + Styles drawer fields + **regenerated `MODULE_SOURCES`**, since
  `block-renderer.js`/`tab-nav.js` changed and Export embeds those as
  baked-in string constants, not `include()`d). Same "re-paste everything
  together" caution applies.

## This session: inline-link bug fix + table/tab-colour/badge styling

**Bug fix — inline hyperlinks in paragraph/list blocks did nothing.**
Root cause: the richtext Link button's click handler is `async` (awaits
`Shell.prompt()` for the URL); opening that modal steals focus to its own
input, which clears the contenteditable's text selection immediately —
so by the time the prompt resolved, `execCommand('createLink')` had
nothing selected and silently no-opped. Fixed in
`tools/tabbed-panels/richtext-editor.js` by saving the Range before the
`await` and restoring it after, before calling `execCommand`. Verified
via Playwright: select text, click Link, confirm a URL, the selection is
now correctly wrapped in `<a href>`.

**Table styling — corner radius, cell padding, header/body text size.**
Added as four new number fields (`table.radius`/`cellPadding`/
`headerFontSize`/`bodyFontSize`) alongside the existing bordered/plain
colour variants in `defaultStyles()`, surfaced in the Styles drawer's
Tables section. `block-renderer.js`'s table case now wraps the `<table>`
in a `.tp-table-wrapper` div carrying the radius + border (border-radius
doesn't clip a collapsed-border table reliably; a wrapper div with
`overflow: hidden` does).

**Tab nav — active tab text/underline colour.** New
`tabLabel.activeColor` field, applied by `tab-nav.js` as an inline style
on the `.active` tab only (inactive tabs keep whatever the host page's
own CSS says). New swatch in the Styles drawer's Tab label section.

**Badges — multiple side by side instead of one per line.** `#block-list`
switched from a plain column to `flex-flow: row wrap`; every `.tp-block`
defaults to `flex: 0 0 100%` (forces its own row) except
`.tp-block-badge`, which is `flex: 0 0 auto` and wraps like inline text
alongside adjacent badges. CSS-only, no data-model change — works
retroactively on already-saved projects.

**A real backfill bug also got fixed along the way**:
`TabManager.setState()`'s old/loaded-project backfill only copied
top-level style keys wholesale — an existing project's `styles.table`
object (predating radius/cellPadding/etc.) would already be "present"
and skip the top-level default fallback, silently leaving the new fields
`undefined`. Fixed by making the backfill recurse one level (two for
variant maps like badge/button/table) instead of a flat copy.

All of the above applied to both repo source and every relevant deployed
`AppScript/` file (see the list above), including regenerating Export's
embedded `MODULE_SOURCES` programmatically (not hand-typed) since
`block-renderer.js`/`tab-nav.js` are two of the three modules it bakes
in. Diffed source vs. deployed afterward — clean except the expected
5-substitution boilerplate. Verified via Playwright: link creation,
badges rendering on the same line with a heading forcing a new row after
them, all four new table fields showing correct defaults and the corner-
radius field live-updating a rendered table, and the active-tab colour
swatch live-updating the tab strip.

## Earlier session: UI polish — micro-animations, loading spinners, entrance animations

Button-press scale, a spinner on every `Shell.toast(pending)`, and
one-shot entrance animations for new slides/tabs/blocks — CSS-only,
`prefers-reduced-motion`-aware. See CLAUDE.md's "UI polish/micro-
animation conventions" bullet. This surfaced and fixed a real timing bug
in the underlying "newly added id" tracking (manager's onChange fires
before addX() returns the id to the caller — the flag has to live on the
manager itself, set before that call, and its clear has to be deferred a
frame for flows that render twice back-to-back). Worth reading before
touching entrance-animation code again.

## Earlier session: folder support wired into Tabbed Panels

Open modal (breadcrumb, folder rows, new/delete folder) plus an explicit
Save-folder-picker modal for a project's first save. v2 still only
infers the destination from whichever folder the Open modal was last
browsing — worth considering backporting Tabbed Panels' explicit picker
there for consistency. Not done.

## Earlier session: Tabbed Panels Layers panel

Left-rail drawer listing the active tab's blocks, drag or chevron
reorder. Touch/tablet drag-and-drop, a narrow-window layout pass, and an
accessibility pass were considered and explicitly deferred that session
— still open.

## Earlier session: folder support in shared storage (all tools)

See CLAUDE.md's "Storage" bullet. First wired into v2, then Tabbed
Panels. **v1 still has no folder support.**

## What's next

1. **Do the real Apps Script round-trips** — still the single most
   important unverified thing, and the one that's already bitten the
   person once. This session added five more files to the "must
   re-paste together" list for Tabbed Panels.
2. Consider the deferred polish ideas from the UI-polish session (exit
   animations, drag-reorder reflow, tab-switch animation in Tabbed
   Panels, save-success pulse, etc.) if the person wants a further round.
3. Consider backporting the explicit Save-folder-picker to v2.
4. **Wire folder browsing into v1's Open modal** — the only tool left
   without it.
5. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   not started.
6. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — standing gaps, deferred multiple times now.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Every session now touches more
  `AppScript/*.html` files to hand-sync, worth revisiting sooner rather
  than later.

## Where to find things

`CLAUDE.md` has the architecture (Tabbed Panels' full internal
architecture including this session's table/tab-colour/badge styling
additions, the project-wide styles system, content-model decisions, the
shared storage/folder system, and the UI-polish/micro-animation
conventions), the Apps Script deployment pipeline checklist, and the
local-preview workflow.
