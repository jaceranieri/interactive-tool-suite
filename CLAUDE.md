# CLAUDE.md

Context for Claude (or any AI assistant) working in this repo. Read this
before making changes, especially to `tools/animated-slides-v2/`. Update
it as the project evolves — a stale CLAUDE.md actively misleads, since
it's read as ground truth rather than double-checked against the code.

## What this is

A suite of interactive e-learning authoring tools for Articulate 360.
Authors use these tools in a browser to build interactive content, which
then exports as self-contained HTML embedded into Articulate courses.
Projects save to this GitHub repo (via an Apps Script backend), not to a
database.

## Architecture

- **Hosting**: everything is served from one Google Apps Script project
  ("Authoring Tools Host"). `AppScript/Code.gs` routes `?page=X` to the
  right tool via a `PAGES` map, which also carries each tool's
  title/description/status shown on the hub — there's no separate
  manifest file to keep in sync with it. `Code.gs` also hosts the
  save/list/load/delete/rename project API (`apiSaveProject` etc.),
  called via `google.script.run` from `shared/storage-connector.js`.
  One-time setup for a fresh Apps Script deployment: Script Properties
  need `GITHUB_TOKEN` (a fine-grained PAT, Contents: Read/write, scoped
  to this repo) and `STORAGE_API_KEY`; `Code.gs`'s `GITHUB_OWNER` /
  `GITHUB_REPO` constants must point at this repo (currently
  `jasonranieri` / `interactive-tool-suite` — these were placeholders
  for a while, worth double-checking they're still correct if save/load
  ever mysteriously fails).
- **Hub**: `?page=hub` (also the default with no `?page=` at all) lists
  every tool straight from `PAGES`.
- **Storage**: projects are JSON files at
  `projects/{tool-id}/{folder}/{name}.json` in this repo (folder is
  optional — omitted or `''` means the tool's root, exactly the old
  `projects/{tool-id}/{name}.json` layout), written via GitHub's Contents
  API from Apps Script. Rename = create the new file, then delete the old
  one — GitHub's API has no native rename; moving a project between
  folders (`moveProject`/`apiMoveProject`) uses the same create-then-
  delete pattern, just varying the directory instead of the filename.
  GitHub has no real empty directories, so a folder only exists once it
  contains a file — `createFolder`/`apiCreateFolder` writes a placeholder
  `.gitkeep` so a newly-made folder shows up immediately; deleting a
  folder (`deleteFolder`/`apiDeleteFolder`) recursively deletes every file
  under it (including nested subfolders), which is sufficient to make
  GitHub stop listing the directory at all. `shared/storage-connector.js`
  is what every tool calls; it auto-detects `google.script.run` (the
  real, hosted path) vs. `fetch()` (a fallback only exercised by local
  testing, backed by the separate standalone `storage-backend.gs`, which
  mirrors the same folder support). `Storage.listProjects(tool, folder)`
  resolves to `{ projects: [{name}], folders: [{name}] }` — both the
  files and the subfolders one level under `folder`, so a tool's Open
  modal can render one browsable listing per level without a second round
  trip just to find subfolders.
  `shared/app-shell.js`'s `renderProjectList()` has opt-in folder-
  browsing support (breadcrumbs, folder rows, a "New folder" button) via
  extra keys on its existing `actions` param (`folders`, `currentFolder`,
  `onOpenFolder`, `onNewFolder`, `onDeleteFolder`) — omit all of them and
  it renders exactly as it did before folders existed, so tools that
  haven't been wired up for folders yet (currently just v1) need no
  changes. `animated-slides-v2/index.html` was the first tool wired up,
  and the pattern it established — `browseFolder` (where the Open modal
  is currently browsing) and `currentProjectFolder` (where the open
  project actually lives) as separate state, `browseFolder` reset to
  `''` whenever the Open modal is (re)opened, a brand-new project's first
  Save landing in whatever folder was last browsed — carried over as-is
  to Tabbed Panels' `index.html`, which additionally has a dedicated Save
  modal (`#save-modal`, `openSaveModal()`/`confirmSaveAs()`) for picking
  the destination folder explicitly on a project's first save, rather
  than only inheriting whatever the Open modal last browsed — the same
  folder-browsing UI (breadcrumbs, folder rows, "New folder") reused
  inside that modal via the same `renderProjectList()` opt-in params,
  just with an empty `projects` array since it's picking a destination,
  not a file. Worth considering backporting this explicit Save-folder-
  picker to v2 too, for consistency — not done yet. Wiring folder support
  into v1 at all is still outstanding — see "Current status" / "What's
  NOT built yet" below.
