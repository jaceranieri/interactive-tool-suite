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
files, never the actual `google.script.run` path. **The Export CSS fix
below (this session) was additionally verified by loading the generated
export HTML standalone in a fresh browser tab** (not just previewed
inside the authoring tool), which is as close to "does this survive
being pasted somewhere else" as this environment can test without an
actual Articulate/LMS embed to try it in — that real-world check still
needs to happen.

- **Tabbed Panels**: `AppScript/TabbedPanels.html` + module files exist,
  went through the 5-substitution pass, and the `PAGES` entry is
  uncommented — but none of it has actually been pasted into a live Apps
  Script project yet. Before treating it as done: paste
  `AppScript/TabbedPanels.html`, `TabTypesJs.html`, `RichtextEditorJs.html`,
  `BlockRendererJs.html`, `TabNavJs.html`, `TabManagerJs.html` into the
  Apps Script editor (it already has `HistoryJs.html` — Tabbed Panels
  reuses that one as-is), redeploy, and do a real Save/Open/Rename/Delete
  round-trip, click through Export, **paste an exported Export into an
  actual Articulate embed block and confirm it now renders styled** (the
  original bug report), and exercise the Layers panel, folder support,
  and the UI-polish animations from earlier sessions once for real.
  **The person already hit one real "forgot to redeploy" issue this
  project** — a stale `TabManagerJs.html` threw
  `tabManager.reorderBlock is not a function` after the Layers panel was
  added. Always re-paste every file together, not just whichever one
  seems related to the latest change — this session alone touched 6 of
  Tabbed Panels' 11 AppScript files.
- **Storage folders**: `apiSaveProject`/`apiListProjects`/etc. in
  `AppScript/Code.gs` all gained a `folder` parameter, plus new
  `apiMoveProject`/`apiCreateFolder`/`apiDeleteFolder`. Re-paste `Code.gs`
  (and, if using the standalone fallback, `storage-backend.gs`) and do a
  real folder round-trip before trusting it in production.

## This session: Articulate export-styling bug fix + always-new-tab links

**Bug fix — exported Tabbed Panels HTML lost its styling when pasted
into an Articulate embed block** (reported with a screenshot: tab strip
rendered as plain unstyled buttons, the button block as a bare
underlined link, table header cells showing a stray pink background —
while structural content and *inline* JS-set styles, like heading
font-size/colour, rendered correctly). That split — inline styles
surviving, stylesheet-based CSS not — is the signature of an embed
sanitizer stripping `<style>`/`<link rel="stylesheet">` tags from pasted
HTML while still executing `<script>` content. Fixed by no longer
shipping a static `<style>`/`<link>` in the exported `<head>` at all —
both are now created by the exported page's own `<script>` at runtime
(`document.createElement('style'|'link')` → `document.head.appendChild`).
Since script execution demonstrably still works (real block data was
rendering correctly), this sidesteps whatever is stripping the static
tags regardless of the exact mechanism (not independently confirmed to
be a sanitizer vs. CSP vs. something else — the fix targets the observed
symptom, described in detail in CLAUDE.md). Applied to both
`openExportModal()` templates (repo source and the Apps-Script-deployed
copy — same CSS text, embedded per the usual substitution-2 split).
**Verified by loading the generated export HTML standalone** (not just
inside the tool) in a fresh Playwright page: card/shadow/radius, tab
strip underline+colour, button background, and table wrapper radius all
confirmed present via computed styles. **Not yet verified in a real
Articulate embed** — that's the one thing this fix still needs from the
person, since this environment has no way to reproduce Articulate's
actual embed sanitization to test against directly.

**Feature — buttons and inline links always open in a new tab.**
Previously the button block had a per-instance "Open in new tab" toggle
(default on); removed entirely from `tab-types.js`'s schema — a course
button sending the learner away from the course entirely was judged to
always be the wrong default, not worth a choice. `block-renderer.js` now
sets `target="_blank"`/`rel="noopener noreferrer"` unconditionally on
the button anchor. Inline links (richtext's `link` mark) previously had
no `target` at all (opened in the same tab/frame); fixed with a new
`forceLinksToNewTab()` helper in `block-renderer.js`, applied to every
`<a>` inside a rendered paragraph/list block at render time — a single
source of truth covering every link regardless of how/when it was
created, rather than trying to set it at link-creation time in
`richtext-editor.js`. Verified via Playwright: created an inline link,
confirmed `target="_blank"` on both it and a button block, both in the
authoring canvas and in a standalone-loaded export.

Applied to repo source and all affected `AppScript/` files:
`TabTypesJs.html`, `BlockRendererJs.html`, `TabbedPanels.html` (CSS/JS +
regenerated `MODULE_SOURCES`, since `tab-types.js`/`block-renderer.js`
both changed and Export bakes those in as string constants). Diffed
source vs. deployed afterward — clean except the expected
5-substitution boilerplate.

## Earlier session: inline-link creation bug fix + table/tab-colour/badge styling

Separate, earlier bug: inline links did nothing at all when created (not
a new-tab issue — the link never got created). Root cause was
`Shell.prompt()`'s modal stealing focus and clearing the contenteditable
selection before `execCommand('createLink')` ran; fixed by saving/
restoring the selection Range around the `await`. Also added that
session: table corner-radius/cell-padding/header-and-body-text-size
controls, an active-tab text/underline colour control, and badges laid
out side by side instead of one per line. See CLAUDE.md for details —
all still in place, unaffected by this session's changes (this session
added *on top of* that work, e.g. the button/link new-tab behavior
touches the same block-renderer.js table/badge code just added, no
conflicts).

## Earlier session: UI polish — micro-animations, loading spinners, entrance animations

Button-press scale, a spinner on every `Shell.toast(pending)`, and
one-shot entrance animations for new slides/tabs/blocks. See CLAUDE.md's
"UI polish/micro-animation conventions" bullet — includes a real timing
bug that was found and fixed in the underlying "newly added id"
tracking, worth reading before touching entrance-animation code again.

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
   important unverified thing. Specifically for this session: **paste an
   exported Tabbed Panels HTML into a real Articulate embed block** and
   confirm the styling fix actually resolves the reported issue there —
   this is the one thing that genuinely could not be verified in this
   environment.
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
architecture including this session's Export-styling fix and the
always-new-tab link behaviour, the project-wide styles system,
content-model decisions, the shared storage/folder system, and the
UI-polish/micro-animation conventions), the Apps Script deployment
pipeline checklist, and the local-preview workflow.
