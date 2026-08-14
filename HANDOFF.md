# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

Branch for this session's work: `claude/svg-upload-feature-plan-n1mr9j`,
tracked by **PR #12**
(https://github.com/jaceranieri/interactive-tool-suite/pull/12), which
the person created from the Claude Code UI. **Don't open another PR** —
pushing further commits to this branch updates #12 automatically.
Nobody has decided whether a session should subscribe to its activity
for auto CI-fix / review-comment handling; ask, don't assume.

## Do this first: the export nav-bar fix is NOT confirmed yet

The last thing this session did was fix a real, reproduced bug where
**every exported project rendered its slide content but no nav bar, and
used the wrong font**. The fix is committed and pushed but **the person
has not yet re-pasted and redeployed it**, so it is unconfirmed in
practice. Step 1 of the next session is:

1. Person re-pastes `AppScript/AnimatedSlidesV2.html` into Apps Script
   (**use GitHub's "Copy raw file" button, not a manual click-drag
   selection**), saves, and creates a **new deployment version** (saving
   alone does not update the served web app).
2. Generate a fresh Export from the live tool, paste into an Articulate
   embed block, confirm **the nav bar appears AND the Handwriting font
   renders as Caveat** (both symptoms came from the same defect, so both
   should resolve together).
3. If it's still broken: get the actual exported `.html` **as a file
   upload**, not pasted inline — a big inline paste got mangled in transit
   during this session and cost real time chasing a phantom. Then check
   `document.getElementById('player-root')` in the console; if it's
   `null` again the `<head>` is being corrupted by something new.

## What this session actually did

### 1. New feature: SVG upload element type in Animated Slides v2

Planned with the person up front (four scope decisions settled before
any code, same way Free draw was): **single accent colour** recolour,
**inline-in-JSON storage**, **strict allowlist sanitization**, and a
**new `svg` element type** rather than extending `icon`. Full design
detail is in CLAUDE.md's "Uploaded SVGs" section.

New file `tools/animated-slides-v2/svg-sanitizer.js` (+ its
`AppScript/SvgSanitizerJs.html` wrapper and an `<?!= include(...) ?>`
line). Verified in local Playwright preview: a `<script>` tag and an
`onclick` handler are both stripped from an uploaded file, a gradient's
internal ids get rewritten so two uploads can't collide, and the
property panel / undo-redo / duplicate all work against the new type.
A real bug was caught during that testing and is documented in
CLAUDE.md — tag/attr names were being lowercased before the allowlist
check, which silently dropped every camelCase SVG name
(`linearGradient`, `viewBox`), rendering gradient uploads as if `<defs>`
were empty with no error anywhere.

**Not yet confirmed by the person in a live deployment** — no one has
uploaded a real SVG through the hosted tool and saved/loaded/exported it
end to end. That's the main outstanding verification for this feature.

### 2. Recovered the Handwriting font feature (it had been silently destroyed)

A **previous** session built the Caveat "Handwriting" font option by
editing the live Apps Script files directly and never pushed the
equivalent change to `tools/animated-slides-v2/`. This session
regenerated those AppScript files from repo source and told the person
to "replace the existing file's contents" — which deleted the feature
from their deployment. They recovered the old files from Apps Script
version history and uploaded them; the feature has now been
**reimplemented properly in the repo** (`fontFamily` as a `fontpicker`
field across `element-types.js` / `element-renderer.js` /
`canvas-editor.js`), so it is tracked in git and can't be lost this way
again. Confirmed working in the live authoring UI by the person.

The process lesson is now written into CLAUDE.md's deployment-pipeline
section: **never recommend a whole-file AppScript replacement without
first asking whether their live copy has diverged from the repo.**

### 3. Three separate "missing nav bar" investigations — read this before debugging exports

This is the most useful thing to carry forward. The same reported
symptom had three different causes across this session, and **two
confident-looking diagnoses were wrong before the third was right**:

1. **Stale `MODULE_SOURCES`** (real, fixed): Draw and Handwriting had
   been added to the deployed `ElementTypesJs.html`/`ElementRendererJs.html`
   without regenerating Export's frozen `MODULE_SOURCES` snapshot, so
   exports containing a `draw` element threw
   `Unknown element type: draw` before the nav bar was built.
2. **Embed container height** (plausible, WRONG): theorised the canvas's
   `flex: 1` / `height: 100%` was starving the nav bar of space. Changed
   it to `aspect-ratio` derived from the project's canvas size — a
   genuine improvement that is still in the code and worth keeping, but
   it was **not** the cause. Falsified the moment the person confirmed
   the export also failed as a plain standalone file, outside Articulate
   entirely.
3. **A truncated `<link>` line in `<head>`** (the actual cause): the
   Google-Fonts `<link>` reached the deployment cut off at
   `<link href="https:`. An unterminated HTML attribute makes the parser
   consume everything up to the next `"` in the document — swallowing
   `<style>`, `</head>`, `<body>` and the opening of
   `<div id="player-root">`. So `#player-root` never existed,
   `playerRootEl.appendChild(navBarEl)` threw before `setupNavBar()`
   ran, and the same broken link meant Caveat never loaded. **One defect
   produced both reported symptoms**, which is exactly why investigating
   them as two separate bugs went nowhere.

Proven by loading the person's actual uploaded export in a browser
(`player-root` → `null`, exact error reproduced, and the parsed
`link.href` literally contained the swallowed stylesheet and `<body>`),
then repairing only that one line and watching the nav bar return.

Fixed structurally rather than by asking them to paste more carefully:
- The export no longer emits a static font `<link>` at all — the
  exported page builds it at runtime from short concatenated strings
  inside `<script>`, so there is no long line left to truncate.
- `playerRootEl` falls back to `canvasWrapperEl.parentNode`, so a
  malformed `<head>` can never again cost the learner all navigation.
- The authoring page's own `<head>` had the identical ~190-char
  single-line risk and is now three short `<link>`s.

**Still unexplained**: *why* that line arrived truncated. The repo
source was intact and the person is confident their paste was faithful,
so the corruption happened somewhere between GitHub and the running
page. The fix makes it moot, but if a mid-URL truncation ever shows up
again, that unknown is still out there.

## Standing request from the person

Whenever a session changes or creates any `AppScript/*.html` file,
**list those files at the end with clickable GitHub links** so they can
open each one and copy the code into their Apps Script project. They
asked for this explicitly; keep doing it unprompted.

## Carried over, still unverified in Apps Script (untouched this session)

- **Tabbed Panels**: `AppScript/TabbedPanels.html` + module files exist
  and went through the 5-substitution pass, `PAGES` entry uncommented,
  but none of it has been pasted into a live Apps Script project. Do a
  real Save/Open/Rename/Delete round-trip, click through Export, and
  **paste an exported file into an actual Articulate embed block to
  confirm it renders styled** (a real fix went in for that and was never
  confirmed against a real embed). Re-paste ALL of its AppScript files
  together, not just whichever seems related to the latest change.
- **Storage folders**: `apiSaveProject`/`apiListProjects`/etc. in
  `AppScript/Code.gs` gained a `folder` parameter, plus
  `apiMoveProject`/`apiCreateFolder`/`apiDeleteFolder`. Re-paste
  `Code.gs` (and `storage-backend.gs` if using the standalone fallback)
  and do a real folder round-trip before trusting it in production.
- **Toggle Slides**: the multi-button-overrides panel was confirmed
  working in a real Apps Script deployment by the person in an earlier
  session, but the **ghost-overlay/drag addition that came afterward has
  never been confirmed there** — only in local Playwright preview. Try
  dragging a ghost with a real mouse/trackpad; it's genuinely new
  interaction code, not just a data-model change.
- **PR #10** (https://github.com/jaceranieri/interactive-tool-suite/pull/10)
  against `claude/toggle-slides-multi-slide-hyhuh7` may still be open —
  check its state. Nobody has decided whether to subscribe a session to
  its activity for auto CI-fix / review-comment handling; ask, don't
  assume.

## What's next

0. **Read CLAUDE.md's "Scaling decisions — agreed, not yet implemented"
   section** (added by a planning-only review session, no code touched).
   Seven decisions were made about deploy tooling, the shared canvas
   engine, fork reconciliation, and doc/verification conventions as the
   suite grows past 3-4 tools — none of them executed yet.
1. **Confirm the export nav-bar + font fix live** (see the top section).
   Nothing else about v2 should be considered done until this is.
2. **Exercise SVG upload against the live deployment** — upload a real
   SVG, save, reload, export, embed. Only local-preview verified so far.
3. **Do the real Apps Script round-trips for Tabbed Panels** — still the
   single most important unverified thing project-wide.
4. Confirm Toggle Slides' ghost-drag interaction in a real deployment.
5. Consider backporting the explicit Save-folder-picker from Tabbed
   Panels to v2, for consistency.
6. **Wire folder browsing into v1's Open modal** — the only tool left
   without it.
7. **v2 Canvas Settings swatch consistency audit** — older backlog item,
   raised while reviewing Tabbed Panels' Styles drawer, never started.
8. Touch/tablet drag-and-drop, accessibility pass, narrow-window layout —
   standing gaps across v2 / Tabbed Panels / Toggle Slides, deferred
   many times now.

## Older, still-outstanding items from earlier in the project

- **GitHub → Apps Script auto-deploy via `clasp`** — deferred at project
  start, never revisited for a long time. A later planning session (see
  CLAUDE.md's "Scaling decisions" #2) turned this from an open-ended
  "someday" into an explicit trigger: **revisit it the next time a
  hand-sync bug actually ships to production**, rather than at a fixed
  tool-count checkpoint. Three incidents are already on record in
  CLAUDE.md's deployment-pipeline section (including one from this
  session's hand-sync work) — a fourth is the agreed signal to stop
  deferring. Don't treat "we've had incidents" alone as license to start
  this unprompted; the trigger is specifically the *next* one.

## Where to find things

`CLAUDE.md` has the durable record: Animated Slides v2's architecture
(including the new "Uploaded SVGs" and "Handwriting font" sections), the
Apps Script deployment pipeline and its 5 substitutions, all three
"nav bar missing" post-mortems written up in full, Tabbed Panels' and
Toggle Slides' architecture, and the local-preview workflow.
