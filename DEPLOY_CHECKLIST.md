# DEPLOY_CHECKLIST.md

A literal, tick-through checklist for hand-syncing `tools/{tool-id}/`
source into the deployed `AppScript/*.html` files. This is item #1 of
CLAUDE.md's "Scaling decisions" section — a standalone checklist instead
of prose, specifically so it's harder to half-follow under time
pressure. Read CLAUDE.md's "The Apps Script deployment pipeline"
section first if you haven't — this file is the executable version of
that explanation, not a replacement for it. Rewrite/renumber this file
if the pipeline itself changes; don't let it go stale the way a skipped
step here has already shipped real bugs three times (see CLAUDE.md).

**There is no build script that does this automatically.** Every box
below is a manual step. Check every one, every time, even if you think
you know which one is relevant to your specific change — the recorded
incidents all happened because someone (correctly) fixed the one
substitution related to their change and (incorrectly) assumed the
other four were untouched.

## 0. Before touching anything

- [ ] **Ask**: "Have any edits been made directly in the live Apps
      Script editor that were never pushed to this repo?" If yes, do
      **not** do a wholesale file replacement — the live copy may
      contain code the repo has never seen (this has destroyed a
      shipped feature once already). Prefer a targeted patch against
      shared anchor text instead (see CLAUDE.md's Toggle Slides
      override-ghosts sync for the pattern).
- [ ] Confirm which `tools/{tool-id}/*.js` / `index.html` files
      actually changed since the last sync. Don't skip files just
      because they "probably didn't change."

## 1. The five substitutions (per changed file)

- [ ] **Includes**: every `<link>` / `<script src>` tag →
      `<?!= include('X'); ?>` scriptlet. Each standalone `.js` file
      maps to an `AppScript/XJs.html` wrapper (e.g. `slide-manager.js`
      → `AppScript/SlideManagerJs.html`) — same code, wrapped in
      `<script>...</script>`.
- [ ] **Export module sources**: if `element-types.js` or
      `element-renderer.js` (or the equivalent files for the tool being
      synced) changed, regenerate the tool's `MODULE_SOURCES` string
      constant(s) inside its exported-HTML-generating file (e.g.
      `AnimatedSlidesV2.html`'s `openExportModal()`). `MODULE_SOURCES`
      is a frozen snapshot, not a live reference — a stale snapshot has
      already shipped a silent, hard-to-diagnose export failure (see
      CLAUDE.md's "MODULE_SOURCES" incident write-up). Generate it
      programmatically (`JSON.stringify` each real file's contents),
      never hand-typed.
- [ ] **Hub link**: `href="#"` → `href="<?!= baseUrl ?>"` (requires
      `Code.gs`'s `doGet` to inject `template.baseUrl` — should already
      be wired, just confirm it wasn't dropped).
- [ ] **`<base target="_top">`**: present in `<head>`. Without it,
      internal links break with an X-Frame-Options error inside the
      Apps Script iframe.
- [ ] **`STORAGE_API_KEY`**: placeholder replaced with
      `<?!= JSON.stringify(storageApiKey); ?>`, pulled from Script
      Properties at render time — never hand-pasted.

## 2. File-integrity checks (catch what substitution 2 above misses)

- [ ] `node --check` on each extracted `<script>` block, or directly on
      the standalone `.js` file — catches syntax errors before they
      reach a browser. Does not catch logic bugs.
- [ ] **No long single-line tags in `<head>`.** A single ~150-190 char
      line (a Google Fonts `<link>`, for example) has already arrived
      at a live deployment truncated mid-attribute, which silently
      swallowed the rest of `<head>` plus `<body>`'s opening tag (see
      CLAUDE.md's "truncated `<link>`" incident). Prefer building such
      tags at runtime via short concatenated strings in `<script>`
      (`document.createElement('link' | 'style')`) over a static long
      line, the same fix already applied to v2, Tabbed Panels, and
      Toggle Slides' exports.
- [ ] If regenerating `MODULE_SOURCES` (step 1 above), **verify
      byte-for-byte against the real source file** before considering
      the sync done — don't just trust that the generation script ran.

## 3. Verification before calling it done

- [ ] Local preview (`python3 -m http.server 8000` from repo root) for
      anything testable outside Apps Script — canvas, drag/resize,
      layers, Export, Load-from-code. Doesn't cover Save/Load, which
      needs `google.script.run`.
- [ ] If a UI change: drive it with a real browser (Playwright works
      well in an agent session) — screenshot, click through the actual
      flow that changed. A syntax check does not confirm a feature
      works.
- [ ] Paste the regenerated `AppScript/*.html` file(s) into the live
      Apps Script project (**use GitHub's "Copy raw file" button, not a
      manual click-drag selection** — a large inline paste has gotten
      mangled in transit before), save, and **create a new deployment
      version** — saving alone does not update the served web app.
- [ ] Do a real Save → reload → Load round-trip against the live
      deployment, not just local preview, for any change touching
      project data shape.
- [ ] For anything touching Export: generate a fresh export from the
      live tool and paste it into an actual Articulate embed block (or
      a plain standalone HTML file, to isolate embed-specific issues
      from export-generation issues) before calling it confirmed.

## 4. After a live deployment is confirmed

- [ ] List every changed/created `AppScript/*.html` file with clickable
      GitHub links in your final summary — a standing request from the
      person, so they can open each one and copy it into Apps Script
      without hunting for it.
- [ ] Update CLAUDE.md / HANDOFF.md's "unverified" call-outs for
      whatever this sync just confirmed, so the verification backlog
      actually shrinks instead of silently staying stale.

## Known special case: v1 (`animated-slides`)

`AppScript/AnimatedSlides.html` has manual patches (the hub link,
`<base target="_top">`) that are **not** in its repo source
(`tools/animated-slides/index.html`). If v1 is ever regenerated
wholesale from repo source, those two patches need reapplying — or
patch the deployed file directly instead, which is how this has been
handled so far.
