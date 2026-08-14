# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

Branch for this session's work: `claude/project-structure-review-v8vg7j`,
tracked by **PR #16**
(https://github.com/jaceranieri/interactive-tool-suite/pull/16) — open,
not yet merged; the person is merging it manually. **Don't open another
PR against this branch** — pushing further commits to it updates #16
automatically. Note this branch's PR history is non-trivial: an earlier
point of this same branch was already merged once as **PR #15**, so a
later part of the session had to rebase the branch's remaining unmerged
commits onto the post-#15 `main` before pushing further (see git log —
`main` and this branch share `main`'s current tip as their common
ancestor, not some older point).

## What this session actually did

A planning-only review of the suite's project structure (no code
touched at first) turned into a full execution pass once the person
started approving items. In order:

1. **Planning review** — walked the repo's shared architecture,
   deployment pipeline, and doc structure, surfaced seven concrete
   "scaling decisions" (see `CLAUDE.md`'s "Scaling decisions" section)
   given an expected 5-8 tools total. The person approved all seven,
   then asked for them to actually be executed rather than just
   recorded.
2. **`DEPLOY_CHECKLIST.md`** created — the 5-substitution Apps Script
   pipeline as a literal, tick-through checklist instead of prose.
3. **`clasp`/build-automation deferral** made explicit and trigger-based
   (revisit on the *next* hand-sync bug, not a fixed tool-count
   checkpoint) — a decision record, not a task.
4. **Shared canvas engine promoted to `shared/`** —
   `canvas-editor.js`/`element-types.js`/`element-renderer.js`/
   `history.js` moved out of `tools/animated-slides-v2/`. Tabbed Panels'
   own duplicate `history.js` was retired in favor of the shared copy.
   Verified via Playwright against local preview (both tools load clean,
   expected globals present) and `AnimatedSlidesV2.html`'s
   `MODULE_SOURCES` was regenerated and confirmed byte-for-byte.
5. **Toggle Slides removed** — didn't meet requirements. While
   investigating its fork of the canvas engine for possible
   reconciliation, surfaced a real, separate, already-live bug: the
   shared `AppScript/CanvasEditorJs.html` had already drifted to v2's
   popup-free version while `AppScript/ToggleSlides.html` still expected
   the old internal-popup behavior — meaning Toggle Slides' element
   property editing was likely already broken in production before this
   removal. Written up in `CLAUDE.md`'s Scaling decisions #4 as a
   general lesson for any future tool that forks/shares these files.
6. **Cross-tool pattern-doc convention formalized** — once a second tool
   implements a UI pattern (the `SIDEBAR.md` model), write a standalone
   doc rather than only after a bug forces the comparison. Along the
   way, found and fixed a real dangling reference: `CLAUDE.md`'s
   "Current status" had pointed at a "Starting a new tool" section that
   never actually existed in the file.
7. **`AppScript/x`** (a stray, apparently content-free tracked file)
   deleted.
8. **Animated Slides v1 removed** — superseded by v2. Repo source and
   the deployed `AppScript/AnimatedSlides.html` deleted; `Code.gs`'s
   `PAGES` entry commented out, not deleted. Saved v1 projects in
   `projects/animated-slides/*.json` left in place untouched.
   Already-published Articulate courses built from a v1 export are
   unaffected (self-contained HTML, no runtime dependency on the
   authoring tool).
9. **Root `CLAUDE.md` split into per-tool docs** — it had grown past
   1200 lines, most of it deep detail specific to one tool. Moved
   Animated Slides v2's full internal architecture and Tabbed Panels'
   full architecture into `tools/animated-slides-v2/CLAUDE.md` and
   `tools/tabbed-panels/CLAUDE.md` (root is now ~550 lines). Each tool
   doc also got an explicit "Deployed Apps Script files" section, since
   `AppScript/`'s flat namespace can't mirror the `tools/{tool-id}/`
   split.
10. **Three previously-open verification items confirmed live** by the
    person: the export nav-bar/Handwriting-font fix, v2's SVG upload
    feature end to end, and Tabbed Panels' Save/Open/Rename/Delete +
    Export round-trip. Updated everywhere these were tracked.

No `tools/` or `shared/` application code was touched this session —
every commit was documentation, `Code.gs`'s `PAGES` map, or file moves
(the `shared/` promotion moved files but changed no logic).

## Standing request from the person

Whenever a session changes or creates any `AppScript/*.html` file,
**list those files at the end with clickable GitHub links** so they can
open each one and copy the code into their Apps Script project. They
asked for this explicitly; keep doing it unprompted.

## Carried over, still unverified in Apps Script

- **Storage folders**: `apiSaveProject`/`apiListProjects`/etc. in
  `AppScript/Code.gs` gained a `folder` parameter, plus
  `apiMoveProject`/`apiCreateFolder`/`apiDeleteFolder`. Re-paste
  `Code.gs` (and `storage-backend.gs` if using the standalone fallback)
  and do a real folder round-trip before trusting it in production.
- **v2's ruler guides**: verified in local preview (Playwright) only —
  add/drag/delete a guide, snap behaviour, and undo/redo/persistence all
  confirmed there, but not yet hand-verified against the live Apps
  Script deployment. See `tools/animated-slides-v2/CLAUDE.md`'s Current
  status section.

## What's next

0. **Read `CLAUDE.md`'s "Scaling decisions" section.** #1, #2, #3, #5,
   and #7 are done; #4 is moot (Toggle Slides removed); #6
   (verification backlog) is down to just the two "Carried over" items
   above.
1. **Folder-support round-trip** — live and unconfirmed. See "Carried
   over" above.
2. **v2's ruler guides against the live deployment** — local-preview
   confirmed only so far. See "Carried over" above.
3. Consider backporting the explicit Save-folder-picker from Tabbed
   Panels to v2, for consistency.
4. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   raised while reviewing Tabbed Panels' Styles drawer, never started.
5. Touch/tablet drag-and-drop, accessibility pass, narrow-window layout —
   standing gaps across v2 / Tabbed Panels, deferred many times now.
6. **Outside this repo**: `AppScript/ToggleSlides.html`/`Toggle*Js.html`
   and `AppScript/AnimatedSlides.html` may still be reachable in the
   *live* Apps Script deployment until manually deleted there — the
   commented-out `PAGES` entries only stop the hub from listing them
   once `Code.gs` is redeployed. Also worth closing **PR #10**
   (Toggle Slides' old branch) on GitHub if it's still open.

## Older, still-outstanding items from earlier in the project

- **GitHub → Apps Script auto-deploy via `clasp`** — deferred at project
  start, never revisited for a long time. Turned into an explicit
  trigger this session (see `CLAUDE.md`'s "Scaling decisions" #2):
  **revisit it the next time a hand-sync bug actually ships to
  production**, rather than at a fixed tool-count checkpoint. Three
  incidents are already on record in `CLAUDE.md`'s deployment-pipeline
  section — a fourth is the agreed signal to stop deferring. Don't treat
  "we've had incidents" alone as license to start this unprompted; the
  trigger is specifically the *next* one.

## Where to find things

`CLAUDE.md` (repo root) is the lean, cross-tool map: hosting/storage/
hub architecture, the `shared/` foundation, the Apps Script deployment
pipeline and its 5 substitutions (including all three "nav bar missing"
post-mortems), Conventions, and Scaling decisions. Each tool's own
architecture, feature write-ups, and current status now live in its own
`tools/{tool-id}/CLAUDE.md` — currently `tools/animated-slides-v2/
CLAUDE.md` and `tools/tabbed-panels/CLAUDE.md`. `SIDEBAR.md` is the
cross-tool side-panel pattern reference. `DEPLOY_CHECKLIST.md` is the
step-by-step Apps Script sync checklist.
