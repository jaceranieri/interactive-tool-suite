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
  tool" below. Also here, since a scaling-decisions review promoted them
  out of `tools/animated-slides-v2/`: the shared canvas engine —
  `canvas-editor.js`, `element-types.js`, `element-renderer.js` — used by
  any canvas-based (SVG element) tool, and `history.js` (fully generic
  undo/redo, used by both v2 and Tabbed Panels even though the latter
  isn't canvas-based). See "Animated Slides v2's internal architecture"
  below for what each does; see "Scaling decisions" #3 for why they
  moved.
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
  - **Toggle Slides — removed 2026-08-14.** Was a single-canvas tool
    where nav buttons independently toggled groups of elements on and
    off; didn't meet requirements and was deleted (repo source and
    deployed `AppScript/Toggle*.html` files) rather than kept around
    half-finished. May be redeveloped later — see git history at or
    before this commit for its full architecture, the multi-button
    reflow/override-ghosts design, and the live-deployment bug this
    review surfaced (the shared `AppScript/CanvasEditorJs.html` had
    already been synced to v2's popup-free version while
    `AppScript/ToggleSlides.html` still expected the old internal-popup
    behavior, so element property editing was likely broken in the live
    deployment at time of removal). `Code.gs`'s `PAGES` entry is
    commented out, not deleted, in case this is picked back up.

## Animated Slides v2's internal architecture

`element-types.js`, `element-renderer.js`, `canvas-editor.js`, and
`history.js` live in `shared/`, not `tools/animated-slides-v2/` — see
"Scaling decisions" #3. They're described here because this is still
where their design rationale belongs (v2 is where they were built and
is still their most complete consumer); `slide-manager.js`,
`layer-panel.js`, `nav-bar.js`, and `svg-sanitizer.js` remain genuinely
v2-specific and stay in `tools/animated-slides-v2/`.

- `element-types.js` — the `ELEMENT_TYPES` schema (field definitions per
  element type: text/rect/arrow/icon/draw). Adding a field here
  automatically gets a property-panel input; adding a type automatically
  gets an "Add element" button. Extend the schema rather than hand-writing
  per-type UI. One exception to "every type gets an instant-place Add
  element button": `draw` (see "Free draw" below) — its button arms a
  tool instead of placing anything, since a freehand drawing has no
  sane default shape.
- `element-renderer.js` — the one rendering engine, used **unmodified** by
  both the authoring canvas and the exported player. Never make this
  authoring-aware — it only ever reads/writes plain element `data`
  objects and has no concept of selection, dragging, or editing. Two
  choices worth knowing: text is native SVG `<text>`/`<tspan>`, not
  `<foreignObject>` (opacity + foreignObject interact badly with the
  SVG viewBox scale); GSAP is only used for genuine animated transitions,
  not instant edits. `smoothedPathFromPoints()` (Catmull-Rom-to-Bezier)
  is the one place a `draw` element's `points` array becomes an SVG path
  `d` string — used both when a stroke is first drawn and on every later
  resize, so it never needs a second copy in the exported player.
- `canvas-editor.js` — selection (including multi-select and marquee),
  drag/resize, the contextual popup, and freehand-stroke capture (see
  "Free draw" below). Sits on top of the renderer, never modifies it.
  Shift-drag locks movement to whichever axis (horizontal or vertical)
  has moved further from the drag's start point, re-evaluated every
  frame.
- `slide-manager.js` — owns `slides`, `activeIndex`, `canvasSettings`, and
  the live `elements`/`nodes` maps for the active slide. Cross-slide
  element "linking" (the core mechanic of this tool) is just two elements
  on different slides sharing the same `id` — nothing more than that.
  Layer stacking order is the `elements` array's order (index 0 =
  furthest back) — see the "Getting this wrong" bullet under Conventions.
- `history.js` (shared, see above), `layer-panel.js`, `nav-bar.js` —
  undo/redo, the layer list, and the learner-facing nav bar (also reused
  verbatim by export).

### Free draw (the `draw` element type)

Lets an author sketch directly on the canvas instead of only placing
pre-built shapes — a pencil-icon left-rail button (multi-stroke toggle,
not one-shot: clicking it arms `CanvasEditor.drawMode` and it stays on
across repeated strokes until clicked again or Escape is pressed).
Deliberately scoped down from the start: stroke-only (colour/thickness/
opacity, no closed-path fill option), resizable via the same 4-corner
handles every other non-text/arrow type already gets for free, and a
fixed (non-author-configurable) smoothing amount rather than an exposed
slider — all three were explicit scope calls made before writing any
code, not later cuts.

- **Data shape**: like arrow's `length`/`angle`, `points` is a
  type-specific property that isn't user-editable via a form control, so
  it isn't declared in `ELEMENT_TYPES.draw.fields` — it's set directly
  on the data object, the same way core x/y/width/height are. Each point
  is normalized to the element's own bounding box (`x`/`y` both 0..1,
  fraction of `data.width`/`data.height`) — exactly how rect's radius
  fields relate to its box — specifically so plain corner-drag resize
  (no draw-specific code in `_applyResize`/`_renderHandles`) scales the
  whole drawing for free, same as rect/icon.
