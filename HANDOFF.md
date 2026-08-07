# HANDOFF.md

A snapshot of exactly where this project stood at the end of the last
work session — for a new session to pick up without the full
conversation history. This file is disposable: rewrite it (don't append
to it) at the end of each work session. For durable architecture,
conventions, and the deployment pipeline checklist, see `CLAUDE.md`
instead — this file only covers what's transient.

## Not yet confirmed by the person (do this first if picking this back up)

Everything below was verified working via local browser preview (serving
the repo directly and driving it with Playwright — see CLAUDE.md's
"Local preview" section) during this session. **Nothing from this
session has touched Apps Script or GitHub-backed Save/Load for real** —
Tabbed Panels doesn't even have `AppScript/*.html` files yet (see below),
so there's nothing to paste-and-redeploy until that's built.

## What's built this session (not yet merged — see branch)

Started from a repo where CLAUDE.md/HANDOFF.md already existed (written
by the previous session) but no Tabbed Panels code did. This session:

- **Resolved the open design questions** CLAUDE.md flagged as needing
  settling before writing code:
  - Content model: a small block schema (`BLOCK_TYPES` in `tab-types.js`),
    not a plain rich-text blob per tab — same spirit as v2's
    `ELEMENT_TYPES`.
  - Rich text: hand-rolled contenteditable + mark-toggling, no
    third-party lib.
  - Block types: `heading`, `paragraph`, `list`, `button`, `separator`.
    Inline links (via a richtext `link` mark) and the standalone
    `button` block are deliberately two different things. No nested
    blocks (list items are flat richtext strings).
- **Built the full scaffold** at `tools/tabbed-panels/`: `tab-types.js`,
  `tab-manager.js`, `block-renderer.js`, `richtext-editor.js`,
  `history.js` (copied verbatim from v2 — fully generic, nothing to
  adapt), and `index.html` (top bar, left rail of add-block buttons, tab
  strip, block list as the live editable/preview surface, a
  schema-driven property drawer). See CLAUDE.md's "Tabbed Panels"
  section for the full architecture writeup.
- **Smoke-tested in local preview via Playwright**: all 5 block types
  add correctly with sane defaults, block selection opens the property
  drawer with schema-correct fields, rich-text editing live-updates the
  rendered block, tabs can be added/switched/persist their own block
  lists independently, and undo/redo both work. Only console noise was
  CDN unreachability (Font Awesome/Google Fonts) in the sandboxed test
  environment — expected per CLAUDE.md, not a code issue.
- **Registered a commented `PAGES` entry** in `AppScript/Code.gs` for
  `tabbed-panels` (status `'in development'`) — left commented since the
  `AppScript/TabbedPanels*.html` files it points to don't exist yet.
- **Updated CLAUDE.md**: replaced the old "Starting a new tool: Tabbed
  Panels" (open-questions) section with a real architecture writeup
  reflecting what actually got built, and updated the "Tools" bullet
  list.

## What's next: getting Tabbed Panels to parity with v2

In rough priority order:

1. **Export** — no self-contained HTML bundle yet. `block-renderer.js`
   is already authoring-unaware, so this is mostly: embed `tab-types.js`
   + `block-renderer.js` + the saved tab data + minimal tab-switching JS
   into a template, same shape as v2's Export modal, just without an SVG
   renderer/GSAP to carry along.
2. **Apps Script deployment** — do the 5-substitution pass (see
   CLAUDE.md's deployment pipeline section) to produce
   `AppScript/TabbedPanels.html` + the `*Js.html` module wrappers for
   `tab-types.js`/`tab-manager.js`/`block-renderer.js`/
   `richtext-editor.js`/`history.js`, then uncomment the `PAGES` entry.
   **Do a real Save/Load round-trip once deployed** — local preview
   can't exercise `google.script.run` at all, so Storage.saveProject/
   loadProject/renameProject/deleteProject are entirely unverified
   against the real backend so far.
3. Everything under "What's NOT built yet" in CLAUDE.md's Tabbed Panels
   section: touch/tablet drag-and-drop, accessibility pass, narrow-window
   layout — all standing gaps carried over from v2, not yet even looked
   at here.

## Older, still-outstanding items from earlier in the project

- GitHub → Apps Script auto-deploy via `clasp` — deferred at project
  start, never revisited. Now genuinely two tools' worth of
  `AppScript/*.html` files to hand-sync once Tabbed Panels is deployed,
  worth revisiting sooner rather than later.

## Where to find things

`CLAUDE.md` has the architecture (including Tabbed Panels' now-real
internal architecture section), conventions, the Apps Script deployment
pipeline checklist, and the local-preview workflow.
