# Tabbed Panels

Deep-dive reference for this tool specifically. Read the repo root's
`CLAUDE.md` first — it covers the suite's shared architecture (hosting,
storage, `shared/` foundation, Conventions, the Apps Script deployment
pipeline, and cross-tool "Scaling decisions") and is what this file
assumes as background. This file only covers what's genuinely
Tabbed-Panels-specific. Update it as the tool evolves — a stale doc here
actively misleads, since it's read as ground truth rather than
double-checked against the code.

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

## Internal architecture

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
- `history.js` — loaded from `shared/` (see root CLAUDE.md's "Scaling
  decisions" #3), not a per-tool copy. Originally a verbatim copy of
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
  2's usual split (see root CLAUDE.md's deployment-pipeline section).
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

## Project-wide styles (`defaultStyles()` in `tab-manager.js`)

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

## Content model, settled across two scaffolding/design-review rounds

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

## What's NOT built yet

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
  done (see the repo root's `HANDOFF.md`).
- **Touch/tablet drag-and-drop** — the Tabs drawer's reorder and the
  block list's reorder both use native HTML5 drag-and-drop (copied from
  v2's layer/slide reordering), which has the same known touchscreen gap
  v2 does.
- No accessibility pass, no narrow-window layout testing — same
  standing gaps as v2, not yet even looked at here.
- Table cells are plain text only (a deliberate scope decision, not an
  oversight — see "Content model" above); revisit only if an author
  specifically asks for rich text inside table cells.