- **Two-stage smoothing, split by file on purpose**: `canvas-editor.js`'s
  `simplifyPoints()` (Ramer-Douglas-Peucker) runs once, in
  `_finishFreehand()`, against the *raw* pointer trail — this is the
  "de-jitter" step, and it's pointer-specific (only exists at
  capture time), so it has no reason to live in the renderer.
  `element-renderer.js`'s `smoothedPathFromPoints()` (Catmull-Rom-to-
  Bezier) is the separate "how do these points become a curve" step,
  and it only depends on `points` — no pointer data — so it's reused
  identically by both a live authoring resize and the exported player.
  While a stroke is still being drawn, the on-canvas preview is a plain
  unsmoothed polyline (cheap, responsive); the real smoothed path is
  only ever built once, in `_finishFreehand()`, from the simplified
  points — there's no live-smoothing-while-dragging.
- **Draw mode intercepts clicks everywhere, not just on empty canvas** —
  an author needs to be able to draw on top of existing elements. Two
  separate gates make this work: the SVG-level `pointerdown` listener
  checks `drawMode` *before* its usual "only if `e.target === svg`"
  marquee check, and each element node's own `pointerdown` handler (in
  `_attachSelection`) bails out early without calling
  `stopPropagation()` when `drawMode` is on, letting the event bubble up
  to that SVG-level listener instead of starting a select/drag on
  whatever's underneath the stroke.
- Entering draw mode calls `deselect()` first (closes the properties
  popup, which would otherwise sit on top of the canvas while drawing).
  `setDrawMode()` takes a callback (`onDrawModeChange`, a constructor
  option alongside `onSelect`/`onChange`) so `index.html` can toggle the
  left-rail button's active state — same pattern as `onSelect` already
  syncing the layer panel.

### Handwriting font (`fontFamily` on the `text` type)

A second font choice for text elements — "Sans" (the existing IBM Plex
Sans) or "Handwriting" (Caveat) — picked from a dropdown in the
properties popup, same schema-driven pattern as icon's `iconpicker` or
svg's colour swatch. `FONT_FAMILIES` (in `element-renderer.js`) maps a
short key (`sans` / `handwriting`) to a `{ label, css }` pair; adding a
third font choice means adding an entry there AND loading its Google
Font in three places that must all move together — `index.html`'s own
`<head>` (authoring canvas), the Export template's `<head>` inside
`openExportModal()`, and (for the Apps Script deployment) the equivalent
`<head>` `<link>` in `AppScript/AnimatedSlidesV2.html` twice (once for
the authoring page itself, once inside its own copy of the Export
template string) — four total spots, easy to update three of four and
ship a font that measures/wraps correctly in the editor but silently
falls back to the browser default in the exported output.
`element-types.js` declares `fontFamily` as a `fontpicker` field type;
`canvas-editor.js`'s `_buildField` renders it as a `<select>` whose
options are previewed in their own font (`opt.style.fontFamily`) so an
author can see roughly what each choice looks like before picking it.
`measureTextWidth`/`wrapTextLines`/`layoutText` in `element-renderer.js`
all take the resolved font-family CSS string as a parameter now (not a
single hardcoded `TEXT_FONT_FAMILY` constant) so word-wrapping measures
against whichever font the element actually uses.

### Uploaded SVGs (the `svg` element type)

Lets an author upload their own SVG asset (a logo, a custom icon) rather
than being limited to the built-in 7-icon library. Four scope decisions
were settled up front, before any code was written, the same way Free
draw's were: **single accent colour** recolour (every fill/stroke in the
uploaded markup is flattened to one author-chosen colour, not a per-shape
palette — multi-colour source art gets flattened on purpose), **inline-
in-JSON storage** (the sanitized markup lives directly on the element's
data, same as everything else in a project file — no separate asset-file
API), **strict allowlist sanitization** (not a blocklist — see below), and
a **new element type** rather than folding uploads into `icon` (icon
stays a small curated built-in set; `svg` is the escape hatch for
arbitrary author-supplied art).

- **Data shape**: like `draw`'s `points`, `svgMarkup` (the sanitized
  markup) and `originalViewBox` are type-specific data set directly on
  the object rather than declared in `ELEMENT_TYPES.svg.fields` — no sane
  form-input type for raw SVG source. Also like `draw`, an `svg` element
  is never placed via `makeDefaultElement()`/`addElement()` alone — it
  has no meaningful default shape until an author picks a file — so its
  left-rail button opens a hidden `<input type="file">` instead
  (`#svg-upload-input` in `index.html`) rather than instant-placing.
  `handleSvgUpload()` reads the file, runs it through the sanitizer, and
  calls `addSvgElement()` (the `svg`-specific sibling of `addElement()`)
  on success — a rejected file (invalid SVG, or over
  `SVG_UPLOAD_MAX_BYTES`, currently 500KB) shows a `Shell.toast` and
  never creates an element.
