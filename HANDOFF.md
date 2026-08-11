# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

## Not yet confirmed by the person (do this first if picking this back up)

**Toggle Slides' multi-button-overrides feature (this session, see
below) has never been tested in a real Apps Script deployment — only
local Playwright preview.** The person did test the base panel (Show/
Hide/position overrides, live preview toggle) in a real Apps Script
project earlier in the session and confirmed it works; the **ghost-
overlay/drag feature added afterward has NOT been confirmed by the
person yet, in Apps Script or otherwise** — it's only been verified via
this environment's Playwright/local-preview harness. Try dragging a
ghost on a real touchscreen/trackpad/mouse and see if the interaction
feels right — this is genuinely new interaction code, not just a data-
model change.

**PR #10** (https://github.com/jaceranieri/interactive-tool-suite/pull/10)
is open against branch `claude/toggle-slides-multi-slide-hyhuh7`,
created by the person from the Claude Code UI (not by the assistant).
Pushing more commits to that branch updates it automatically. The
assistant offered to subscribe to the PR's activity (auto-fix CI
failures / respond to review comments) but the person ended the session
before answering — ask again next time if that'd be useful, don't
assume yes.

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
  just whichever seems related to the latest change — a stale file has
  already caused one real "forgot to redeploy" bug this project.
- `apiSaveProject`/`apiListProjects`/etc. in `AppScript/Code.gs` gained a
  `folder` parameter, plus `apiMoveProject`/`apiCreateFolder`/
  `apiDeleteFolder`. Re-paste `Code.gs` (and `storage-backend.gs` if
  using the standalone fallback) and do a real folder round-trip before
  trusting it in production.

## This session: Toggle Slides multi-button reflow (overrides + ghost UI)

**New feature, built from scratch this session after a scoping
conversation with the person** (worked through with a concrete example
before any code was written — see CLAUDE.md's "Multi-button reflow"
section for the full worked sentence example: "A man jumped." + Adverb/
Adjective/Proper Noun buttons). The base tool only supported buttons
independently toggling their own owned elements on/off; this adds the
ability for a button to hide or reposition elements it does NOT own, so
combinations of buttons can read as content reflowing (words/elements
sliding to make room) without introducing a second "slide" concept.

- **Data model** (`toggle-manager.js`): buttons gained `hideElementIds`
  and `positionOverrides` alongside the existing `elementIds`.
  `resolve(elementId, activeButtons?)` is the one place the conflict
  rule lives — **most-recently-toggled-ON button wins** when multiple
  active buttons touch the same element — implemented via a new
  `toggleOrder` stack. Verified end-to-end against the worked sentence
  example (see this session's git history / CLAUDE.md for the exact
  Playwright script and expected output at each step).
- **Authoring UI** (`index.html`): clicking a button chip in the bottom
  bar opens a new "Toggle button" side panel (`#button-overrides-panel`)
  listing every canvas element with a Show/Hide/No-override segmented
  control and position-override fields, plus a "Preview this button ON"
  live-preview toggle.
- **Ghost overlay + drag** (added after the person tried the first
  version and found raw X/Y coordinates hard to reason about
  spatially): while the panel is open, every element with a position
  override gets a translucent (45% opacity) ghost duplicate drawn at its
  target position, connected to its base position by a dashed line. The
  ghost is directly draggable — dragging writes into the override the
  same way normal canvas dragging writes into an element's base
  position — with numeric fields kept as a live-synced precision
  fallback. Self-contained in `index.html` (`renderOverrideGhosts()`/
  `attachGhostDrag()`); deliberately does NOT touch `canvas-editor.js`
  or `element-renderer.js`, which stay byte-identical to Animated Slides
  v2's copies per the project's existing convention.
- **Apps Script sync**: `AppScript/ToggleManagerJs.html` re-synced
  byte-for-byte (pure `<script>` wrap). `AppScript/ToggleSlides.html`
  got both the overrides panel and the ghost-overlay code applied as
  clean additive patches against shared anchor text (no other
  substitutions affected). The person tested the panel in a real Apps
  Script deployment mid-session and confirmed it works, but as noted
  above, the ghost-drag addition that came after hasn't been confirmed
  there yet.

Full design detail (the OVERRIDES/CONFLICT RULE mechanism, the ghost
implementation, the EDIT vs PREVIEW split this tool already had) is in
CLAUDE.md's "Toggle Slides" section — read that before touching this
code again, especially the "Override ghosts" bullet if extending the
drag interaction further.

**Deferred UI ideas from the same conversation, not built**: on-canvas
status badges (a small hide/move icon on each element itself, so the
whole layout's state is visible without opening the panel) and a live
animated "scrub" between base and resolved state instead of the current
binary preview toggle. Both were proposed and explicitly deferred —
revisit if the ghost-drag UI still isn't enough once the person has used
it for real.

## Earlier sessions

See git history / previous versions of this file for: the Articulate
export-styling bug fix (static `<style>`/`<link>` tags stripped by
Articulate's embed sanitizer, fixed by injecting CSS via a script-
created `<style>` element instead), buttons/links always opening in a
new tab, the inline-link creation bug fix, table/tab-colour/badge
styling, UI polish micro-animations, folder support across tools, and
the Tabbed Panels Layers panel. All still in place, unaffected by this
session. CLAUDE.md is the durable record of all of it — this file only
tracks what's transient.

## What's next

1. **Confirm the ghost-drag interaction in a real browser/Apps Script
   deployment** — the one thing from this session not yet confirmed by
   the person. If dragging still doesn't feel right, the deferred ideas
   above (status badges, animated scrub) are the next logical step.
2. Decide whether to subscribe this session (or a fresh one) to PR #10's
   activity for auto CI-fix / review-comment handling.
3. **Do the real Apps Script round-trips for Tabbed Panels** — still the
   single most important unverified thing project-wide, unrelated to
   this session's work. Specifically: paste an exported Tabbed Panels
   HTML into a real Articulate embed block and confirm the styling fix
   actually resolves the originally reported issue there.
4. Consider backporting the explicit Save-folder-picker to v2.
5. **Wire folder browsing into v1's Open modal** — the only tool left
   without it.
6. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   not started.
7. Touch/tablet drag-and-drop, accessibility pass, narrow-window layout
   — standing gaps across v2/Tabbed Panels/Toggle Slides, deferred
   multiple times now. Toggle Slides' new ghost-drag is pointer-events
   based (not HTML5 drag-and-drop), so it may already work on touch —
   untested either way.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Every session now touches more
  `AppScript/*.html` files to hand-sync (this session: 2 of them), worth
  revisiting sooner rather than later.

## Where to find things

`CLAUDE.md` has the architecture (Toggle Slides' full internal
architecture including this session's multi-button-overrides and
override-ghosts work, plus Tabbed Panels' and Animated Slides v2's
architecture), the Apps Script deployment pipeline checklist, and the
local-preview workflow.
