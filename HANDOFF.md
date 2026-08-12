# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

## This session: Animated Slides v2 — Free Draw tool + second (Handwriting) font

Both features are **built, deployed to the person's real Apps Script
project, and confirmed working by the person** — nothing outstanding
from this session. Branch: `claude/animated-slides-free-draw-26nea6`
(no PR opened — not asked for). Two commits:

1. **Free Draw tool** — a new `draw` element type. Pencil-icon left-rail
   button arms a multi-stroke draw mode (Escape or clicking it again
   exits); each stroke is captured, simplified (Ramer-Douglas-Peucker,
   `simplifyPoints()` in `canvas-editor.js`), and curve-fit (Catmull-
   Rom-to-Bezier, `smoothedPathFromPoints()` in `element-renderer.js`)
   into a smooth path instead of a jittery raw mouse trace. Points are
   stored normalized to the element's own bounding box, so it gets
   corner-resize handles for free, same as rect/icon. Full design
   detail in CLAUDE.md's "Free draw" section.
2. **Second Text font** — a "Font" picker (Sans / Handwriting, the
   latter Google's Caveat) via a `FONT_FAMILIES` map in
   `element-renderer.js` and a new generic `fontpicker` field type in
   `canvas-editor.js` (same pattern as the existing icon picker — add
   an entry, it's wired up everywhere). Line-wrapping recalculates
   against the actually-selected font, not just the rendered attribute.

Both changes touched the same 4 files each time: `element-types.js`,
`element-renderer.js`, `canvas-editor.js`, `index.html`, hand-synced
into their `AppScript/*.html` counterparts as pure additive changes (no
new deployment substitutions needed either time).

### A real bug hit mid-session, worth remembering

After the Free Draw tool shipped, the person reported it was broken in
their live deployment (clicking Draw instantly placed a boxed element
instead of arming draw mode; click-drag just did normal marquee-select).
Root cause **wasn't a code bug** — it was a **partial redeploy**: the
person had pasted the updated `CanvasEditorJs.html` (confirmed via
`editor.setDrawMode` existing in their live console) but not the
updated `AnimatedSlidesV2.html`, so the old `renderAddElementButtons()`
was still live and every button — including Draw — fell through to the
generic instant-place `addElement(type)` path. Diagnosed by having the
person run a few `document.getElementById(...)` / `editor.drawMode`
checks directly in their live browser console (DevTools → Console,
select the `userHtmlFrame` context in the Apps Script iframe stack) —
worth reusing that diagnostic approach if something "looks right in the
repo but wrong live" again. **General lesson, same one already
flagged for Tabbed Panels below: when re-pasting for a v2 change, paste
ALL of that change's touched AppScript files together, never just the
one that seems most related** — `AnimatedSlidesV2.html` is the largest
and easiest to under-paste.

## Not yet confirmed by the person (carried over, untouched this session)

**Toggle Slides' multi-button-overrides feature** — the base panel
(Show/Hide/position overrides, live preview toggle) was confirmed
working in a real Apps Script deployment in an earlier session; the
**ghost-overlay/drag feature added after that has still never been
confirmed by the person**, in Apps Script or otherwise — only verified
via this environment's Playwright/local-preview harness. Try dragging a
ghost on a real touchscreen/trackpad/mouse and see if the interaction
feels right.

**PR #10** (https://github.com/jaceranieri/interactive-tool-suite/pull/10)
is open against branch `claude/toggle-slides-multi-slide-hyhuh7`,
created by the person from the Claude Code UI. Pushing more commits to
that branch updates it automatically. Nobody has subscribed to its
activity for auto-fix CI failures / review comments — ask the person if
that'd be useful next time this comes up, don't assume yes.

**Tabbed Panels and the shared storage-folders work are still
unverified in Apps Script too** (carried over from earlier sessions,
untouched this session):
- `AppScript/TabbedPanels.html` + module files exist, went through the
  5-substitution pass, `PAGES` entry uncommented — but none of it has
  actually been pasted into a live Apps Script project yet. Do a real
  Save/Open/Rename/Delete round-trip, click through Export, **paste an
  exported Export into an actual Articulate embed block and confirm it
  renders styled** (a real bug was fixed for this earlier — see
  CLAUDE.md's Tabbed Panels section — but never confirmed against a real
  embed). Re-paste ALL of Tabbed Panels' AppScript files together, not
  just whichever seems related to the latest change.
- `apiSaveProject`/`apiListProjects`/etc. in `AppScript/Code.gs` gained a
  `folder` parameter, plus `apiMoveProject`/`apiCreateFolder`/
  `apiDeleteFolder`. Re-paste `Code.gs` (and `storage-backend.gs` if
  using the standalone fallback) and do a real folder round-trip before
  trusting it in production.

**Toggle Slides itself is still "unverified end to end"** per CLAUDE.md
— the base Save/Load round-trip against a real Apps Script project
hasn't been exercised, independent of the ghost-drag item above.

## Earlier sessions

See git history / previous versions of this file for: Toggle Slides'
multi-button reflow (overrides + ghost UI), the Articulate export-
styling bug fix (static `<style>`/`<link>` tags stripped by Articulate's
embed sanitizer, fixed by injecting CSS via a script-created `<style>`
element instead), buttons/links always opening in a new tab, the
inline-link creation bug fix, table/tab-colour/badge styling, UI polish
micro-animations, folder support across tools, and the Tabbed Panels
Layers panel. All still in place, unaffected by this session. CLAUDE.md
is the durable record of all of it — this file only tracks what's
transient.

## What's next

1. **Do the real Apps Script round-trips for Tabbed Panels** — still the
   single most important unverified thing project-wide. Specifically:
   paste an exported Tabbed Panels HTML into a real Articulate embed
   block and confirm the styling fix actually resolves the originally
   reported issue there.
2. **Confirm Toggle Slides' ghost-drag interaction in a real browser/
   Apps Script deployment** — the one open item from the session before
   last, still not confirmed.
3. Decide whether to subscribe to PR #10's activity for auto CI-fix /
   review-comment handling.
4. Consider backporting the explicit Save-folder-picker to v2.
5. **Wire folder browsing into v1's Open modal** — the only tool left
   without it.
6. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   not started.
7. Touch/tablet drag-and-drop, accessibility pass, narrow-window layout
   — standing gaps across v2/Tabbed Panels/Toggle Slides, deferred
   multiple times now.
8. v2's known gaps (unchanged by this session, see CLAUDE.md "Current
   status"): custom colour pickers (native inputs restyled as swatches,
   not a full custom picker), a thin icon library (7 icons).

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Every session now touches more
  `AppScript/*.html` files to hand-sync (this session: 4 of them, across
  two separate changes), and this session's mid-work bug was a direct
  consequence of that manual step being error-prone — worth revisiting
  sooner rather than later.

## Where to find things

`CLAUDE.md` has the full architecture — Animated Slides v2's Free Draw
tool and FONT_FAMILIES/fontpicker pattern (both added this session),
plus Toggle Slides', Tabbed Panels', and the rest of v2's architecture
— the Apps Script deployment pipeline checklist, and the local-preview
workflow.