- **Why sanitize at all — read this before touching `svg-sanitizer.js`**:
  `element-renderer.js`'s output is reused UNMODIFIED by the exported
  learner-facing player (see that file's own header comment). An
  unsanitized malicious SVG uploaded here would run its payload inside a
  real Articulate course, not just inside this authoring tool — a
  realistic threat, since "grab an icon off some site" is a normal author
  workflow. `svg-sanitizer.js`'s `sanitizeSvgMarkup()` runs once, at
  upload time, in the authoring UI only (not part of the shared renderer,
  and not needed inside the exported player — by export time the stored
  `svgMarkup` is already sanitized data, so this file is never one of
  Export's fetched/embedded modules).
- **Allowlist, not blocklist**: parses the uploaded text via `DOMParser`,
  then rebuilds a clean tree element-by-element, keeping only tags in
  `SVG_ALLOWED_TAGS` (shape/gradient/structural elements — no `<script>`,
  no `<image>`, no `<a>`) and attributes in `SVG_ALLOWED_ATTRS` (geometry
  and paint only — every `on*` handler, `style` — a `url(...)` inside a
  style attribute is its own CSS-based injection vector, distinct from
  the tag/handler-based ones the tag allowlist blocks — and
  `href`/`xlink:href` are excluded). A disallowed tag drops itself AND
  everything nested under it, so a `<script>` hidden inside an otherwise-
  fine `<g>` doesn't survive just because its parent was allowed.
  **Real bug caught during testing**: tag/attribute names were originally
  compared after `.toLowerCase()`-ing both sides, which silently dropped
  every camelCase SVG name (`linearGradient`, `viewBox`, `gradientUnits`)
  since SVG tag/attribute names are case-sensitive — a gradient-filled
  upload rendered as if the `<defs>` block were empty, no error, nothing
  in the console. Fixed by comparing tag/attribute names as-authored,
  with no case normalization on either side of the allowlist check — this
  is still safe against a case-trick bypass (e.g. `<ScRiPt>`) precisely
  *because* it's an allowlist: a name that doesn't exactly match one of
  the deliberately-included spellings is dropped regardless of what case
  it's in.
- **Id rewriting**: every `id` attribute is rewritten with a prefix unique
  to that upload (the new element's own id), and every `url(#id)`
  reference (`fill`, `stroke`, `clip-path`) is rewritten alongside it —
  needed so an uploaded SVG's internal ids (e.g. a gradient's `id="grad1"`)
  can never collide with another `svg` element already on the same
  canvas, or with the app's own DOM ids.
- **Recolour application** (`applySvgAccentColor()` in
  `element-renderer.js`): re-run on every render from the *original*
  sanitized markup — not baked into stored `svgMarkup` — same as icon's
  own `color` field re-applying `fill` on every render. An element with
  an explicit `fill="none"` (an outline-only shape) is left alone so
  stroke-only icons still read as outlines rather than gaining a fill; an
  element with no `fill` attribute at all still defaults to black per the
  SVG spec, so it's treated the same as an explicit non-`"none"` fill
  (recoloured). `<stop stop-color>` (gradient stops) are recoloured too,
  for consistency, even though a gradient's whole point is normally
  multi-colour — a deliberate consequence of the single-accent-colour
  scope call, not a special case.
- Resize handles, the property panel's Colour/Opacity fields, layer panel
  entry, undo/redo, and duplicate are all free from the existing schema-
  driven system — the same payoff Free draw got from extending
  `ELEMENT_TYPES` instead of hand-writing a new UI path.

### Ruler guides

Persistent (project-wide, not per-slide) vertical/horizontal lines an
author places to line elements up against, with elements magnetically
snapping to them while being dragged. Lives entirely in
`canvas-editor.js` (an authoring-only file — see "The Apps Script
deployment pipeline" below on why that alone keeps guides out of the
exported player) plus a small Settings-panel section in `index.html`;
`element-renderer.js` and the exported player know nothing about guides
at all.

- **Data shape**: `canvasSettings.guides = { enabled, horizontal: [{id,
  y}], vertical: [{id, x}] }` — project-wide like `nav`/`snapToGrid`, for
  the same reason nav styling is: a layout aid should stay put as an
  author moves between slides, not reset per slide. `defaultGuides()`
  lives in `slide-manager.js` next to `defaultCanvasSettings()`;
  `SlideManager.setState()` backfills it for a project saved before this
  feature existed, the same pattern already used for `nav`.
- **One enabled flag gates both visibility AND snapping** — Settings'
  "Show & snap to guides" switch and the global Shift+R shortcut both
  just flip `canvasSettings.guides.enabled` via
  `CanvasEditor.toggleGuidesEnabled()`. A hidden guide that still
  silently snapped things would be confusing, so there's deliberately no
  second "snap without showing" mode. Shift+R lives inside
  `CanvasEditor`'s existing keydown listener specifically to reuse its
  `isTyping` guard — without it, typing a capital "R" into any text
  field (a slide name, a text element's content) would hijack the
  keystroke instead of typing the letter.
- **Creation**: Settings' Guides section has "+ Horizontal"/"+ Vertical"
  buttons (`CanvasEditor.addGuide()`) that add a guide at the canvas's
  own centre, selected and immediately draggable — no ruler UI, unlike
  Figma/Illustrator's drag-off-the-ruler gesture, a deliberate scope call
  made before writing any code (the canvas here is small enough that a
  full ruler felt like more UI than the feature needed). The same
  section also lists every existing guide with a numeric position field
  (an alternative to dragging) and a remove button.
- **Selection is independent of element selection** — `selectedGuide`
  (`{ orientation, id }`) is a separate field from `selectedIds`;
  clicking a guide deselects any element and vice versa, so the two
  concepts never overlap. Deleting a selected guide (Delete/Backspace)
  and duplicating/deleting a selected ELEMENT are therefore two
  completely independent code paths that happen to share a keybinding.
- **Removal**: drag a guide off the canvas's own on-screen bounds (a
  `getBoundingClientRect()` check in screen space, so it means the same
  thing regardless of zoom), or select it and press Delete/Backspace.
  `_finishGuideDrag()`'s delete-on-drop path reuses the
  `history.beginAction()` that `_startGuideDrag()` already opened rather
  than opening a second one — the whole drag-then-delete gesture
  collapses into ONE undo step that puts the guide back at its PRE-drag
  position, not two separate steps (drag position, then existence).
- **A thin `<line>` is nearly unclickable** — every rendered guide is
  actually two stacked `<line>`s: a 1-2px visible one
  (`pointer-events: none`) and an invisible ~10px-wide one on top
  (`stroke-opacity: 0` + `pointer-events: stroke`, not `stroke: none`,
  since `none` would make it non-interactive too) that actually receives
  clicks/drags. `renderGuides()` always destroys and recreates the whole
  `<g id="guides-layer">` (same "destroy and recreate" idiom
  `_renderHandles()` already uses) and always re-appends it as the LAST
  child of the root `<svg>`, so guides paint on top of elements-layer
  (and selection handles) no matter what slide-switching or layer
  reordering did to sibling order elsewhere.
- **Snapping is scoped to MOVE-drags only, not resize** — a deliberate
  scope call, not an oversight: an element's left/right/top/bottom edges
  and horizontal/vertical center all magnetically snap to a guide within
  ~8 ON-SCREEN pixels (converted to SVG user-space units via
  `svg.getScreenCTM().a`, the same "never guess a scale factor manually"
  reasoning `screenToSVGPoint()` already follows, since the canvas can
  render at any zoom/size) while being repositioned, but resize handles
  still only grid-snap, same as before this feature. `_snapToGuides()`
  works against the element's LOCAL bbox (`_getLocalBBox()`, which
  already has an arrow-specific branch) rather than assuming `(x, y,
  width, height)` directly describes the box — needed for arrows, whose
  visual box can extend up/left of their own `x,y` origin. A currently-
  engaged guide highlights (thicker + a different colour) while
  something is snapped to it, cleared on pointerup; the highlight-set
  comparison is skipped-if-unchanged so `renderGuides()` isn't rebuilt
  every single pointermove frame, only when which guide(s) are engaged
  actually changes.
- **A real layout bug found while building this, worth knowing before
  touching `.side-panel` again**: an earlier fix gave `#editor-slide-bar`
  a higher z-index than `.side-panel` so the bar (and its **+ Slide**
  button) would paint on top of any open panel instead of being covered
  by it. That z-index rule alone turned out NOT to be enough once a
  panel's content can be tall enough to scroll — the bar would still permanently cover whatever portion of the
  panel's full-viewport-height box happened to sit behind it, and no
  amount of scrolling the panel's own `.side-panel-body` could bring
  that region out from behind the bar, since the bar isn't part of the
  panel's scroll container at all. Adding the Guides section made
  Settings tall enough on a modest viewport to actually hit this. Fixed
  by giving `.side-panel` a real `bottom: var(--slide-bar-height, 0px)`
  instead of `bottom: 0` — `syncSlideBarHeight()` in `index.html`
  measures `#editor-slide-bar`'s actual rendered height (not a guessed
  pixel constant) and publishes it as that custom property, called on
  load, on window resize, and from `refreshUI()`. The z-index rule stays
  too, as a harmless fallback for the brief instant before that JS runs
  on first paint.

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

