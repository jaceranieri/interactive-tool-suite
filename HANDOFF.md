# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

## Urgent — do this first

**Rotate `STORAGE_API_KEY`.** The real value of this Script Property was
pasted into a chat session in plaintext (as part of debugging output
captured from the browser console — see the Toggle Slides section
below). As of this handoff **it has not yet been rotated**. Generate a
new key, update it in Script Properties, and confirm the tools still
authenticate against the storage backend afterward (the code reads it
fresh from Script Properties each time, via `Code.gs`'s
`PropertiesService.getScriptProperties().getProperty('STORAGE_API_KEY')`,
so no other file needs the literal value hand-pasted anywhere).

## Not yet confirmed by the person

- **Toggle Slides — real Save/Load round-trip against live
  `google.script.run` is still untested.** The Apps Script deployment is
  confirmed *working* now (see below — a real paste-corruption bug that
  broke every button was found and fixed this session, verified by the
  person reloading the live tool and reporting it works), but "works" so
  far only means the UI is interactive again (buttons respond, no
  console errors). Nobody has yet actually clicked Save on a real
  project, reloaded, and confirmed it round-trips through GitHub via the
  Apps Script storage backend. Do that before treating Toggle Slides as
  fully deployed.
- **Tabbed Panels — the new page-background feature (see below) has not
  been redeployed/reverified against the live Apps Script project.** It
  was added and verified in local preview only. The Apps Script files
  (`TabbedPanels.html`, `TabManagerJs.html`) were regenerated with the
  feature baked in and pushed to the repo, but as far as this session
  knows, they were never re-pasted into the live Apps Script project
  (the person's later "everything seems to be working" check was for a
  different, earlier fix — the Articulate export-styling bug — and
  predates this feature). Re-paste both files and confirm the Styles
  drawer's new "Page background" section works live before assuming it
  does.
- **Tabbed Panels' original open item is still open**: a real
  Save/Open/Rename/Delete round-trip (plus folder support) against live
  `google.script.run` has never been confirmed in this project's history
  as far as this session's context goes. If a future session treats
  Tabbed Panels as "done," check this hasn't quietly stayed unverified
  across multiple sessions.

## This session: Toggle Slides — new tool, built and deployed

**Built a new tool from scratch**: `tools/toggle-slides/`. Adapts
Animated Slides v2's SVG canvas/element engine (reused verbatim:
`element-types.js`, `element-renderer.js`, `canvas-editor.js`,
`history.js`) for a different interaction — nav buttons independently
toggle groups of elements on/off on ONE persistent canvas, any number on
at once, instead of v2's mutually-exclusive slide switching. Worked
example that drove the design: press A → shows Element-A; press C →
A and C both shown; press B → A, B, C all shown; press C again → A and B
remain, C hides.

New pieces: `toggle-manager.js` (`ToggleManager` — single-canvas state +
button/visibility model, "any-of" ownership semantics), `toggle-nav.js`
(adapted from v2's `nav-bar.js` for multi-active toggle buttons instead
of one active slide), `layer-panel.js` (adapted — button-ownership badge
instead of v2's cross-slide "linked" badge), and `index.html` (page
shell, a **Preview mode** that's the only thing separating "author can
edit everything, always fully visible" from "learner-facing on/off
behavior is actually applied," an "Assign to buttons" checkbox section
in the Layers drawer, a bottom button-chip bar for button CRUD, Export,
and Load-from-code). Full architecture write-up is in CLAUDE.md's
"Toggle Slides" section — read that before touching this tool again,
especially the EDIT-vs-PREVIEW state-management explanation.

Verified in local preview via a scripted Playwright run (using a GSAP
stub, since this sandboxed environment has no route to the real CDN)
that reproduced the exact A→C→B→C example end to end, confirmed correct
opacity end-states at each step, confirmed exiting Preview restores full
editability, and smoke-tested the generated Export HTML.

**Deployed to Apps Script this session** — `AppScript/ToggleSlides.html`
+ three new module files (`ToggleManagerJs.html`, `ToggleNavJs.html`,
`ToggleLayerPanelJs.html` — the last one "Toggle"-prefixed to avoid
colliding with v2's own existing `LayerPanelJs.html` in Apps Script's
flat file namespace). Four modules were reused as-is from v2
(`ElementTypesJs.html`, `ElementRendererJs.html`, `CanvasEditorJs.html`,
`HistoryJs.html`) since they're byte-identical. `Code.gs`'s `PAGES` entry
is uncommented, so the tool is reachable from the hub.

### A real deployment bug was hit and fixed — read this before deploying anything else

After the person pasted the generated files into the live Apps Script
project, every button broke: `Uncaught SyntaxError: Invalid or
unexpected token` in the console, and every function the main script
defined (`newProject`, `saveProject`, `toggleLayersPanel`, etc.) came
back as "not defined" — a syntax error anywhere in a classic `<script>`
tag means NOTHING in it gets defined, not even hoisted function
declarations, which is why one bad token broke every button at once.

