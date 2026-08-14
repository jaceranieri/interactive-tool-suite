# CLAUDE.md

Context for Claude (or any AI assistant) working in this repo. Read this
first — it's the map of the suite's shared architecture, conventions,
and deployment pipeline. Each tool with enough tool-specific depth to
warrant it has its own `tools/{tool-id}/CLAUDE.md` for the detail that
belongs there instead of here (currently `animated-slides-v2/` and
`tabbed-panels/`); this file points to them rather than duplicating
their content. Update whichever file actually owns a piece of content as
the project evolves — a stale CLAUDE.md actively misleads, since it's
read as ground truth rather than double-checked against the code.

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
  it renders exactly as it did before folders existed, so a tool that
  hasn't been wired up for folders yet needs no changes (every currently-
  active tool has been — this only matters for the next new tool).
  `animated-slides-v2/index.html` was the first tool wired up,
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
  picker to v2 too, for consistency — not done yet.
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
  isn't canvas-based). See `tools/animated-slides-v2/CLAUDE.md` for what
  each does; see "Scaling decisions" #3 for why they moved.
- **Tools** live in `tools/{tool-id}/`. Currently:
  - **Animated Slides v1 — removed 2026-08-14.** Superseded by v2, which
    surpassed it functionally; kept in production for a while after v2
    launched, then retired once v2 was trusted. Repo source
    (`tools/animated-slides/`) and the deployed `AppScript/AnimatedSlides.html`
    were deleted; `Code.gs`'s `PAGES` entry is commented out, not
    deleted, in case a rollback is ever needed. Saved v1 projects
    (`projects/animated-slides/*.json`) were deliberately left in place
    — no tool can open them anymore, but the data isn't destroyed.
    Already-published Articulate courses built from a v1 export keep
    working regardless, since an export is self-contained HTML with no
    runtime dependency on the authoring tool. See git history at or
    before this commit for v1's source if ever needed again.
  - `animated-slides-v2/` — ground-up rebuild of Animated Slides:
    schema-driven element system, undo/redo, cross-slide element linking,
    multi-select. As of this writing, considered feature-complete enough
    that active development has paused (see "Current status" below for
    the one-line summary, `tools/animated-slides-v2/CLAUDE.md` for the
    full architecture and detailed status).
  - `tabbed-panels/` — schema-driven tab/block authoring tool (flowed
    content, not the SVG canvas the other two tools use). Deployed to
    Apps Script (`AppScript/TabbedPanels*.html`, `Code.gs`'s `PAGES` entry
    uncommented) with a working Export and a confirmed-live Save/Load
    round-trip — see `tools/tabbed-panels/CLAUDE.md` for its full
    architecture and current backlog.
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

Worth remembering even though the tool itself is gone (see the
Architecture section's v1 removal note): **v1's deployed copy had manual
patches that were never in its repo source** — specifically the hub link
and `<base target="_top">`. A live file silently diverging from repo
source is exactly the class of risk "the deployed Apps Script project,
not this repo, is the source of truth" warns about below — worth
recalling if a future tool's deployed copy is ever suspected of the
same drift.

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

Every tool's `index.html` loads its JS as plain `<script src>` files
(from its own folder and/or `../../shared/`), so serving the repo with
any static file server and opening a tool's `index.html` renders it
fully interactive — canvas/content area, drag/resize, side panels,
undo/redo, Export — in a real browser, without touching Apps Script at
all:

```
python3 -m http.server 8000   # from the repo root
# then open http://localhost:8000/tools/{tool-id}/index.html
```

**Save/Load and the rest of project management don't work locally** —
those go through `google.script.run`, which only exists once the page is
actually served by Apps Script. GSAP, Font Awesome, and the Google Fonts
stylesheet load from CDN for tools that use them, so local preview still
needs real internet access for those (a sandboxed/offline environment
will render the structural layout but without icons, animation, or the
intended fonts). See each tool's own `CLAUDE.md` for its specific script
list and any tool-specific local-preview notes.

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

- **v1**: removed 2026-08-14 — see the Architecture section's Tools
  list for the removal note.
- **v2**: feature-complete on the original build plan plus a further
  round of polish (Draw, Handwriting font, SVG upload, the property
  side-panel redesign, ruler guides). Draw/Handwriting/SVG upload and the
  nav-bar/font export fix are all confirmed working live; ruler guides
  are still local-preview-only pending live-deployment confirmation. Two
  "nav bar missing" incidents from this round are fully written up in
  "The Apps Script deployment pipeline" above since they're general
  lessons, not v2 trivia. Full detail and the current backlog:
  `tools/animated-slides-v2/CLAUDE.md`.
- **Tabbed Panels**: in development, but Export and the real Apps Script
  Save/Load round-trip are now both confirmed working live. Full detail:
  `tools/tabbed-panels/CLAUDE.md`.
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
  / `history.js` — the promoted engine described in
  `tools/animated-slides-v2/CLAUDE.md` — rather than copy-pasting v2's
  tool-specific files the way the now-removed Toggle Slides did (see the
  Architecture section's Toggle Slides bullet for how that diverged and
  why it was a real, live-shipped bug by the time it was investigated).
- **Register it**: add an entry to `Code.gs`'s `PAGES` map (this alone
  makes it reachable from the hub — no separate manifest to update) and
  set up the matching deployed `AppScript/*.html` files per
  `DEPLOY_CHECKLIST.md`.
- **Give it its own `tools/{tool-id}/CLAUDE.md` once there's enough
  tool-specific depth to warrant one** (architecture, feature write-ups,
  a detailed "Current status") — root `CLAUDE.md` should stay the lean
  map, not grow a new multi-hundred-line section per tool the way it did
  before `animated-slides-v2/CLAUDE.md` and `tabbed-panels/CLAUDE.md`
  were split out. A brand-new tool with only a sentence or two of detail
  doesn't need its own file yet — a bullet under "Tools" above is enough
  until there's real depth to move.
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
6. **Verification/production backlog**: in progress — Tabbed Panels'
   Save/Load/Export round-trip and v2's SVG upload are both now
   confirmed working against the live Apps Script deployment (Toggle
   Slides' items dropped off this list with its removal). Still open:
   folder-support round-trip (`apiSaveProject`/`apiMoveProject`/
   `apiCreateFolder`/`apiDeleteFolder` in `Code.gs`) and v2's ruler
   guides, both tracked in `HANDOFF.md`. Clear the rest **before**
   starting any new tool, rather than letting it keep growing alongside
   new work.
7. **`AppScript/x`**: deleted — was a stray tracked, apparently
   content-free file from an unrelated stray commit, not part of any
   tool's real file set. Done.