**Never hand someone a whole-file replacement for an `AppScript/*.html`
file without first establishing that their live copy hasn't diverged
from this repo.** This has already destroyed real work once: a previous
session built the Handwriting-font feature by editing the live Apps
Script files directly and never pushed the equivalent change to
`tools/animated-slides-v2/`, so a later session that regenerated those
files from repo source and said "replace the existing file's contents"
silently deleted the whole feature from the deployment. The repo looked
clean and the change looked additive — nothing in the diff hinted that
the live file contained code the repo had never seen. Ask "have you made
any edits directly in the Apps Script editor that aren't in GitHub?"
before recommending a wholesale paste, and prefer targeted patches
against shared anchor text when there's any doubt (a patch-against-
anchor-text sync was used successfully in the now-removed Toggle Slides
tool, for exactly this reason — see git history). The general rule this
project keeps relearning: **the deployed Apps Script project, not this
repo, is the source of truth for what's actually running.**

**A real, shipped bug from getting substitution 2 wrong**: the Draw
feature (and, separately, the Handwriting font feature) were added to
the deployed `ElementTypesJs.html`/`ElementRendererJs.html` without
regenerating `MODULE_SOURCES` inside `AnimatedSlidesV2.html`'s
`openExportModal()`. Since `MODULE_SOURCES` is a frozen string snapshot,
not a live reference to those files, it kept an old copy of
`element-renderer.js` with no `'draw'` case in `createElementNode()`.
Any exported project containing a hand-drawn element then hit
`throw new Error('Unknown element type: draw')` — thrown synchronously
inside `SlideManager`'s constructor, which runs *before* `setupNavBar()`
is ever called — so the entire exported `<script>` block died right
there and the nav bar simply never got built. No console access inside
an Articulate embed made this read as "the nav bar is hidden" rather
than "the export threw an error," which is what made it hard to place at
first. The fix is mechanical but easy to skip under time pressure:
whenever `element-types.js` or `element-renderer.js` changes, regenerate
`MODULE_SOURCES.elementTypes`/`.elementRenderer` from the real files
(a small Node script does this — see git history for the exact one:
`JSON.stringify` each file's contents and splice the result back into
the `MODULE_SOURCES` object literal in `AnimatedSlidesV2.html`) and
verify byte-for-byte against the source before considering the sync
done, the same "generated programmatically, verified via direct
comparison" approach Tabbed Panels already uses for its own
`MODULE_SOURCES`. **This is exactly the failure mode
substitution 2 above warns about** — it just took a real incident to
show how silent and structurally-separated-from-the-real-bug the
symptom can be.

