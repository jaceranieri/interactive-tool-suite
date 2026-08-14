# Animated Slides v2

Deep-dive reference for this tool specifically. Read the repo root's
`CLAUDE.md` first — it covers the suite's shared architecture
(hosting, storage, `shared/` foundation, Conventions, the Apps Script
deployment pipeline, and cross-tool "Scaling decisions") and is what
this file assumes as background. This file only covers what's genuinely
v2-specific. Update it as the tool evolves — a stale doc here actively
misleads, since it's read as ground truth rather than double-checked
against the code.

## Deployed Apps Script files

`AppScript/` is Apps Script's flat namespace — it has no real
subdirectories at all, so it can't mirror `tools/animated-slides-v2/`
the way this doc's own location does. `Code.gs`'s `PAGES['animated-slides-v2']`
points at `AnimatedSlidesV2.html`, which `include()`s the rest:

- **v2-specific** (map 1:1 to files in `tools/animated-slides-v2/`):
  `AnimatedSlidesV2.html` (← `index.html`), `SlideManagerJs.html`,
  `LayerPanelJs.html`, `NavBarJs.html`, `SvgSanitizerJs.html`.
- **Shared includes** (correspond to `shared/`, not to this tool —
  `ElementTypesJs`/`ElementRendererJs`/`CanvasEditorJs`/`HistoryJs` are
  also `include()`d by any other tool that uses the promoted canvas
  engine; `AppShellCss`/`AppShellJs`/`DesignTokens`/`StorageConnectorJs`
  are pulled in by every tool in the suite): `DesignTokens.html`,
  `AppShellCss.html`, `AppShellJs.html`, `StorageConnectorJs.html`,
  `ElementTypesJs.html`, `ElementRendererJs.html`, `CanvasEditorJs.html`,
  `HistoryJs.html`.

See root CLAUDE.md's "The Apps Script deployment pipeline" section for
the 5-substitution mechanism that generates these from repo source, and
`DEPLOY_CHECKLIST.md` for the step-by-step sync process.

## Internal architecture

`element-types.js`, `element-renderer.js`, `canvas-editor.js`, and
`history.js` live in `shared/`, not `tools/animated-slides-v2/` — see
root CLAUDE.md's "Scaling decisions" #3. They're described here because
this is still where their design rationale belongs (v2 is where they
were built and is still their most complete consumer); `slide-manager.js`,
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
  furthest back) — see root CLAUDE.md's Conventions section, "Layer
  stacking order convention" bullet.
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
`canvas-editor.js` (an authoring-only file — see root CLAUDE.md's "The
Apps Script deployment pipeline" section on why that alone keeps guides
out of the exported player) plus a small Settings-panel section in
`index.html`; `element-renderer.js` and the exported player know
nothing about guides at all.

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

## Local preview

