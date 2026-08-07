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
- **Storage**: projects are JSON files at `projects/{tool-id}/{name}.json`
  in this repo, written via GitHub's Contents API from Apps Script. Rename
  = create the new file, then delete the old one — GitHub's API has no
  native rename. `shared/storage-connector.js` is what every tool calls;
  it auto-detects `google.script.run` (the real, hosted path) vs.
  `fetch()` (a fallback only exercised by local testing, backed by the
  separate standalone `storage-backend.gs`).
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
  - `tabbed-panels/` — new tool, scaffolding stage: authoring UI works in
    local preview (add/edit/delete/reorder tabs and blocks, undo/redo,
    Save/Open/New wired to Storage), but not yet deployed to Apps Script
    (no `AppScript/TabbedPanels*.html` files exist yet, and its `Code.gs`
    `PAGES` entry is still commented out) and has no Export yet. See
    "Tabbed Panels" below for its architecture and what's left.

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
  Inactive colour table, matching a supplied design mockup.
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
tab's content is an ordered list of blocks — heading, paragraph, list,
button (external hyperlink), separator. Genuinely different content
model from Animated Slides — that tool's SVG canvas + `x`/`y`/`width`/
`height` element schema doesn't fit flowed content, so it does **not**
reuse `element-types.js` / `element-renderer.js` / `canvas-editor.js`.
What it does share: `shared/design-tokens.css`, `shared/app-shell.css` +
`app-shell.js` (top bar, modals, toasts, `Shell.confirm`/`Shell.prompt`,
project list rendering), `shared/storage-connector.js`, and the same
`Code.gs` `PAGES` + `apiSaveProject`/`apiListProjects`/etc. pattern —
same persistence plumbing as Animated Slides, just a different `content`
shape.

### Internal architecture (`tools/tabbed-panels/`)

Deliberately mirrors v2's file-per-concern split, but simpler where the
underlying problem is simpler — there's no SVG canvas, no GSAP
transitions, no cross-tab element linking, so several v2 concepts
(nodes vs. data, incremental DOM patching, animated diffing between
slides) just don't apply here. Tabs and blocks are plain data;
`renderTabContent()` does a full rebuild on every change rather than
diffing, which is fine at this scale.

- `tab-types.js` — the `BLOCK_TYPES` schema (field definitions per block
  type: heading/paragraph/list/button/separator), same "packing list"
  role as v2's `ELEMENT_TYPES` — the property panel is generated from
  these field lists, not hand-written per type. `makeDefaultBlock()`
  builds a new block's data from schema defaults.
- `block-renderer.js` — the one rendering path (`renderBlock()` /
  `renderTabContent()`), used **unmodified** by both the authoring
  content area and (once built) the exported player — same
  authoring-unawareness rule as `element-renderer.js`: reads plain block
  `data`, returns real DOM, no concept of selection or editing.
- `richtext-editor.js` — the hand-rolled rich-text field (chosen over a
  third-party lib during scaffolding review): a contenteditable div +
  toolbar toggling bold/italic/underline/link via `execCommand`.
  `sanitizeRichHtml()` strips everything outside an explicit allowlist
  (`<b> <i> <u> <a href>`) on every input event, so a value handed to
  `onChange` — and therefore whatever ends up in a saved project — is
  never something a browser paste or a stray `execCommand` call could
  have snuck an unexpected tag/attribute into.
- `tab-manager.js` — `TabManager` owns `tabs` (mutated in place, per the
  usual reference-identity rule) and the active tab. Tabs and blocks are
  tracked by stable `id`, never index — same reasoning as v2's slides/
  elements. `getState()`/`setState()` feed `history.js` directly.
- `history.js` — copied verbatim from `animated-slides-v2/history.js`;
  it's fully generic (works off any `getState`/`setState` pair), so
  there was nothing tool-specific to change.
- `index.html` — page shell + all the UI glue (tab strip with
  add/rename/reorder/delete, left rail of "add block" buttons, the block
  list as the actual editable/previewable surface, a schema-driven
  property drawer for the selected block — same `.side-panel` pattern as
  v2's layers/settings drawers). Project lifecycle (New/Save/Open/
  rename/delete) is copy-adapted from v2's `index.html`, same `Shell` /
  `Storage` calls, different `TOOL_ID` (`'tabbed-panels'`) and content
  shape.

### Content model, settled during scaffolding review

- **Block types**: `heading` (h2/h3, plain text — no inline marks, a
  bold-in-the-middle heading wasn't judged worth the complexity),
  `paragraph` (richtext), `list` (bullet/numbered, flat array of
  richtext items — **no nesting**), `button` (label/url/newTab/style —
  a standalone CTA), `separator` (no fields, just a rule).
- **Inline link vs. button block are deliberately two different things**
  — a link embedded mid-sentence (richtext's `link` mark) and a
  standalone CTA (the `button` block) read differently to a learner, so
  neither collapses into the other.
- **Rich text storage**: sanitized HTML string, not a custom run-based
  model — see `richtext-editor.js` above.

### What's NOT built yet

- **Export** — no self-contained HTML bundle for Articulate yet (v2's
  equivalent: the Export modal + `MODULE_SOURCES` embedding). Given the
  authoring-unaware `block-renderer.js` already exists, export is mostly
  "embed `tab-types.js` + `block-renderer.js` + saved tab data + minimal
  tab-switching JS," same shape as v2's Export, just without an SVG
  renderer/GSAP to carry along.
- **Apps Script deployment** — no `AppScript/TabbedPanels.html` or
  `AppScript/*Js.html` module wrappers exist yet, and its `PAGES` entry
  in `Code.gs` is commented out. Needs the same 5-substitution pass
  described in "The Apps Script deployment pipeline" above before it's
  reachable through the hosted hub. Untested against `google.script.run`
  entirely — Save/Open/New only verified in local preview so far (see
  HANDOFF.md).
- **Touch/tablet drag-and-drop** — tab and block reordering use native
  HTML5 drag-and-drop (copied from v2's layer/slide reordering), which
  has the same known touchscreen gap v2 does.
- No accessibility pass, no narrow-window layout testing — same
  standing gaps as v2, not yet even looked at here.