Root-caused via the browser's own console (see CLAUDE.md's Toggle Slides
section for the exact diagnostic steps — worth reusing if this happens
again on a future tool): isolating `document.scripts[N].textContent` on
the actual failing script and diffing it against the repo source showed
several whole comment blocks silently missing from the live page —
**not** present in the repo file, and **not** explained by GitHub's
copy/paste path (a fresh copy from `raw.githubusercontent.com`
reproduced the identical missing bytes). Something in the
paste-into-Apps-Script-editor path is selectively eating specific
comments; the exact mechanism was never identified (it wasn't consistent
between single-line and multi-line comments, so it isn't a simple
delimiter-matching bug on our end).

**Fix applied**: stripped all comments from the Toggle-Slides-specific
deployment files via `esbuild --minify --minify-identifiers=false`
(drops every comment, keeps top-level function/class names intact since
separate `<script>` tags in the page share one global scope and
reference each other by name — full identifier mangling would break
that). Verified the export template's escape-sensitive `<\/script>`
sequences survive minification correctly before trusting it. Applied to
`ToggleSlides.html`'s own inline script, `ToggleManagerJs.html`,
`ToggleNavJs.html`, `ToggleLayerPanelJs.html`, and the `MODULE_SOURCES`
module text embedded inside `ToggleSlides.html`. The four shared v2
includes were left untouched (already proven working, unminified,
elsewhere). **The person re-pasted the fixed files and confirmed it
works.**

This is now documented in CLAUDE.md as a known risk for future
deployments — if a future tool's live deployment shows the same
"buttons don't work, syntax error in console" symptom, minifying the
affected file (comments-only, not full minification) before pasting is
the fastest known fix.

## This session: Tabbed Panels — customizable/transparent page background

Requested by the person: the exported embed's outer background (behind
the white player card, currently hardcoded `#F1F0EB`) should be
author-configurable to any colour, or transparent, so the embed can
blend into whatever Articulate slide it's dropped onto. Added
`styles.pageBackground` (`{ color, transparent }`) to
`defaultStyles()`/backfill logic, a new "Page background" section in the
Styles drawer (colour swatch + a "Transparent" toggle, disabling the
swatch when transparent is on), `applyPageBackground()` for live
authoring-canvas preview (falls back to the editor's normal chrome
colour when transparent is selected, since true transparency has
nothing meaningful to preview inside the app's own UI), and export
template changes so `openExportModal()` emits either the chosen colour
or a literal `background: transparent`. Applied to both
`tools/tabbed-panels/index.html` and the already-deployed
`AppScript/TabbedPanels.html`/`TabManagerJs.html` — **not yet
re-verified against the live Apps Script project** (see "Not yet
confirmed" above).

Also confirmed this session (no code change needed): the
previously-reported "Articulate embed loses all styling" bug was already
fixed in an earlier session (commit `89dcca5`) — both the repo source
and the deployed Apps Script copy already inject CSS/fonts via a
script-created `<style>`/`<link>` rather than static `<head>` tags. The
person confirmed their live Apps Script files match this fixed
behavior.

## What's next

1. **Rotate `STORAGE_API_KEY`** (see "Urgent" above) — highest priority,
   this is a live credential exposure.
2. **Toggle Slides**: do a real Save/Load round-trip against live
   `google.script.run`.
3. **Tabbed Panels**: re-paste `TabbedPanels.html` + `TabManagerJs.html`
   into the live Apps Script project so the page-background feature is
   actually live, then verify it there.
4. **Tabbed Panels**: still needs its own original real Save/Open/
   Rename/Delete/folder round-trip confirmed against live
   `google.script.run` — long-standing open item, unclear if ever done.
5. **Seriously consider a `clasp`-based deploy pipeline.** This was
   already on the backlog before this session ("deferred at project
   start, never revisited"), but this session's paste-corruption
   incident is a much stronger argument for it now — a proper `clasp
   push` bypasses manual copy/paste into the Apps Script web editor
   entirely, which would have prevented today's multi-hour debugging
   session outright, whatever its root cause actually was. Worth
   prioritizing above further feature work.
6. Toggle Slides backlog (see CLAUDE.md's "What's NOT built yet" under
   Toggle Slides): touch/tablet drag-and-drop on the button bar, no
   accessibility pass, no narrow-window layout testing, no thumbnail
   preview on button chips.
7. Tabbed Panels backlog (see CLAUDE.md): touch/tablet drag-and-drop, no
   accessibility pass, no narrow-window layout testing.
8. v2 backlog, still not started: Canvas Settings swatch-consistency
   audit (raised while reviewing Tabbed Panels' Styles drawer); custom
   colour pickers; thin icon library; touch/tablet support; no
   accessibility pass; narrow-window layout untested.
9. Consider backporting Tabbed Panels' explicit Save-folder-picker to
   v2 (v2 still only infers destination folder from the Open modal).
10. **v1 still has no folder support at all** in its Open modal — the
    only tool left without it.

## Where to find things

`CLAUDE.md` has the full architecture for every tool, including this
session's Toggle Slides section (read the EDIT-vs-PREVIEW explanation
before touching that tool again) and the Apps Script deployment
pipeline checklist — including the new "paste can silently corrupt
comments, minify to route around it" lesson from this session, worth
knowing before deploying any other tool for the first time.
