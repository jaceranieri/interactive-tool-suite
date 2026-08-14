# Side panel implementation

Reference for the `.side-panel` UI pattern (slide-out drawers docked to the
right edge — Layers, Settings, Properties/Styles, Button overrides,
depending on the tool) used across this suite's canvas-style authoring
tools. Read this before touching panel-switching logic, adding a new
panel, or wiring panel behavior into a new tool. Update it when the
pattern changes — a stale doc here is worse than no doc, since it reads
as ground truth.

**Current state as of this writing: the two tools are NOT fully
consistent.** Animated Slides v2 has the newest, most complete version
of this pattern (property editing moved into a side panel, origin-aware
panel routing). Tabbed Panels has an independently-evolved but
philosophically similar version, predating v2's most recent refinements.
Don't assume a rule below is true of both without checking that tool's
own section. (A third tool, Toggle Slides, had a third, unmigrated
variant of this pattern — see its section here in git history before
2026-08-14 if relevant; it was removed for not meeting requirements.)

## Universal rules (true in every tool that has this pattern)

- **Structure**: every panel is a `.side-panel > .side-panel-header +
  .side-panel-body`. The header holds a `.title-block` + `<h2>` and a
  `.modal-close` (&times;) button; the body is `overflow-y: auto` and
  holds whatever that panel renders.
- **Docked right, no backdrop**: unlike a centered/dimmed `.modal-overlay`
  (used for Open/Export/Import/keyboard-shortcuts and similar one-off
  dialogs), a side panel never blocks or dims the canvas. The canvas
  stays fully visible and interactive while a panel is open — these are
  drawers for *live-tuning something while looking at its effect*, not
  blocking confirmations.
- **Slide transform, not display toggle**: `transform: translateX(100%)`
  ↔ `translateX(0)` via `.active`, transitioning on
  `var(--duration-base) var(--ease-standard)`. `pointer-events: none`
  when closed so an off-screen panel can't eat clicks meant for the
  canvas underneath it.
- **Only one panel open at a time.** Every tool enforces this — opening
  one panel always closes whichever other one was open first. *How* that
  exclusivity is implemented (and what happens to a panel that gets
  displaced) differs per tool — see each section below. Don't assume the
  mechanism transfers between tools.