**A second, separate "nav bar missing" cause — embed container sizing**:
after the `MODULE_SOURCES` incident above was fixed, an author still saw
no nav bar once embedded in Articulate. The exported page's `<style>`
used to size `#canvas-wrapper` with `flex: 1` inside a `height: 100%`
`#player-root` — meaning the canvas always claimed however much height
the host container gave it, leaving nothing for the nav bar if that
container was short. Fixed by dropping `height: 100%` on `html, body`
entirely and giving `#canvas-wrapper` a fixed `aspect-ratio:
${slideManager.canvasSettings.width} / ${slideManager.canvasSettings.height}`
(interpolated into the template string at export time, same as
`slidesJSON`/`canvasSettingsJSON`) instead — the canvas now sizes itself
from its own *width* (which containers reliably provide) rather than a
possibly-zero ancestor height, so the page reports its true natural
content height (canvas + nav bar) instead of forcing itself into
whatever height it was handed. **This only fully solves the problem if
the host container can grow to fit that natural height** — Articulate's
embed block has an "Auto Resize" option for exactly this case, and
should be enabled. If a host container instead hard-clips at a fixed
pixel height with `overflow: hidden` (author cannot enable auto-resize
for whatever reason), no CSS inside the exported page can make content
taller than that ceiling visible — the aspect-ratio fix narrows the
canvas's own height to what its width actually needs, which helps a lot
but isn't a hard guarantee in that specific case. Verified via a
Playwright test that embedded the export inside a deliberately
fixed-height, `overflow: hidden` iframe to confirm the fix's actual
behavior (not just its intent) before shipping it — it reduced how
often clipping happens but doesn't eliminate it outright; a genuine
guarantee would need scaling the whole player down to fit available
space via JS, not attempted here since it wasn't needed once Auto Resize
was confirmed available.

**A third "nav bar missing" cause — a truncated long line in `<head>`,
and the most instructive of the three**: an author reported no nav bar
AND the wrong font, in the embed *and* in a plain standalone save of the
exported file. Both symptoms turned out to be one defect. The export's
Google-Fonts `<link>` was a single ~150-character line, and it reached
the live deployment truncated at `<link href="https:` — an
**unterminated HTML attribute**. The parser then consumes everything up
to the *next* `"` in the document as that attribute's value, which meant
it swallowed `<style>`, `</head>`, `<body>` and the opening of
`<div id="player-root">`. Verified by reading the parsed attribute back
out of a real browser — `link.href` literally contained the entire
stylesheet plus `<body>\n<div id=`. Consequences, all matching the
report exactly: `#canvas-wrapper` / `#elements-layer` / `#player-nav-bar`
still get created (so **slide content renders normally**, which is what
makes this read as "only the nav bar is broken"), but `#player-root`
never exists, so `playerRootEl.appendChild(navBarEl)` throws
`Cannot read properties of null (reading 'appendChild')` *before*
`setupNavBar()` is reached — and the truncated link also means the
webfont never loads, hence the wrong font. **Debugging lesson worth
keeping**: the author's own report ("font is wrong" + "nav bar missing")
looked like two unrelated bugs and got investigated as two; they were
one. When a page's `<head>` is malformed, expect symptoms scattered
across unrelated features. Also note the earlier diagnosis blamed embed
container height and was wrong — the "standalone save also fails" answer
is what falsified it, so ask for that comparison early.
Fixed structurally rather than by re-pasting the line:
1. The export no longer emits a static font `<link>` at all — the
   exported page builds it at runtime from short concatenated strings
   inside `<script>` (`document.createElement('link')`), so there is no
   long line left to truncate. Same approach Tabbed Panels' export
   already uses for its `<style>`/`<link>`, for a different reason.