`tools/animated-slides-v2/index.html` loads its own engine as plain
`<script src>` files — four from `../../shared/` (`element-types.js`,
`element-renderer.js`, `canvas-editor.js`, `history.js` — see root
CLAUDE.md's "Scaling decisions" #3), and three from its own folder
(`slide-manager.js`, `layer-panel.js`, `nav-bar.js`) — all of which
exist as real standalone files (they didn't for a while; CLAUDE.md
described them but they'd only ever been uploaded as `AppScript/*Js.html`,
so the page 404'd on all seven outside Apps Script — fixed by
extracting them verbatim from the AppScript wrapper files). This means:

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

## Current status

*(Keep this section current — it's the part most likely to go stale.)*

Feature-complete on the original build plan, plus a further round of
polish and fixes done since: "Load from code" (paste a previous Export's
HTML back in to rebuild an editable project — see
`tools/animated-slides-v2/ai-authoring/prompt.md` for a self-contained
prompt that walks a non-technical author through generating
export-compatible project data with an LLM, without touching this tool
directly first); a fixed layer-order bug (reordering could silently
revert after navigating slides); a fixed inverted bring-forward/
send-backward chevron bug; shift-to-axis-lock dragging; a redesigned left
rail (vertical icon-only stack: originally 4 add-element icons, now 5
with Draw — see "Free draw" above — a divider, then Link/Layers/Settings,
each opening a non-blocking slide-out drawer instead of a modal that
covers the canvas); and a settings drawer rebuilt as a 2-column grid with
a proper Active/Inactive colour table, matching a supplied design
mockup; and folder support in Save/Open (see root CLAUDE.md's
Architecture section, "Storage" bullet) — the Open modal now browses
into folders via breadcrumbs, can create/delete folders, and a new
project's first save lands in whichever folder was last browsed; and a
freehand "Draw" tool (see "Free draw" above) — sketch directly on the
canvas with the stroke automatically simplified (Ramer-Douglas-Peucker)
and curve-fit (Catmull-Rom-to-Bezier) so it reads as a smooth line rather
than a jittery mouse trace, resizable like any other element (deployed
live and confirmed working in authoring); a second "Handwriting" font
choice for text elements (see "Handwriting font" above), also deployed
live and confirmed working in authoring; and an SVG upload element type
(see "Uploaded SVGs" above) — an author can bring their own SVG asset (a
logo, a custom icon) rather than being limited to the built-in icon
library, sanitized on upload against a strict allowlist and recoloured
via a single accent-colour override, verified in local preview (a
Playwright session confirmed a `<script>` tag and an `onclick` handler
both get stripped from an uploaded file, a gradient's internal ids get
rewritten correctly, and the property panel / undo-redo / duplicate all
work against the new type) but **not yet hand-verified against a live
Apps Script deployment**.

**Incident, now fixed**: the Draw and Handwriting-font features were
deployed to `ElementTypesJs.html`/`ElementRendererJs.html` without
regenerating Export's `MODULE_SOURCES` snapshot inside
`AnimatedSlidesV2.html` (see root CLAUDE.md's deployment-pipeline
section, "A real, shipped bug from getting substitution 2 wrong") — any
exported project containing a hand-drawn element crashed the exported
script before its nav bar ever got built, which read as "the nav bar is
hidden" with no visible error inside an Articulate embed. Fixed by
regenerating `MODULE_SOURCES` from the real, current `element-types.js`
/ `element-renderer.js` (which now include Draw, Handwriting-font, AND
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
export threw before building its nav bar. Full write-up under root
CLAUDE.md's deployment-pipeline section, "A third 'nav bar missing'
cause" — worth reading before diagnosing any future export problem,
because two *earlier* diagnoses in that same investigation (stale
`MODULE_SOURCES`, then embed container height) were each plausible,
partially-correct-looking, and wrong. **This fix has NOT been confirmed
by the author yet** — it needs `AppScript/AnimatedSlidesV2.html`
re-pasted + redeployed, then a fresh Export checked in Articulate.

Element properties also moved out of the old floating popup into a
right-docked side panel (see the repo root's `SIDEBAR.md` for the full
cross-tool writeup) — opens instantly on canvas selection, shows every
field at once (no more "More options" toggle), and multi-select can now
edit fields common to every selected type at once instead of only
offering Duplicate/Delete. Deployed live. And ruler guides (see "Ruler
guides" above) — persistent vertical/horizontal snap lines, toggled via
Settings or Shift+R, an element's edges/center magnetically snap to one
while being dragged (move only, not resize) — verified in local preview
(Playwright: add/drag/delete a guide, exact-position snap confirmed,
persistence across slides and undo/redo confirmed) but **not yet
hand-verified against a live Apps Script deployment**.

Remaining known gaps: custom color pickers (native color inputs still
used, just restyled as a small square swatch rather than the full
redesign a true custom picker would be), a thin icon library (7 icons),
touch/tablet support (layer/slide drag-to-reorder uses native HTML5
drag-and-drop, which doesn't work on touchscreens — canvas
drag/selection is fine, since that's built on pointer events), no
accessibility pass, narrow-window layout untested.