- **Shared foundation** (`shared/`): `design-tokens.css` (colors, spacing,
  type — includes an explicit house style: "Colour," not "Color," in
  labels and anywhere user-facing), `app-shell.css` / `app-shell.js` (top
  bar, modals, toasts, project list, and themed `Shell.confirm` /
  `Shell.prompt` dialogs — no native `alert`/`confirm`/`prompt` anywhere,
  they can't be styled and look broken next to the rest of the UI),
  `storage-connector.js`. Every tool includes all of these. Building a
  new tool should start here, not from scratch — see "Starting a new
  tool" below.
- **Tools** live in `tools/{tool-id}/`. Currently:
  - `animated-slides/` (v1) — stable, in production use, not under active
    development.
  - `animated-slides-v2/` — ground-up rebuild of Animated Slides:
    schema-driven element system, undo/redo, cross-slide element linking,
    multi-select. As of this writing, considered feature-complete enough
    that active development has paused (see "Current status").
  - `tabbed-panels/` — schema-driven tab/block authoring tool (flowed
    content, not the SVG canvas the other two tools use). Deployed to
    Apps Script (`AppScript/TabbedPanels*.html`, `Code.gs`'s `PAGES` entry
    uncommented) with a working Export, though the real Apps Script
    save/load round-trip is still unverified end to end — see "What's NOT
    built yet" under "Tabbed Panels" below. See that section for its
    architecture.
  - `toggle-slides/` — a single SVG canvas (reuses Animated Slides v2's
    element engine, not Tabbed Panels' block model) where nav buttons
    independently toggle groups of elements on and off, any number on at
    once, instead of v2's mutually-exclusive slide switching; buttons can
    also hide/reposition elements they don't own, so combinations of
    buttons can read as content reflowing (see "Multi-button reflow"
    under "Toggle Slides" below). Authoring UI, Preview mode, and Export
    all work in local preview. `AppScript/ToggleSlides*.html` exist and
    `Code.gs`'s `PAGES` entry is uncommented, but the round-trip has
    never actually been verified against a live Apps Script deployment
    — see "Toggle Slides" below for its architecture, the Apps Script
    drift warning, and what's left.

## Animated Slides v2's internal architecture

- `element-types.js` — the `ELEMENT_TYPES` schema (field definitions per
  element type: text/rect/arrow/icon). Adding a field here automatically
  gets a property-panel input; adding a type automatically gets an "Add
  element" button. Extend the schema rather than hand-writing per-type UI.
- `element-renderer.js` — the one rendering engine, used **unmodified** by
  both the authoring canvas and the exported player. Never make this
  authoring-aware — it only ever reads/writes plain element `data`
  objects and has no concept of selection, dragging, or editing. Two
  choices worth knowing: text is native SVG `<text>`/`<tspan>`, not
  `<foreignObject>` (opacity + foreignObject interact badly with the
  SVG viewBox scale); GSAP is only used for genuine animated transitions,
  not instant edits.
- `canvas-editor.js` — selection (including multi-select and marquee),
  drag/resize, the contextual popup. Sits on top of the renderer, never
  modifies it. Shift-drag locks movement to whichever axis (horizontal or
  vertical) has moved further from the drag's start point, re-evaluated
  every frame.
- `slide-manager.js` — owns `slides`, `activeIndex`, `canvasSettings`, and
  the live `elements`/`nodes` maps for the active slide. Cross-slide
  element "linking" (the core mechanic of this tool) is just two elements
  on different slides sharing the same `id` — nothing more than that.
  Layer stacking order is the `elements` array's order (index 0 =
  furthest back) — see the "Getting this wrong" bullet under Conventions.
- `history.js`, `layer-panel.js`, `nav-bar.js` — undo/redo, the layer
  list, and the learner-facing nav bar (also reused verbatim by export).

## The Apps Script deployment pipeline — read this before touching v2

`tools/animated-slides-v2/*.html` and `*.js` (repo source — plain
HTML/JS, testable outside Apps Script, see "Local preview" below) are
**not** the same files as the deployed `AppScript/*.html` files. The
deployed files are generated from the repo source by hand-applying
several substitutions. **Every one of these has caused a real, shipped
bug when missed:**

1. `<link>` / `<script src>` tags → `<?!= include('X'); ?>` scriptlets
   (Apps Script has no static file serving). Each standalone `.js` file
   in `tools/animated-slides-v2/` maps to an `AppScript/XJs.html` file
   (e.g. `slide-manager.js` → `AppScript/SlideManagerJs.html`) — same
   code, just wrapped in a `<script>...</script>` tag for `include()`.
2. The Export feature's module-fetching code → embedded `MODULE_SOURCES`
   string constants (Apps Script doesn't serve sibling files at fetchable
   paths, so Export can't `fetch()` them the way a real web server
   could).
3. The "back to hub" link's `href="#"` → `href="<?!= baseUrl ?>"`
   (requires `Code.gs`'s `doGet` to inject `template.baseUrl`).
4. A `<base target="_top">` inserted into `<head>` — Apps Script pages
   render inside a nested iframe; without this, internal links fail with
   an X-Frame-Options error instead of navigating.
5. `STORAGE_API_KEY`'s placeholder → `<?!= JSON.stringify(storageApiKey); ?>`
   (pulled from Script Properties at render time, never hand-pasted).

There's no build script that does this automatically — it's a manual
find-replace pass every time v2's source changes. **If you're
regenerating the Apps Script version, redo all five substitutions, not
just the one related to whatever you just edited.** It's easy to
remember only the one relevant to your specific change and silently
reintroduce one of the others. In practice this session, edits were made
directly to both `tools/animated-slides-v2/index.html` (and the relevant
`.js` module) and the matching `AppScript/*.html` file in the same
commit, keeping them hand-synced change-by-change rather than doing a
wholesale regeneration — that's the safer way to work day-to-day; save
a full from-scratch regeneration (and the 5-step checklist) for when
they've drifted enough that hand-sync isn't practical.

Also worth knowing: **v1's deployed copy
(`AppScript/AnimatedSlides.html`) has manual patches that aren't
in its repo source** (`tools/animated-slides/index.html`) — specifically
the hub link and `<base target="_top">`. If v1 is ever regenerated
wholesale from repo source, those need reapplying, or patch the deployed
file directly instead (as has been done so far).

## Local preview (no Apps Script needed for most of it)

`tools/animated-slides-v2/index.html` loads its own engine as plain
`<script src>` files — `element-types.js`, `element-renderer.js`,
`canvas-editor.js`, `history.js`, `slide-manager.js`, `layer-panel.js`,
`nav-bar.js` — all of which now exist as real standalone files in that
same folder (they didn't for a while; CLAUDE.md described them but they'd
only ever been uploaded as `AppScript/*Js.html`, so the page 404'd on all
seven outside Apps Script — fixed by extracting them verbatim from the
AppScript wrapper files). This means:

```
python3 -m http.server 8000   # from the repo root
# then open http://localhost:8000/tools/animated-slides-v2/index.html
```

renders and is fully interactive — canvas, drag/resize, layers, the
settings/layers drawers, undo/redo, Export, "Load from code" — in a real
browser, without touching Apps Script at all. **Save/Load and the rest of
project management don't work locally** — those go through
`google.script.run`, which only exists once the page is actually served
by Apps Script. GSAP, Font Awesome, and the Google Fonts stylesheet load
from CDN, so local preview still needs real internet access for those
(a sandboxed/offline environment will render the structural layout but
without icons, animation, or the intended fonts).

## Conventions

- **"Colour," not "Color"** — an explicit preference, used in field
  labels and anywhere else it's user-facing.
- **UI polish/micro-animation conventions** (added when button-press,
  loading-spinner, and new-tab/slide entrance animations were added to
  both v2 and Tabbed Panels): CSS-only, no GSAP, using the existing
  `--duration-fast`/`--duration-base`/`--ease-standard` tokens —
  `shared/app-shell.css` has `.btn:active` (and `.project-action-btn`/
  `.modal-close`) press-scale, a `.toast-spinner` shown automatically on
  every `Shell.toast(msg, 'pending')` (which is how every Save/Load/
  Rename/Delete/folder call in both tools already reports progress, so
  this alone covers loading feedback everywhere without each tool
  needing its own spinner), and two reusable one-shot entrance keyframes
  (`.thumb-enter` — scale, for square thumbnails; `.row-enter` — a small
  translateY, for full-width rows/blocks). New micro-animations should
  reuse these rather than adding new keyframes/durations. All of it is
  wrapped in `@media (prefers-reduced-motion: reduce)` — the spinner
  stays (it's functional, not decorative) but just runs slower; the rest
  is disabled outright.
  **The "one-shot entrance" pattern has a real timing trap, worth reading
  before touching it again**: a manager's `addX()`/`duplicateX()` (e.g.
  `SlideManager.addSlide`, `TabManager.addTab`/`addBlock`) fires its own
  `onChange`/`onSlideChange` hook — and therefore the render that reads
  the "newly added id" flag — *before* the method returns that id to its
  caller. Setting the flag from the caller's return value is therefore
  always one render too late. Fix: the flag (`lastAddedSlideId`,
  `lastAddedTabId`, `lastAddedBlockId`) lives **on the manager itself**
  (`SlideManager`/`TabManager`), set internally right before the
  onChange-triggering call, not by the caller in `index.html`. A second,
  subtler trap: Tabbed Panels' "add block" flow triggers **two**
  `renderBlockList()` calls back-to-back in one synchronous burst
  (`addBlock()`'s own `onChange`, then `selectBlock()`'s explicit
  re-render to show the new selection) — clearing the flag synchronously
  at the end of the first render wipes it before the second (the one
  actually painted) ever sees it, so the entrance animation silently
  never plays. Fixed by deferring the clear to the next
  `requestAnimationFrame` instead of clearing inline — see the comment
  above `renderBlockList()`'s clear in `tools/tabbed-panels/index.html`
  for the concrete case, and `renderSlideTabs()`/`renderTabBar()` for the
  same defensive pattern applied even where only one render currently
  happens. Also reset the flag to `null` in each manager's `setState()`
  — a fresh load/undo/redo is never itself an "add" and shouldn't carry
  over a stale animation target.
- **Every drag-derived numeric value gets `Math.round()`'d.** No
  fractional pixel positions.
- **Shared mutable state (`elements`, `nodes`, `canvasSettings`,
  `canvasSettings.nav`) is always mutated in place, never reassigned.**
  Anything holding a reference to these (CanvasEditor, the nav bar)
  depends on that object identity staying stable across loads, undos, and
  slide switches. Getting this wrong caused real bugs more than once —
  see `slide-manager.js`'s `setState()` and `_rebuildActiveSlide()` for
  the correct pattern (delete-and-repopulate keys, not `= {}`). A related
  bug: `goToSlide()`'s incremental transition patches `elements` in
  place rather than rebuilding it, so anything deriving "current order"
  from `Object.keys(elements)` after a plain slide switch can silently
  diverge from the slide's real stored order — `_currentOrder()` /
  `_activeOrder` exist specifically to avoid this trap; see the comment
  in `goToSlide()` if touching layer ordering again.
- **Animating something GSAP can't tween natively** (an SVG path's `d`,
  text reflow, an arrow's angle/length) — tween the underlying numbers
  through a plain proxy object and recompute the real attribute in
  `onUpdate`. See `applyRectStyle` / `applyArrowStyle` / `applyTextStyle`
  in `element-renderer.js`.
- **No native browser dialogs** (`alert` / `confirm` / `prompt`) — use
  `Shell.confirm(message, opts)` / `Shell.prompt(message, default, opts)`
  from `app-shell.js` (both return Promises). Same reasoning extends to
  other raw browser chrome — e.g. settings toggles use a styled slide
  switch (`.switch`/`.switch-slider` in `tools/animated-slides-v2/
  index.html`) rather than a native checkbox, for the same "looks
  intentional, not like unstyled browser default" reason.
- **Slide and element deletion/reordering track identity by stable `id`,
  never by array index.** Indices shift the moment an array is spliced.
  Several real bugs (landing on the wrong slide after a delete, an
  element's stacking order silently dropping newly-added elements) came
  from getting this wrong.
- **Layer stacking order convention**: a slide's `elements` array is
  bottom-to-top (index 0 = furthest back). The layer panel displays it
  reversed (top-of-stack first, matching normal design-tool convention).
  `reorderLayer(id, direction)`'s `direction` is `-1` to move an element
  up the stack (towards the end of the array) — this was inverted for a
  while (a real shipped bug: the "bring forward" button sent elements
  backward), so double-check this if touching that function again.

## Verifying changes before presenting them

There's no automated test suite. What exists:
- `node --check` on each extracted `<script>` block (or directly on the
  standalone `.js` files) before regenerating the Apps Script version —
  catches syntax errors (unbalanced braces, stray commas) before they
  reach the browser. Doesn't catch logic bugs.
- Local preview (see above) — serve the repo and drive it with a real
  browser (Playwright works well for this in an agent session: screenshot
  the result, click through the flow you changed) to visually confirm a
  UI change actually renders and behaves as intended, before asking the
  person to paste-and-redeploy into Apps Script to check it themselves.
  This catches a lot that a syntax check can't.

## Current status

*(Keep this section current — it's the part most likely to go stale.)*

- **v1**: stable, in production use, not under active development.
- **v2**: feature-complete on the original build plan, plus a further
  round of polish and fixes done since: "Load from code" (paste a
  previous Export's HTML back in to rebuild an editable project — see
  `tools/animated-slides-v2/ai-authoring/prompt.md` for a self-contained
  prompt that walks a non-technical author through generating
  export-compatible project data with an LLM, without touching this
  tool directly first); a fixed layer-order bug (reordering could
  silently revert after navigating slides); a fixed inverted
  bring-forward/send-backward chevron bug; shift-to-axis-lock dragging;
  a redesigned left rail (vertical icon-only stack: 4 add-element icons,
  a divider, then Link/Layers/Settings, each opening a non-blocking
  slide-out drawer instead of a modal that covers the canvas); and a
  settings drawer rebuilt as a 2-column grid with a proper Active/
  Inactive colour table, matching a supplied design mockup; and
  folder support in Save/Open (see "Storage" above) — the Open modal
  now browses into folders via breadcrumbs, can create/delete folders,
  and a new project's first save lands in whichever folder was last
  browsed.
  Remaining known gaps: custom color pickers (native color inputs still
  used, just restyled as a small square swatch rather than the full
  redesign a true custom picker would be), a thin icon library (7
  icons), touch/tablet support (layer/slide drag-to-reorder uses native
  HTML5 drag-and-drop, which doesn't work on touchscreens — canvas
  drag/selection is fine, since that's built on pointer events), no
  accessibility pass, narrow-window layout untested.
- **Not yet migrated / not yet built**: nothing is currently being
  migrated from a legacy tool — see "Starting a new tool" below instead.

## Tabbed Panels

An author builds a series of tabs; learners navigate between them. Each
tab's content is an ordered list of blocks — heading (with optional
subtitle), paragraph, list, button (external hyperlink), badge, table,
separator. Genuinely different content model from Animated Slides —
that tool's SVG canvas + `x`/`y`/`width`/`height` element schema doesn't
fit flowed content, so it does **not** reuse `element-types.js` /
`element-renderer.js` / `canvas-editor.js`. What it does share:
`shared/design-tokens.css`, `shared/app-shell.css` + `app-shell.js` (top
bar, modals, toasts, `Shell.confirm`/`Shell.prompt`, project list
rendering), `shared/storage-connector.js`, and the same `Code.gs`
`PAGES` + `apiSaveProject`/`apiListProjects`/etc. pattern — same
persistence plumbing as Animated Slides, just a different `content`
shape.

The authoring canvas is intentionally WYSIWYG: it renders as a white
"player card" on a gray stage with the exact tab-nav markup/CSS the
exported player uses, so editing genuinely previews the learner-facing
result rather than approximating it (see "Internal architecture" below
for how that's structured to stay true).

### Internal architecture (`tools/tabbed-panels/`)

Deliberately mirrors v2's file-per-concern split, but simpler where the
underlying problem is simpler — there's no SVG canvas, no GSAP
transitions, no cross-tab element linking, so several v2 concepts
(nodes vs. data, incremental DOM patching, animated diffing between
slides) just don't apply here. Tabs and blocks are plain data;
`renderTabContent()` does a full rebuild on every change rather than
diffing, which is fine at this scale.

- `tab-types.js` — the `BLOCK_TYPES` schema (field definitions per block
  type: heading/paragraph/list/button/badge/table/separator), same
  "packing list" role as v2's `ELEMENT_TYPES` — the property panel is
  generated from these field lists, not hand-written per type.
  `makeDefaultBlock()` builds a new block's data from schema defaults,
  deep-cloning array/object defaults (`table.rows` is an array of
  arrays, so a shallow copy isn't enough).
- `block-renderer.js` — the one rendering path (`renderBlock()` /
  `renderTabContent()`), used **unmodified** by both the authoring
  content area and the exported player — same authoring-unawareness
  rule as `element-renderer.js`: reads plain block `data` plus the
  project's `styles` object (see below), returns real DOM, no concept of
  selection or editing.
- `tab-nav.js` — the learner-facing tab strip (underline on the active
  tab, left/right chevrons that scroll the strip when tabs overflow).
  Same role as v2's `nav-bar.js`: one rendering + click-handling path,
  reused **unmodified** by both the authoring canvas and Export. All
  tab CRUD (add/rename/delete/reorder) lives *outside* this file, in
  index.html's Tabs drawer — this module only ever renders tabs and
  reports which one was clicked, which is what keeps the canvas
  genuinely WYSIWYG instead of an editor-only approximation.
- `richtext-editor.js` — the hand-rolled rich-text field (chosen over a
  third-party lib during scaffolding review): a contenteditable div +
  toolbar toggling bold/italic/underline/link via `execCommand`.
  `sanitizeRichHtml()` strips everything outside an explicit allowlist
  (`<b> <i> <u> <a href>`) on every input event, so a value handed to
  `onChange` — and therefore whatever ends up in a saved project — is
  never something a browser paste or a stray `execCommand` call could
  have snuck an unexpected tag/attribute into. Table cells are plain
  text, not richtext, so they don't go through this module.
  **Real bug fixed here**: the Link button's click handler is `async`
  (it awaits `Shell.prompt()` for the URL), and `Shell.prompt()` opens a
  modal that steals focus to its own input — which clears the
  contenteditable's text selection the instant that happens. By the time
  the awaited promise resolved, `execCommand('createLink')` had nothing
  selected to act on, so it silently did nothing — this was the actual
  cause of inline links "not working at all," not a sanitizer or
  rendering issue. Fixed by capturing `window.getSelection()`'s Range
  *before* the `await`, then restoring it right after, before calling
  `execCommand`.
- `tab-manager.js` — `TabManager` owns `tabs` and `styles` (both mutated
  in place, per the usual reference-identity rule) and the active tab.
  `defaultStyles()` is the project-wide typography/colour object (see
  below). Tabs and blocks are tracked by stable `id`, never index — same
  reasoning as v2's slides/elements. `getState()`/`setState()` feed
  `history.js` directly, deep-cloning every block (`cloneBlock()`) so
  undo/redo snapshots never share a nested array (list items, table
  rows) with the live block — a real bug hit and fixed this round: a
  shallow `{...block}` copy still shares nested-array references, so
  editing the live block was silently corrupting entries already pushed
  onto the undo stack.
- `history.js` — copied verbatim from `animated-slides-v2/history.js`;
  it's fully generic (works off any `getState`/`setState` pair), so
  there was nothing tool-specific to change.
- `index.html` — page shell + all the UI glue: left rail of "add block"
  buttons plus a Styles drawer opener, the player-card canvas
  (`tab-nav.js` for the strip, `block-renderer.js` for content, both
  fed live state on every change), two `.side-panel` drawers (block
  property panel, global Styles — same pattern as v2's layers/settings
  drawers, **only one open at a time** via `openPanel()`/`closePanel()`),
  a persistent bottom tab bar (`#editor-tab-bar`), and Export. Project
  lifecycle (New/Save/Open/rename/delete) is copy-adapted from v2's
  `index.html`, same `Shell`/`Storage` calls, different `TOOL_ID`
  (`'tabbed-panels'`) and content shape.
  **Export's `<head>` has no static `<style>` or `<link rel="stylesheet">`
  — both are created by the exported page's own `<script>` at runtime
  instead** (`document.createElement('style'|'link')`, appended to
  `document.head`). This was a real bug fix, not a stylistic choice: an
  author reported the exported HTML losing essentially all of its
  class-based styling (tab strip rendering as plain buttons, the button
  block as a bare underlined link, table cells picking up a stray pink
  background) when pasted into an Articulate embed block, while
  structural content and inline JS-set styles (`el.style.x = ...`, e.g.
  heading font-size/colour) still worked fine. That split — inline
  styles surviving, stylesheet-based CSS not — is the signature of an
  embed sanitizer that strips `<style>`/`<link>` tags from pasted HTML
  while still executing `<script>` content; since script execution
  clearly still works, injecting the same CSS via a script-created
  `<style>` element sidesteps whatever is stripping the static tag,
  regardless of the exact sanitizer/CSP mechanism Articulate uses (not
  independently verified — the fix targets the observed symptom).
  Applies to both the local-preview/testing template
  (`fetchModuleSources()`'s caller) and the Apps-Script-deployed
  template — same CSS text, just embedded differently per substitution
  2's usual split.
- **Tab management lives in the bottom bar, not a drawer** — same role
  and layout as v2's `#editor-slide-bar`: one thumbnail per tab
  (`renderTabThumbnail()` renders the SAME `renderBlock()` the real
  canvas uses, at a fixed content width, then scales the whole thing
  down via CSS `transform` — no separate "how do I draw a thumbnail"
  logic to keep in sync, same trick v2's `renderSlideThumbnailSVG()`
  uses), with hover-revealed duplicate/delete buttons, double-click-to-
  rename, and native HTML5 drag-to-reorder. This replaced an earlier
  side-panel "Tabs" drawer once the canvas redesign made the top tab-nav
  strip purely WYSIWYG (click-to-switch only) — tab CRUD needed a home
  outside that strip, and the bottom bar with live-content thumbnails is
  strictly more useful than a plain list ever was.
- **Layers panel** (left rail, `fa-layer-group` icon next to Styles) —
  same drawer mechanism as the property/Styles panels (`openPanel('layers')`,
  one `.side-panel` slot shared between all three), listing the active
  tab's blocks via `renderLayersPanel()` in `index.html`. Directly mirrors
  v2's `layer-panel.js`: drag-to-reorder or up/down chevrons (disabled at
  the top/bottom of the list), row click selects the block (same as
  clicking it on the canvas — opens the property panel, which closes
  Layers since they share the one drawer slot). One real difference from
  v2: `tab.blocks` is already stored top-to-bottom, matching both the
  canvas and the Layers list, so there's no display-order inversion to
  worry about (v2's `elements` array is bottom-to-top, reversed for
  display). Reordering by chevron needed a new `TabManager.reorderBlock(id,
  direction)` — the one-step equivalent of the drag-based
  `moveBlockAfter()`, mirroring `SlideManager.reorderLayer()`. Each row's
  label comes from `blockSummary()` (a short, content-derived string —
  a heading's text, a table's dimensions, etc. — rather than a generic
  type name repeated for every row of the same type).

### Project-wide styles (`defaultStyles()` in `tab-manager.js`)

A block only ever picks a *variant* — heading level (h2/h3/h4), badge,
button, or table style (primary/secondary, or bordered/plain for
tables) — never a literal size/colour. The `styles` object on project
state defines what each variant actually looks like, edited via the
Styles drawer: `h2`/`h3`/`h4`/`subtitle` each have `{ size, color }`;
`badge`, `button`, and `table` each have a named-variant map of
`{ bg, text, border }` (`table`'s variants are `bordered`/`plain` rather
than `primary`/`secondary` — "plain" just sets `border` to the card's
own white, so the grid lines read as absent with no separate rendering
branch needed). Same split v2 uses for nav Active/Inactive colours, and
rendered with the same "Colours" table pattern — `renderVariantColourTable()`
takes an optional `variants` param (`[[key, label], ...]`, defaulting to
primary/secondary) so Badges/Buttons/Tables all share one function
despite different variant names, rather than three near-duplicate
render functions. Every swatch in the Styles drawer (typography colours
included) shares one CSS rule and gets a `title` attribute naming
exactly what it recolours (e.g. "Background — Bordered") — these two
were both real fixes: the colour-table swatches had originally been
added without the sizing/rounding rule the typography swatches already
had (an inconsistency caught during a review pass, not something a
mockup called for), and tooltips were a subsequent explicit request. If
another block type ever needs a colour-table section, reuse
`renderVariantColourTable()` rather than writing a fourth copy.
`block-renderer.js` takes `styles` as a parameter rather than reading a
global, so it stays a pure function of its inputs — this is also what
lets Export embed it unmodified.

**Backlog, not yet done**: Animated Slides v2's own Canvas Settings
drawer has the same swatch-consistency question worth auditing — raised
by the person while reviewing Tabbed Panels' Styles drawer, explicitly
deferred as a separate future pass on `tools/animated-slides-v2/
index.html`, not bundled into this work.

Two more keys cover layout rather than a per-block variant:
`blockSpacing` (a single number, the gap in px between stacked blocks —
applied by setting `#block-list`'s `style.gap` directly, not read by
`block-renderer.js` itself since it's a property of the *container*, not
any individual block) and `tabLabel` (`{ fontSize, paddingX, paddingY }`
for `tab-nav.js`'s `.tp-tabnav-tab` buttons — `renderTabNav()` takes this
as an optional `tabLabelStyle` param and applies it as inline styles,
same "parameter, not a global" reasoning as `block-renderer.js`).
`tabLabel` also carries `activeColor` (the active tab's text + underline
colour, applied only to the `.active` button — inactive tabs still fall
back to the host page's own `.tp-tabnav-tab` CSS) and `table` also
carries `radius`/`cellPadding`/`headerFontSize`/`bodyFontSize` (layout,
not a colour variant, so they live as sibling keys alongside `table`'s
`bordered`/`plain` variant maps rather than a fourth variant). The
Styles drawer's Tables section appends a `field-grid` of these four
number inputs into the same section `renderVariantColourTable()`
returns, so it all reads as one "Tables" group rather than two separate
headings. `block-renderer.js`'s table case wraps the actual `<table>` in
a `.tp-table-wrapper` div carrying the radius + outer border —
border-radius on a `<table>` with `border-collapse: collapse` doesn't
clip reliably across browsers, but `overflow: hidden` on a plain block
div does, which is why the rounding lives one level up rather than on
the table element itself.
**Backfilling these into old saved projects needed more than the
existing flat per-top-level-key copy** in `TabManager.setState()` — a
saved project's existing `styles.table` object would already be
"present" and skip the top-level fallback entirely, silently leaving
`radius`/`cellPadding`/etc. `undefined` rather than picking up the new
defaults. Fixed by making the backfill go one level deep for any
top-level style key that's a plain object (and, for variant maps like
`badge`/`button`/`table`, one level deeper again for each variant) —
see the comment above the backfill loop if this needs touching again
for a future style field.

`styles.pageBackground` (`{ color, transparent }`) controls the
*exported page's* outer background — the area behind `#player-card`,
not the card itself, which stays white. Styles drawer renders it as a
colour swatch plus a "Transparent" toggle (`renderPageBackgroundSection()`
in `index.html`) so an author can drop the embed onto any Articulate
slide colour without a mismatched box around it. `applyPageBackground()`
mirrors the choice onto the authoring `#stage` for live WYSIWYG preview,
except when `transparent` is on — true transparency has nothing
meaningful to show inside the app's own chrome, so the editor falls back
to its normal sunken-surface colour and only the exported HTML's
`openExportModal()` actually emits `background: transparent` (computed
once as `pageBg` before the export template string, substituted into the
`html, body { ... }` rule the same way `modules`/`tabsJSON` already are).
This backfills into old projects for free via the existing one-level-deep
loop above, since `pageBackground` is a plain object like `h2`/`subtitle`.

Blocks are laid out via `#block-list`'s `flex-flow: row wrap` (not a
plain column) specifically so **multiple Badge blocks can sit side by
side** instead of one per line: every `.tp-block` defaults to
`flex: 0 0 100%` (forces its own full-width row), except
`.tp-block-badge`, which is `flex: 0 0 auto` and therefore wraps like
inline text alongside adjacent badges. Any other block type between two
badges still forces its own line before/after, since it keeps the
100%-width default. This is authoring-canvas AND Export CSS — both
`tools/tabbed-panels/index.html`'s `<style>` block and the Export
template's embedded `<style>` block need the same three rules
(`#block-list`, `.tp-block`, `.tp-block-badge`) kept in sync, since the
export ships its own hardcoded copy rather than reusing
`shared/app-shell.css`.

### Content model, settled across two scaffolding/design-review rounds

- **Block types**: `heading` (h2/h3/h4, plain text — no inline marks on
  the main text; an optional `subtitle` field renders a second,
  separately-styled line beneath it rather than being its own block
  type), `paragraph` (richtext + text-align), `list` (bullet/numbered,
  flat array of richtext items — **no nesting**), `button`
  (label/url/style — a standalone CTA), `badge` (label + style),
  `table` (style variant + add/remove rows and columns in the property
  panel, **plain-text cells, no richtext** — kept simple for a dense
  grid), `separator` (no fields, just a rule).
- **Inline link vs. button block are deliberately two different things**
  — a link embedded mid-sentence (richtext's `link` mark) and a
  standalone CTA (the `button` block) read differently to a learner, so
  neither collapses into the other. Both **always open in a new tab** —
  the button block's `newTab` toggle was removed (a course sending the
  learner away from the course entirely was judged to always be the
  wrong default, so it stopped being a per-instance choice); inline
  links get `target`/`rel` forced at *render* time in
  `block-renderer.js`'s `forceLinksToNewTab()`, applied to every `<a>`
  inside a rendered paragraph/list regardless of how the link was
  created, rather than trying to set it at creation time in
  `richtext-editor.js`.
- **Rich text storage**: sanitized HTML string, not a custom run-based
  model — see `richtext-editor.js` above.
- **Tab strip is WYSIWYG, tab CRUD is not** — the canvas only ever
  shows the real underline+chevron tab-nav (click to switch, nothing
  else); add/rename/duplicate/delete/reorder are a deliberately separate
  concern handled entirely in the bottom tab bar, not exposed on the
  canvas itself.

### What's NOT built yet

- **Apps Script deployment exists but is unverified for real** —
  `AppScript/TabbedPanels.html` (+ `TabTypesJs.html`,
  `RichtextEditorJs.html`, `BlockRendererJs.html`, `TabNavJs.html`,
  `TabManagerJs.html`) went through the 5-substitution pass and the
  `PAGES` entry in `Code.gs` is uncommented, so it's reachable from the
  hub once redeployed. Export's module-fetching code was swapped for an
  embedded `MODULE_SOURCES` object (substitution 2) in the deployed
  copy, generated programmatically from the real source files rather
  than hand-typed, to avoid escaping mistakes. Its `history.js` reuses
  the **existing** `AppScript/HistoryJs.html` rather than a duplicate
  copy — byte-for-byte identical generic code, nothing tool-specific to
  wrap separately. None of this has actually been pasted into a live
  Apps Script project yet — untested against real `google.script.run`
  end to end. Do a real Save/Load round-trip before treating this as
  done (see HANDOFF.md).
- **Touch/tablet drag-and-drop** — the Tabs drawer's reorder and the
  block list's reorder both use native HTML5 drag-and-drop (copied from
  v2's layer/slide reordering), which has the same known touchscreen gap
  v2 does.
- No accessibility pass, no narrow-window layout testing — same
  standing gaps as v2, not yet even looked at here.
- Table cells are plain text only (a deliberate scope decision, not an
  oversight — see "Content model" above); revisit only if an author
  specifically asks for rich text inside table cells.

## Toggle Slides

An adaptation of Animated Slides v2 for a genuinely different interaction:
instead of navigating between mutually-exclusive slides, nav buttons each
independently toggle a group of elements on or off, on ONE persistent
canvas. Any number of buttons can be on at once. Worked example: with
buttons A/B/C, pressing A shows Element-A; then pressing C leaves
Element-A shown and also shows Element-C; then pressing B leaves both and
adds Element-B; then pressing C again leaves A and B shown and hides C.
Despite the tool's name there are no "slides" at all — see the four
scoping decisions this was built against (structure/grouping/animation/
initial-state), settled up front before any code was written:
single canvas (not multiple pages each with their own toggle nav), a
button can own a group of several elements (not just one), toggling
fades in/out with GSAP (not an instant show/hide), and each button's
starting on/off state is author-configurable per button (not a single
global default).

**Multi-button reflow (added in a second scoping round, after the base
tool above already existed)**: the original scoping explicitly ruled out
"multiple slides" — but a real request came in for something that reads
like slides from the outside (elements sliding to new positions as
buttons toggle) without actually needing separate slide objects. Worked
through with a concrete example before any code was written: a visible
sentence "A man jumped." with three buttons, Adverb/Adjective/Proper
Noun. Pressing Adverb inserts "quickly" and slides "jumped." right to
make room. Pressing Adjective too (on top) inserts "tall" and slides
"man"/"quickly"/"jumped." right again. Un-pressing Adverb removes
"quickly" and closes the gap **back to Adjective's own layout**, not all
the way back to the original — i.e., whichever buttons are still on
keep asserting their own positions for the elements they touch. Pressing
Proper Noun replaces "A tall man" with "John" by explicitly hiding "A",
"tall", and "man" (not just failing to show them) while showing "John".
None of this needed real multiple slides: it's implemented as
per-button **overrides** on top of the base single-canvas model above —
see `toggle-manager.js`'s class comment (OVERRIDES / CONFLICT RULE) for
the mechanism, and the "Button overrides panel" bullet below for how an
author edits it. The one governing rule, settled explicitly before
implementation: when more than one currently-on button has an override
for the same element, **the most-recently-toggled-ON button wins** —
never a fixed priority/slide order. This was verified against the
worked sentence example end-to-end (see git history for the Playwright
script used) before being considered done.

### Internal architecture (`tools/toggle-slides/`)

Reuses Animated Slides v2's SVG canvas + element engine wholesale, since
the element model (x/y/width/height, text/rect/arrow/icon) is exactly
what this tool needs too — unlike Tabbed Panels, which needed a different
content model entirely. `element-types.js`, `element-renderer.js`,
`canvas-editor.js`, and `history.js` are copied verbatim from
`animated-slides-v2/` (only their header comments were touched); v2's
`slide-manager.js` and `nav-bar.js` are NOT reused, since both are built
around exactly the mutually-exclusive-slide mechanic this tool replaces.

- `toggle-manager.js` — `ToggleManager` is the single-canvas analogue of
  v2's `SlideManager`: owns `elements`/`nodes` (one flat set, no
  per-slide grouping) and `canvasSettings` (artboard/grid/nav style,
  same shape as v2's), plus the toggle mechanic itself: a `buttons` array
  (`{ id, label, elementIds: [...], hideElementIds: [...],
  positionOverrides: { elementId: {x,y} }, defaultOn }`). An element with
  no owning button (not in any button's `elementIds`) is visible by
  default (static content, e.g. a title); one with 1+ owning buttons is
  visible whenever ANY of them is on ("any-of" — most elements will only
  ever have one owning button in practice, but this stays correct if an
  author deliberately assigns the same element to two). That's the base
  case; `hideElementIds` and `positionOverrides` layer the "reflow"
  mechanic on top (see the section above and the file's class comment)
  — a button can hide or reposition ANY element, not just ones it owns.
  `resolve(elementId, activeButtons?)` is the single place the "most
  recently toggled ON wins" conflict rule lives: it walks `toggleOrder`
  (buttonId[], oldest first) in reverse, returns the first show/hide and
  first position override it finds among currently-active buttons, and
  falls back to base ownership visibility / the element's own stored x,y
  if none of the active buttons say anything about that element.
  `toggleButton()` maintains `toggleOrder` (push to the end on ON, remove
  on OFF); `resetVisibleState()` rebuilds it from each button's
  `defaultOn`, in button-list order, whenever preview is (re-)entered —
  same "runtime-only, not part of getState()/setState()" status as
  `visibleState` itself, for the same reason (playback state, not
  project data — only the overrides that PRODUCE it are project data).
  `applyVisibility()` now animates x/y alongside opacity for exactly this
  reason — GSAP's `x`/`y` shorthand on the element group already tweens a
  transform natively (see `element-renderer.js`'s `createElementNode`),
  so no proxy-object trick was needed here unlike the cases described
  under "Animating something GSAP can't tween natively" further down
  this file. `previewButtonOverrides(buttonId)` is a second, separate
  entry point into the same `resolve()` — used only by the button
  overrides panel below to show "what would this look like if only this
  button were on", without touching real `visibleState`/`toggleOrder` at
  all. Layer ordering (`reorderLayer`/`moveLayerBefore`/
  `getLayerOrder`) is copied over near-verbatim from `SlideManager`,
  since "one flat bottom-to-top array" is exactly the same problem with
  or without slides.
  **EDIT vs PREVIEW is the one genuinely new state-management problem
  here, with no v2 equivalent**: v2 can just always show whatever slide
  is active, since only one slide is ever "the truth" at a time. Here,
  the SAME canvas needs to serve two different truths — "everything
  editable and visible so an author can work with it" vs. "only currently
  -on elements visible, exactly what a learner would see" — and showing
  real on/off opacity WHILE also allowing normal drag/select editing
  would make it impossible to tell "this is off" from "I haven't looked
  at it yet." Resolved by never running both at once:
  `applyVisibility(animate)` (opacity + `pointerEvents` per element, from
  `visibleState`) is ONLY ever called while in Preview mode;
  `showAllElements()` (forces every element back to opacity 1,
  interactive) is what runs the rest of the time, including immediately
  on exiting preview. `visibleState` itself (buttonId -> boolean) is
  runtime-only, seeded from each button's `defaultOn` via
  `resetVisibleState()` on every preview entry — it is NOT part of
  `getState()`/`setState()`, since "which buttons are currently on" is
  playback state, not project data.
- `toggle-nav.js` — copied from v2's `nav-bar.js` (same pagination-by-
  page, GSAP page-swap-animation, styling code) with exactly one
  substantive change: v2 tracks a single `activeIndexRef` (one active
  slide); this tracks a whole `Set` of on button ids (`activeIdsRef`),
  and a click always means "flip THIS button, leave every other one
  alone" rather than "switch to this one." Buttons are matched by `id`
  in the active/inactive check, not index, since (unlike v2) the set of
  "on" ids doesn't shift just because the button list was reordered. See
  the file's header comment for the full v2 diff.
- `layer-panel.js` — copied from v2's, with the "linked across slides"
  badge (meaningless here — there's no second canvas to be linked to)
  replaced by a small pill showing which button(s), if any, currently own
  the row's element (via `toggleManager.buttonsForElement()`).
- `index.html` — page shell + UI glue. Left rail: the same 4
  add-element buttons as v2, then Layers/Settings drawer-openers — no
  "add linked element" button, since there's no cross-canvas linking
  concept to link from. Bottom bar (`#editor-button-bar`) is the toggle-
  button equivalent of v2's slide bar: one chip per button (label,
  double-click rename, drag-to-reorder, hover-reveal duplicate/delete),
  plus a small dot toggling that button's `defaultOn`. Assigning an
  element to buttons is a checkbox list (`renderAssignButtonsSection()`)
  rendered into the Layers side-panel below the layer list, reacting to
  `CanvasEditor`'s `onSelect` hook — shows a placeholder when 0 or 2+
  elements are selected, checkboxes (one per current button) when
  exactly 1 is. A top-bar **Preview** button (`togglePreview()`) is the
  only thing that flips between the edit/preview split described above:
  entering preview closes both side panels, deselects, sets
  `#canvas-wrapper` to `pointer-events: none` (blocks direct
  drag/select while a learner-facing preview is live), and calls
  `resetVisibleState()` + `applyVisibility(false)`; exiting reverses all
  of that via `showAllElements()`. The nav bar's `onToggle` callback is
  gated on `previewMode` — clicking a button while NOT previewing is a
  no-op, since `showAllElements()` would just mask it anyway and a
  silent state change armed for the next preview would be confusing.
  Export reuses `element-types.js`/`element-renderer.js`/
  `toggle-manager.js`/`toggle-nav.js` verbatim (same "one engine, no
  second copy to drift" rule as v2 and Tabbed Panels) — the exported
  player is effectively always in "preview mode": it calls
  `resetVisibleState()` + `applyVisibility(false)` once on load, then
  wires the nav bar straight to `toggleManager.toggleButton(id)`, with no
  edit-mode branch to speak of since a learner never edits anything.
  "Load from code" parses `const elements = ...` / `const buttons = ...`
  / `const canvasSettings = ...` back out of a pasted export — same
  approach as v2's import, adapted for the extra `buttons` array.
- **Button overrides panel** (`#button-overrides-panel`, a fourth
  `.side-panel` alongside Layers/Settings — same slide-out mechanism,
  same "only one open at a time" rule: opening it closes the other two
  and vice versa, via `closeButtonOverridesPanel()` calls added into
  `openLayersPanel()`/`openSettingsPanel()`). Opened by clicking a
  button chip in the bottom bar (not its dot/duplicate/delete
  sub-buttons, which `stopPropagation()`). Lists every element on the
  canvas (`renderButtonOverridesPanel()`) with a three-way segmented
  control (No override / Show / Hide, backed by
  `ToggleManager.setElementVisibilityOverride()`) and a "Move" checkbox
  + X/Y number inputs (backed by `setElementPositionOverride()` /
  `clearElementPositionOverride()`) — deliberately numeric fields, not
  drag-on-canvas, since redirecting `CanvasEditor`'s existing drag
  handler to write into a button's override object instead of the
  element's base `x`/`y` would have meant forking its drag-handling
  code; revisit only if numeric-only editing turns out to be a real
  friction point in practice. A **"Preview this button ON"** switch at
  the top of the panel calls `toggleManager.previewButtonOverrides()`
  (same `#canvas-wrapper.preview-active` pointer-events-none treatment
  as the main learner-facing Preview button) so an author can see the
  effect of their overrides without leaving the panel; every edit made
  while it's on calls `refreshButtonOverridePreviewIfActive()`
  afterward so typing a new number or flipping Show/Hide updates the
  live preview immediately rather than only on the next real toggle.
  Opening the panel force-exits the main Preview mode first
  (`if (previewMode) togglePreview();`) since the two are different
  "what does the canvas mean right now" states and were never meant to
  run simultaneously.

### Apps Script deployment

Deployed via the same 5-substitution pipeline as v2/Tabbed Panels (see
"The Apps Script deployment pipeline" above), and `Code.gs`'s `PAGES`
entry is uncommented, so it's reachable from the hub once redeployed.
Four of the seven `.js`/module files this tool needs already existed as
reusable AppScript includes from Animated Slides v2 — `ElementTypesJs.html`,
`ElementRendererJs.html`, `CanvasEditorJs.html`, `HistoryJs.html` — byte-
identical to `tools/toggle-slides/`'s copies, so nothing new was created
for those, just referenced via `include()`. Three genuinely new files were
needed for the parts with no v2 equivalent: `ToggleManagerJs.html`,
`ToggleNavJs.html`, and `ToggleLayerPanelJs.html` — note the "Toggle"
prefix on the last one specifically to avoid colliding with v2's own
existing `LayerPanelJs.html` (Apps Script's file namespace is flat across
the whole project, unlike `tools/{tool-id}/` folders). Export's
module-fetching code was swapped for an embedded `MODULE_SOURCES` object
(substitution 2), generated programmatically from the real source files
(byte-for-byte, verified via direct comparison) rather than hand-typed,
same approach Tabbed Panels used, to avoid escaping mistakes.
**Still unverified end to end**: none of this has actually been pasted
into a live Apps Script project yet — do a real Save/Load round-trip
(same as Tabbed Panels' own open item) before treating this as fully done.

**Multi-button-overrides work is now hand-synced into both deployed
files**: `AppScript/ToggleManagerJs.html` was re-synced byte-for-byte
from `tools/toggle-slides/toggle-manager.js` (pure `<script>` wrap,
substitution 1 only). `AppScript/ToggleSlides.html` got the same
button-overrides panel (HTML/CSS/JS) added from `tools/toggle-slides/
index.html`, applied as a pure additive patch (191 lines, 0 deletions)
against the exact anchor text shared by both files — the new code
doesn't touch `<link>`/`<script src>` tags, the module-fetching/
`MODULE_SOURCES` code, the hub link, `<base target>`, or
`STORAGE_API_KEY`, so none of the other four substitutions were
affected or needed redoing. This tool is still otherwise "unverified
end to end" — the Save/Load round-trip against a real Apps Script
project hasn't been exercised yet — so a real deploy is the next thing
to confirm, not something already checked off here.

### What's NOT built yet

- **Touch/tablet drag-and-drop** — the button bar's reorder uses native
  HTML5 drag-and-drop, same known touchscreen gap as v2's slide/layer
  reordering.
- No accessibility pass, no narrow-window layout testing — same standing
  gaps as v2 and Tabbed Panels.
- No thumbnail preview on the button chips (v2's slide tabs render a
  live mini-SVG per slide; a button chip here has no single "the content"
  to thumbnail, since a button's elements sit among everyone else's on
  the same canvas) — revisit only if authors report losing track of
  which button owns what without opening the Layers panel.
