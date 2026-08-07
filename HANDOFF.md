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
"Local preview" section). **Nothing has touched Apps Script for real** —
the deployed `AppScript/TabbedPanels.html` + module files exist and went
through the 5-substitution pass, and the `PAGES` entry is uncommented,
but none of it has actually been pasted into a live Apps Script project
yet. Before treating Tabbed Panels as done: paste
`AppScript/TabbedPanels.html`, `TabTypesJs.html`, `RichtextEditorJs.html`,
`BlockRendererJs.html`, `TabNavJs.html`, `TabManagerJs.html` into the
Apps Script editor (it already has `HistoryJs.html` — Tabbed Panels
reuses that one as-is), redeploy, and do a real Save/Open/Rename/Delete
round-trip, plus click through the Export flow once for real.

## What's built across this project's sessions on Tabbed Panels

**Session 1** (scaffolding): resolved the open design questions
(block-schema content model, hand-rolled rich text, block types), built
the original `tools/tabbed-panels/` scaffold, smoke-tested it.

**Session 2** (Apps Script deployment): generated `AppScript/
TabbedPanels.html` + module wrapper files via the 5-substitution pass,
uncommented the `PAGES` entry, opened PR #7.

**Session 3** (this one — canvas redesign + new components, in response
to a supplied mockup): a substantial rework, all pushed to PR #7's
branch as follow-up commits.

- **Canvas redesign**: the authoring canvas is now a white "player card"
  on a gray stage, with a genuinely WYSIWYG tab strip (underline +
  overflow chevrons) — see CLAUDE.md's "Internal architecture" for the
  new `tab-nav.js` module this required (mirrors `nav-bar.js`'s "reused
  verbatim by editor and export" role). Tab add/rename/delete/reorder
  moved out of the canvas entirely into a new Tabs drawer, since the
  WYSIWYG strip only shows what a learner would actually see.
- **New block types**: Badge (label + primary/secondary) and Table
  (add/remove rows and columns in the property panel, plain-text cells).
- **Heading changes**: levels expanded to h2/h3/h4, plus an optional
  `subtitle` field (settled as a field on Heading rather than a separate
  block type — see the clarifying-questions exchange in conversation).
- **Paragraph changes**: added a text-align field (left/center/right/
  justify).
- **New global Styles drawer**: heading/subtitle size+colour, and
  badge/button primary+secondary colour tables (background/text/border)
  — a new `styles` object on project state (`defaultStyles()` in
  `tab-manager.js`), read by `block-renderer.js` as a parameter so
  a block only ever picks a *variant*, never a literal colour.
- **Export built**: self-contained HTML bundle, same pattern as v2's
  Export modal — fetches `tab-types.js`/`block-renderer.js`/`tab-nav.js`
  in the repo-source version, embeds them as `MODULE_SOURCES` string
  constants in the Apps-Script-deployed copy (generated programmatically
  from the real files, not hand-typed, to avoid escaping mistakes).
- **Real bug found and fixed via Playwright smoke testing**: the block
  property panel would go blank after the very first block selection in
  a session (`openPanel()` called `closePanel()`, whose "deselect if we
  were on the property panel" check read the *stale* `activePanel` from
  before the switch). Fixed by splitting the panel-hiding DOM work
  (`hidePanels()`) out from the state-clearing `closePanel()`. Applied
  to both the repo source and the deployed copy, then re-verified with
  the exact repro sequence.
- **Another real bug fixed proactively** (not from smoke testing, caught
  during the styles/tab-manager rewrite): `getState()`/`setState()`
  previously shallow-copied blocks (`{...block}`), which doesn't protect
  nested arrays — `list.items` and (new) `table.rows` would share the
  same array reference between an undo snapshot and the live block, so
  editing the live block could silently corrupt an already-pushed undo
  entry. Fixed with a `cloneBlock()` JSON round-trip.

Every UI change in this session was verified via two rounds of
Playwright smoke testing (initial pass across all 10 checks, then a
targeted re-test of the exact bug-repro sequence after the fix) — see
this session's conversation for the full checklist; both passed clean
on the second round.

## What's next

1. **Do the real Apps Script round-trip** described above — still the
   single most important unverified thing.
2. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — standing gaps carried over from v2, not yet looked at here.
3. Nothing else is currently flagged as missing from the reviewed scope
   (mockup parity, Badge/Table blocks, global Styles, Export) — the next
   likely direction is either the Apps Script verification above, or new
   feature requests from the person once they've tried the redesigned
   canvas.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Now genuinely two tools' worth of
  `AppScript/*.html` files to hand-sync, worth revisiting sooner rather
  than later.

## Where to find things

`CLAUDE.md` has the architecture (including Tabbed Panels' full internal
architecture, the project-wide styles system, and content-model
decisions), conventions, the Apps Script deployment pipeline checklist,
and the local-preview workflow.
