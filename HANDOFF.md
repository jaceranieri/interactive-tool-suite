# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

## Not yet confirmed by the person (do this first if picking this back up)

Everything below was verified working via local browser preview (serving
the repo directly and driving it with Playwright — see CLAUDE.md's
"Local preview" section). **Nothing this session has touched Apps Script
for real** — the deployed `AppScript/TabbedPanels.html` + module files
now exist and went through the 5-substitution pass, and the `PAGES`
entry is uncommented, but none of it has actually been pasted into a
live Apps Script project yet. Before treating Tabbed Panels as done:
paste `AppScript/TabbedPanels.html`, `TabTypesJs.html`,
`RichtextEditorJs.html`, `BlockRendererJs.html`, `TabManagerJs.html`
into the Apps Script editor (it already has `HistoryJs.html` — Tabbed
Panels reuses that one as-is, no new copy needed), redeploy, and do a
real Save/Open/Rename/Delete round-trip. Local preview cannot exercise
`google.script.run` at all, so none of that path has been exercised for
real yet.

## What's built across this project's two sessions on Tabbed Panels

**Session 1** (scaffolding): resolved the open design questions
(block-schema content model, hand-rolled rich text, block types:
heading/paragraph/list/button/separator — inline links and the
standalone button block deliberately kept separate, no nested blocks),
then built `tools/tabbed-panels/`: `tab-types.js`, `tab-manager.js`,
`block-renderer.js`, `richtext-editor.js`, `history.js` (copied verbatim
from v2), and `index.html` (top bar, add-block rail, tab strip, block
list, schema-driven property drawer, Save/Open/New against `Storage`).
Smoke-tested via Playwright — all block types, tab isolation, live
rich-text editing, and undo/redo confirmed working. See CLAUDE.md's
"Tabbed Panels" section for the full architecture writeup.

**Session 2** (this one — Apps Script deployment): generated the
deployed copies from that repo source, applying the 5-substitution pass
from CLAUDE.md's deployment pipeline checklist:

- `AppScript/TabbedPanels.html` — `<base target="_top">` added; the two
  `shared/*.css` `<link>`s and all `<script src="...">` tags (both
  `shared/*.js` and the tool's own five modules) became
  `<?!= include('X'); ?>` scriptlets; the hub link's `href="#"` became
  `href="<?!= baseUrl ?>"`; `STORAGE_API_KEY` became
  `<?!= JSON.stringify(storageApiKey); ?>`. `STORAGE_ENDPOINT` was left
  as a real literal (not templated) matching v2's own pattern — it's the
  same shared `storage-backend.gs` deployment across every tool in the
  suite, distinguished by `TOOL_ID`, not something that needs per-tool
  substitution.
- `AppScript/TabTypesJs.html`, `RichtextEditorJs.html`,
  `BlockRendererJs.html`, `TabManagerJs.html` — each is its `tools/
  tabbed-panels/*.js` source wrapped in `<script>...</script>`, same
  convention as v2's `*Js.html` files.
- **`history.js` reuses the existing `AppScript/HistoryJs.html`** rather
  than getting its own copy — the two files are byte-for-byte identical
  except header comments (it's fully generic, nothing tool-specific to
  adapt), so `TabbedPanels.html` just does `<?!= include('HistoryJs'); ?>`
  directly.
- `Code.gs`'s `tabbed-panels` `PAGES` entry is now **uncommented**
  (status `'in development'`), so it'll show on the hub once redeployed.
- Verified: `node --check` on every module (with the `<?!= ?>` scriptlet
  swapped for a harmless placeholder just for the syntax check) passes
  clean. **Not** verified: an actual paste-into-Apps-Script-and-run —
  see the section above.

## What's next

1. **Do the real Apps Script round-trip** described above — this is the
   single most important unverified thing right now.
2. **Export** — still not built. `block-renderer.js` is already
   authoring-unaware, so this is mostly: embed `tab-types.js` +
   `block-renderer.js` + the saved tab data + minimal tab-switching JS
   into a template, same shape as v2's Export modal, just without an SVG
   renderer/GSAP to carry along.
3. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — all standing gaps carried over from v2, not yet even looked
   at here.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Now genuinely two tools' worth of
  `AppScript/*.html` files to hand-sync, worth revisiting sooner rather
  than later.

## Where to find things

`CLAUDE.md` has the architecture (including Tabbed Panels' internal
architecture section, now noting what's deployed vs. not), conventions,
the Apps Script deployment pipeline checklist, and the local-preview
workflow.