2. `const playerRootEl = document.getElementById('player-root') ||
   canvasWrapperEl.parentNode;` — a malformed `<head>` can never again
   cost the learner all navigation.
3. The authoring page's own `<head>` had the identical ~190-char
   single-line risk; it's now three short `<link>`s (same fonts).
Verified by loading the author's actual broken file (reproduced the exact
error, `player-root` null), repairing only that one line (nav bar
returned), then confirming a freshly generated export works AND still
renders its nav bar with `<div id="player-root">` deliberately deleted.

## Local preview (no Apps Script needed for most of it)

`tools/animated-slides-v2/index.html` loads its own engine as plain
`<script src>` files — four from `../../shared/` (`element-types.js`,
`element-renderer.js`, `canvas-editor.js`, `history.js` — see "Scaling
decisions" #3), and three from its own folder (`slide-manager.js`,
`layer-panel.js`, `nav-bar.js`) — all of which exist as real standalone
files (they didn't for a while; CLAUDE.md described them but they'd only
ever been uploaded as `AppScript/*Js.html`, so the page 404'd on all
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
  a redesigned left rail (vertical icon-only stack: originally 4
  add-element icons, now 5 with Draw — see "Free draw" above — a
  divider, then Link/Layers/Settings, each opening a non-blocking
  slide-out drawer instead of a modal that covers the canvas); and a
  settings drawer rebuilt as a 2-column grid with a proper Active/
  Inactive colour table, matching a supplied design mockup; and
  folder support in Save/Open (see "Storage" above) — the Open modal
  now browses into folders via breadcrumbs, can create/delete folders,
  and a new project's first save lands in whichever folder was last
  browsed; and a freehand "Draw" tool (see "Free draw" above) — sketch
  directly on the canvas with the stroke automatically simplified
  (Ramer-Douglas-Peucker) and curve-fit (Catmull-Rom-to-Bezier) so it
  reads as a smooth line rather than a jittery mouse trace, resizable
  like any other element (deployed live and confirmed working in
  authoring); a second "Handwriting" font choice for text elements (see
  "Handwriting font" above), also deployed live and confirmed working in
  authoring; and an SVG upload element type (see "Uploaded SVGs" above)
  — an author can bring their own SVG asset (a logo, a custom icon)
  rather than being limited to the built-in icon library, sanitized on
  upload against a strict allowlist and recoloured via a single
  accent-colour override, verified in local preview (a Playwright
  session confirmed a `<script>` tag and an `onclick` handler both get
  stripped from an uploaded file, a gradient's internal ids get rewritten
  correctly, and the property panel / undo-redo / duplicate all work
  against the new type) but **not yet hand-verified against a live Apps
  Script deployment**.
  **Incident, now fixed**: the Draw and Handwriting-font features were
  deployed to `ElementTypesJs.html`/`ElementRendererJs.html` without
  regenerating Export's `MODULE_SOURCES` snapshot inside
  `AnimatedSlidesV2.html` (see "A real, shipped bug from getting
  substitution 2 wrong" above) — any exported project containing a
  hand-drawn element crashed the exported script before its nav bar
  ever got built, which read as "the nav bar is hidden" with no visible
  error inside an Articulate embed. Fixed by regenerating
  `MODULE_SOURCES` from the real, current `element-types.js` /
  `element-renderer.js` (which now include Draw, Handwriting-font, AND
  the new SVG-upload type together) and verifying byte-for-byte against
  the source. Confirmed via a Playwright test that reconstructed the
  exact exported-HTML shape (using the regenerated `MODULE_SOURCES`
  content, not the local dev server's live `fetch()` path, since that's
  what actually ships from Apps Script) with a slide containing a draw
  element, an svg element, and a Handwriting-font text element all at
  once — nav bar rendered correctly, no thrown errors. Still outstanding:
  a real end-to-end Save/Load + Export round-trip against the live Apps
  Script deployment itself (this Playwright check exercises the exact
  file contents that would be pasted in, but not Apps Script's own
  `google.script.run`/templating layer).
  **Second incident, same symptom, completely different cause, now
  fixed** — after the `MODULE_SOURCES` fix above the author STILL had no
  nav bar, plus the wrong font: the export's Google-Fonts `<link>` had
  reached the live deployment truncated mid-URL, and the resulting
  unterminated HTML attribute swallowed `<div id="player-root">` so the
  export threw before building its nav bar. Full write-up under "A third
  'nav bar missing' cause" above — worth reading before diagnosing any
  future export problem, because two *earlier* diagnoses in that same
  investigation (stale `MODULE_SOURCES`, then embed container height)
  were each plausible, partially-correct-looking, and wrong. **This fix
  has NOT been confirmed by the author yet** — it needs
  `AppScript/AnimatedSlidesV2.html` re-pasted + redeployed, then a fresh
  Export checked in Articulate.
  Element properties also moved out of the old floating popup into a
  right-docked side panel (see "The Apps Script deployment pipeline"
  section's sibling doc, `SIDEBAR.md`, for the full cross-tool writeup) —
  opens instantly on canvas selection, shows every field at once (no more
  "More options" toggle), and multi-select can now edit fields common to
  every selected type at once instead of only offering Duplicate/Delete.
  Deployed live. And ruler guides (see "Ruler guides" above) — persistent
  vertical/horizontal snap lines, toggled via Settings or Shift+R, an
  element's edges/center magnetically snap to one while being dragged
  (move only, not resize) — verified in local preview (Playwright:
  add/drag/delete a guide, exact-position snap confirmed, persistence
  across slides and undo/redo confirmed) but **not yet hand-verified
  against a live Apps Script deployment**.
  Remaining known gaps: custom color pickers (native color inputs still
  used, just restyled as a small square swatch rather than the full
  redesign a true custom picker would be), a thin icon library (7
  icons), touch/tablet support (layer/slide drag-to-reorder uses native
  HTML5 drag-and-drop, which doesn't work on touchscreens — canvas
  drag/selection is fine, since that's built on pointer events), no
  accessibility pass, narrow-window layout untested.
- **Not yet migrated / not yet built**: nothing is currently being
  migrated from a legacy tool — see "Starting a new tool" below instead.

## Starting a new tool

(This section was referenced from "Current status" above for a while
without actually existing — a dangling pointer, fixed alongside writing
it for real as part of "Scaling decisions" #5 below.)

- **Don't start from scratch.** Every tool includes `shared/`'s
  foundation — `design-tokens.css`, `app-shell.css` / `app-shell.js`
  (top bar, modals, toasts, project list, `Shell.confirm`/
  `Shell.prompt`), `storage-connector.js` — plus `Code.gs`'s
  `apiSaveProject`/`apiListProjects`/etc. pattern for persistence. If the
  new tool is canvas-based (an SVG canvas of positioned/sized elements,
  the way v2 is and Tabbed Panels deliberately isn't), also start from
  `shared/canvas-editor.js` / `element-types.js` / `element-renderer.js`
  / `history.js` — the promoted engine described under "Animated Slides
  v2's internal architecture" above — rather than copy-pasting v2's
  tool-specific files the way the now-removed Toggle Slides did (see the
  Architecture section's Toggle Slides bullet for how that diverged and
  why it was a real, live-shipped bug by the time it was investigated).
- **Register it**: add an entry to `Code.gs`'s `PAGES` map (this alone
  makes it reachable from the hub — no separate manifest to update) and
  set up the matching deployed `AppScript/*.html` files per
  `DEPLOY_CHECKLIST.md`.
- **Cross-tool pattern docs**: if the new tool implements a UI pattern a
  second tool already has (side panels, folder browsing, toast/modal
  conventions, etc.), and the two implementations aren't identical, write
  a standalone reference doc for that pattern — `SIDEBAR.md` is the
  model to follow — rather than opportunistically documenting it only
  after a bug forces the comparison (which is how `SIDEBAR.md` itself
  came about), and rather than folding it into this file. This was
  "Scaling decisions" #5 below; it's now the standing rule, not a
  one-off.
- Local preview (`python3 -m http.server 8000` from repo root) works for
  everything except Save/Load, which needs `google.script.run` and
  therefore a real Apps Script deployment — see "Local preview" above.

## Tabbed Panels

An author builds a series of tabs; learners navigate between them. Each
tab's content is an ordered list of blocks — heading (with optional
subtitle), paragraph, list, button (external hyperlink), badge, table,
separator. Genuinely different content model from Animated Slides —
that tool's SVG canvas + `x`/`y`/`width`/`height` element schema doesn't
fit flowed content, so it does **not** reuse `shared/element-types.js` /
`shared/element-renderer.js` / `shared/canvas-editor.js` — the canvas
engine — even though those now live in `shared/` too (promoted there
for future canvas-based tools, not because Tabbed Panels needed them).
What it does share: `shared/design-tokens.css`, `shared/app-shell.css` +
`app-shell.js` (top bar, modals, toasts, `Shell.confirm`/`Shell.prompt`,
project list rendering), `shared/storage-connector.js`,
`shared/history.js` (fully generic, no canvas dependency), and the same
`Code.gs` `PAGES` + `apiSaveProject`/`apiListProjects`/etc. pattern — same
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
- `history.js` — loaded from `shared/` (see "Scaling decisions" #3), not
  a per-tool copy. Originally a verbatim copy of
  `animated-slides-v2/history.js`; since it's fully generic (works off
  any `getState`/`setState` pair, no tool-specific logic ever needed),
  the duplicate copy was retired in favor of both tools loading the same
  file once it was promoted to `shared/`.
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

## Scaling decisions — agreed, not yet implemented

A planning-only review session (no code touched) looked at how this
project's structure holds up as more tools get added — expectation set
at the time was **5-8 tools total, added over months**, not a much
larger platform. The person made seven decisions during that session.
None of the code/doc changes below have been made yet — this section is
the record of what was decided, so a future session can execute against
it without re-litigating the choices. Update/remove each bullet as its
item gets done.

1. **Deploy checklist**: done — see `DEPLOY_CHECKLIST.md`, a standalone
   file with literal checkboxes per file/substitution, built from the
   5-substitution pipeline explained in "The Apps Script deployment
   pipeline" above (which remains the source of truth for *why* each
   step exists; the checklist file is the executable version for
   actually doing a sync). Use it every time `AppScript/*.html` is
   hand-synced from `tools/` source.
2. **`clasp`/build automation**: settled — stays deferred, but now on an
   explicit trigger rather than an open-ended "someday": **revisit
   automating the Apps Script deploy (`clasp` or equivalent) the next
   time a hand-sync bug actually ships to production**, not at a fixed
   tool-count checkpoint. Three such incidents are already on record
   (see the deployment-pipeline section above); a fourth is the agreed
   trigger to stop deferring this — not "we've had incidents before," a
   genuinely new one. `HANDOFF.md`'s "Older, still-outstanding items"
   section carries the same trigger language so a future session doesn't
   see two docs disagreeing about whether this is due now. There is
   nothing left to implement for this item until that trigger fires —
   it's a decision record, not a pending task.
3. **Shared canvas engine**: done — `canvas-editor.js`, `element-types.js`,
   `element-renderer.js`, and `history.js` moved from
   `tools/animated-slides-v2/` into `shared/`. v2's `index.html` and
   Export code (`fetchModuleSources()`) now load them from `../../shared/`;
   Tabbed Panels' own duplicate `history.js` was retired and it now loads
   the shared copy too (it was already byte-identical, just comment
   headers differed). Verified: both tools load cleanly in a real browser
   (Playwright, local preview) with no console/page errors and the
   expected globals (`CanvasEditor`, `ELEMENT_TYPES`, `History`,
   `TabManager`) present; `AppScript/{ElementTypesJs,ElementRendererJs,
   CanvasEditorJs,HistoryJs}.html`'s header comments were updated to
   match (comment-only, no functional change) and `AnimatedSlidesV2.html`'s
   `MODULE_SOURCES.elementTypes`/`.elementRenderer` were regenerated and
   confirmed byte-for-byte against the new `shared/` files. This becomes
   the fork point for every future canvas-based tool (Apps Script's flat
   file namespace already supports one shared `include('ElementRendererJs')`
   etc. across multiple `PAGES` entries — no plugin/import system needed).
4. **Reconcile existing forks**: moot for now — Toggle Slides, the only
   tool with a diverged fork of these four files, was removed entirely
   (see the "Toggle Slides" bullet under Architecture above; it didn't
   meet requirements). The investigation for this item did surface a
   real, separate, already-live bug worth remembering if a future
   canvas-based tool forks these files again: a *shared* Apps Script
   include (e.g. `AppScript/CanvasEditorJs.html`) can silently drift out
   of sync with what a *specific* tool page still expects (constructor
   options, DOM hooks) even while the include itself stays byte-valid —
   diff what a forking tool's own deployed page expects against the
   shared include's actual current API before assuming a shared file is
   still compatible, don't just diff repo source against repo source.
5. **Cross-tool pattern docs**: done — standardized as a written rule in
   the new "Starting a new tool" section above: once a second tool
   implements a shared UI pattern (folders/project-list, toasts/modals,
   side panels, etc.) and the two implementations aren't identical, that
   pattern gets its own standalone reference doc (like `SIDEBAR.md`),
   rather than only writing one opportunistically after a bug forces the
   cross-tool comparison, and rather than folding everything into this
   file. This item was always "applies going forward, no retroactive doc
   needed" — no existing pattern besides `SIDEBAR.md`'s (side panels)
   needed a doc written just because of this decision, so there's no
   further backlog here, only the standing rule for next time.
6. **Verification/production backlog**: clear the existing "unverified
   against a live Apps Script deployment" backlog (Tabbed Panels'
   Save/Load/Export round-trip, SVG upload, folder-support round-trip —
   all tracked in `HANDOFF.md` and cross-referenced throughout this
   file; Toggle Slides' items dropped off this list with its removal)
   **before** starting any
   new tool, rather than letting it keep growing alongside new work.
7. **`AppScript/x`**: deleted — was a stray tracked, apparently
   content-free file from an unrelated stray commit, not part of any
   tool's real file set. Done.