- **No native dialogs anywhere in a panel's contents** — same
  `Shell.confirm`/`Shell.prompt` rule as the rest of the suite (see
  CLAUDE.md's Conventions section). A styled `.switch` slide-toggle
  stands in for native checkboxes inside panel fields.
- **Schema-driven fields, not hand-written per-type forms.** Every tool's
  property panel is generated from that tool's field schema
  (`ELEMENT_TYPES` for v2, `BLOCK_TYPES` for Tabbed Panels) — adding a
  field to the schema gets it a panel input for free.
  This predates the side-panel move; it was already true of the old
  floating popup.

## Animated Slides v2 (`tools/animated-slides-v2/`)

The most fully-developed version of this pattern — three panels
(Layers, Settings, Properties) sharing one screen slot, chosen because an
element's properties now live in a panel instead of the old floating
popup that used to sit beside the selected element on the canvas.

### Positioning

```css
.side-panel {
  position: fixed; top: 0; right: 0; bottom: var(--slide-bar-height, 0px);
  width: 360px; max-width: 90vw;
  z-index: 90;
  transform: translateX(100%); /* .active -> translateX(0) */
}
#editor-slide-bar { position: relative; z-index: 95; /* … */ }
```

`position: fixed` — this is NOT scoped to the canvas area, it's a true
screen-edge drawer that can visually overlap anything else at the
bottom-right of the page. That includes the bottom `#editor-slide-bar`
(the "Slides (editor)" strip with the **+ Slide** button at its right
end) — a real bug, fixed across two passes:

1. **First pass, z-index only**: `#editor-slide-bar` had no stacking
   context of its own, so any open side panel painted on top of it and
   made **+ Slide** unclickable whenever a panel — any panel, not just
   Properties — was open. Fixed by giving the bar `position: relative;
   z-index: 95` (`> 90`, the panel's z-index) so it always paints above
   the panel layer.
2. **Second pass, found while adding a taller Settings section (the
   Guides feature)**: z-index alone turned out not to be enough once a
   panel's own content is tall enough to need scrolling. `.side-panel`
   still spanned the full viewport height (`bottom: 0`) underneath the
   bar — the bar just painted over whatever portion of that box
   happened to sit behind it. That region was a permanent dead zone: no
   amount of scrolling `.side-panel-body` could bring a control out from
   behind the bar, since the bar isn't part of the panel's own scroll
   container. Fixed by making the panel's box itself stop short of the
   bar — `bottom: var(--slide-bar-height, 0px)` instead of `bottom: 0` —
   so its internal scroll area never extends into the bar's screen
   region in the first place. `syncSlideBarHeight()` in `index.html`
   measures the bar's REAL rendered height (not a guessed pixel
   constant) and publishes it as that custom property, called on load,
   window resize, and from `refreshUI()`. The z-index rule from pass 1
   stays too, as a harmless fallback for the instant before that JS runs
   on first paint.

Both pieces matter, and are easy to half-copy: the rule to reuse if
another tool's bottom bar has the same problem is the pairing of
`bottom: var(--bar-height, 0px)` on the panel AND `position: relative;
z-index` (higher than the panel's) on the bar — not z-index alone, which
only solves the problem for a panel short enough to never need
scrolling. (A third tool, Toggle Slides, had exactly this unfixed gap —
see git history before 2026-08-14; it was removed for unrelated
reasons.)

### The three panels and how they share one slot

State lives in two plain variables in `index.html`, not on any DOM
element:

```js
let activeSidePanel = null;      // 'layers' | 'settings' | 'property' | null
let panelBeforeProperty = null;  // what to restore when Properties closes
```

`applySidePanelUI()` is the only place that touches `.active`/
`.btn-active` classes — every panel transition goes through it via one
of the functions below, never a direct `classList` call elsewhere.

- **Selecting an element on the canvas** (a real click/marquee/drag —
  see "origin" below) instantly opens Properties, remembering whatever
  panel was open before (`panelBeforeProperty = activeSidePanel`) so
  deselecting can restore it. This is deliberate — "opens the instant
  something is selected" was an explicit requirement, not a default that
  happened to fall out of the code.
- **Deselecting to nothing** closes Properties (if it's the open panel)
  and restores `panelBeforeProperty`, regardless of *why* the selection
  emptied.
- **Manually opening Layers or Settings** while Properties is showing
  (selection still active underneath) swaps directly to that panel —
  it does NOT get pushed onto `panelBeforeProperty` first. Closing it
  (X button or re-clicking its rail icon) checks the *live* selection
  state directly (`editor.selectedIds.size > 0`) and reopens Properties
  if so — simpler and always correct, regardless of how many times
  Layers/Settings were flipped between while a selection was active.
- **Origin-aware selection** — the newest wrinkle, added after the panel
  system itself: `CanvasEditor.onSelect(ids, meta)` carries
  `meta.origin`, either `'canvas'` (default — a real pointerdown/
  marquee/drag/duplicate on the canvas) or `'layers-panel'` (a row click
  in the Layers panel). `handleSelectionChange()` only auto-opens
  Properties for `origin: 'canvas'`. Clicking — or shift-clicking to
  multi-select — a row in the Layers panel selects the element(s) on the
  canvas (handles/outline still appear) but leaves Layers open; it only
  refreshes Properties' fields in place if Properties already happened
  to be the open panel. This was an explicit, deliberate design
  decision: browsing/multi-selecting via Layers shouldn't yank the view
  away to Properties the way a direct canvas click should.
  `CanvasEditor.select(id, { origin })` and the couple of call sites
  that manipulate `selectedIds` directly (the Layers panel's shift-click
  toggle-off path) are what set this; every other internal call inside
  `canvas-editor.js` (marquee, duplicate, nudge, undo/redo's
  `refreshSelection()`) omits it and gets the `'canvas'` default, which
  is correct for all of them.

### Property panel contents

- **All fields shown immediately — no "More options" toggle.** This
  used to hide `tier: 'secondary'` schema fields behind a click (a
  space-saving concession the old small floating popup needed); the side
  panel has room, so as of this session every field renders at once.
  `tier` is now purely an **ordering** hint — primary fields list first,
  secondary after — not a visibility gate. Removing the toggle also
  deleted `.popup-more-toggle` and its adjacency CSS rules; don't expect
  to find them if you go looking.
- **Multi-select shows a real field-editing panel, not just
  Duplicate/Delete.** `commonFieldsForSelection(ids)` computes the
  intersection of every selected element's schema (same key AND same
  field `type`) — only fields every selected type actually has appear.
  `buildMultiField()` shows a "Mixed" placeholder (blank/disabled-option,
  depending on field type) when the selection doesn't already agree on a
  value; a native `<input type=color>` can't represent "blank", so a
  colour field falls back to showing the primary (most-recently-selected)
  element's value instead — editing it still fans out to the whole
  selection. `CanvasEditor.setFieldOnSelection(key, value)` is the write
  path: applies to every selected element that has the field, skips ones
  that don't.
- `CanvasEditor.buildField()` (single-element) and the index.html-local
  `buildMultiField()` (multi-element) are deliberately separate — a
  single-element field writes straight to `data[key]` with drag-derived
  sync (`data-field-key` + `syncPropertyPanelFields()`, for e.g. the text
  width handle); a multi-element field has no single `data` object to
  sync against, so that whole mechanism doesn't apply to it.

## Tabbed Panels (`tools/tabbed-panels/`)

Independently evolved — same `.side-panel` visual language, but the
mechanism and scope are both simpler, and it predates v2's most recent
refinements (all-fields-shown, origin-aware selection). Don't assume
either has been backported here; they haven't.

### Positioning — scoped, not viewport-fixed

```css
.side-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 340px;
  z-index: 5;
}
```

`position: absolute` inside `#canvas-wrapper` (the containing block),
**not** `position: fixed` against the viewport. `#canvas-wrapper` sits
above the bottom `#editor-tab-bar` as a sibling in the DOM/layout, not a
viewport-spanning overlay — so a Tabbed Panels side panel is
*structurally incapable* of overlapping the bottom bar's **+ Tab**
button in the first place. There's no z-index tug-of-war to get right
here the way v2 needed one; the containment does the job. If this tool
ever needs a viewport-fixed panel for some reason, the bottom-bar
z-index rule from the v2 section would need to be reapplied — it isn't
needed today only because of this scoping choice.

### Three panels, unconditional swap, no restore memory

`openPanel(name)` / `closePanel()` are the only two entry points — every
transition calls `hidePanels()` first (strips `.active`/`.btn-active`
from all three panels unconditionally) and then, for `openPanel`, adds
`.active` back to just the one being opened. There is **no
`panelBeforeProperty`-style memory** here: opening Layers while Styles is
open just closes Styles, full stop; there's nothing to "restore" when
Layers itself later closes. `closePanel()` doesn't just hide the panel —
it also clears `selectedBlockId` and deselects on the canvas, which v2's
`closeManualPanel()` deliberately does NOT do (v2 keeps the canvas
selection alive under a manually-reopened Layers/Settings panel).

**Selecting a block always opens Properties — from the canvas AND from
the Layers panel, with no distinction.** `selectBlock(id)` (which calls
`openPanel('property')`) is the single function wired to both the
canvas-click handler and the Layers-panel row-click handler. This is the
opposite of v2's `origin`-aware behavior: clicking a row in Tabbed
Panels' Layers panel DOES yank you over to the property panel, exactly
the behavior v2 was deliberately changed to avoid. If Tabbed Panels ever
gets the same "keep Layers open while browsing" request v2 got, this is
where `selectBlock()` would need an origin parameter analogous to
`CanvasEditor.select()`'s.

### Property panel contents

Tabbed Panels' block property panel already showed every field for a
block type at once — it never had a "More options" secondary-tier
concept to begin with (`tab-types.js`'s `BLOCK_TYPES` schema has no
`tier` key), so there was nothing to remove here when v2's toggle was
deleted. No multi-select concept either — Tabbed Panels has no
multi-select at all (each block is edited one at a time).
