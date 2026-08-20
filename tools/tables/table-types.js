/* ==========================================================================
   Tables — Table-level Schema
   Same "packing list" idea as Tabbed Panels' tab-types.js BLOCK_TYPES,
   but here the schema describes fields on the TABLE itself (theme,
   colour overrides, freeze flags), not a per-row content block — Tables
   has no block concept, a table is the top-level authored unit.

   `rows` (the merged-cell grid) deliberately has NO entry in TABLE_FIELDS
   — a generic field-schema entry (text/select/color/boolean/array/...)
   doesn't fit a 2D grid with span data, so its shape is documented here
   directly instead, and table-manager.js's grid-mutation methods are the
   only code that touches it:

     table.rows is a 2D array — rows[r][c] is either:
       - a real cell object: { text, tooltip, colSpan, rowSpan, cellBg,
         cellBold } (colSpan/rowSpan default to 1; tooltip is '' when
         unset). `text` is now a SANITIZED RICH HTML STRING (bold/italic/
         link — see richtext-editor.js's ALLOWED_TAGS), not the plain
         string this field originally shipped as — the plain-text-only
         scope this file used to document here was reopened in a later
         interview once an author asked for inline bold/italic/hyperlinks
         inside cells. table-renderer.js sanitizes `text` again at render
         time regardless of source, so an old-shape saved project (`text`
         as a bare plain string, from before this change) still renders
         correctly with no separate migration step: a plain string with
         no tags round-trips through sanitizeRichHtml() unchanged.
         `tooltip` stays plain text (rendered via textContent, not
         innerHTML) — it's a dense hover/click aside, not prose worth
         formatting. `cellBg`/`cellBold` are per-cell overrides added
         this pass, same "null = not set, fall back to something else"
         convention TABLE_FIELDS already uses for headerBg/borderColor/
         accentColor: `cellBg` (hex string or null) wins over the table's
         theme/accent colour for that one cell when set; `cellBold`
         (true/false/null) sets that one cell's default font-weight,
         falling back to the table-wide `bodyBold` when null — a cell's
         OWN inline rich-text bold mark (from its richtext toolbar) still
         overrides either of these at the word level, same "variant sets
         default, inline mark overrides" split `bodyBold` already
         documents below. Both are undefined (not present as a key) on
         any cell object created before this pass — table-renderer.js and
         index.html's cell panel treat a missing key exactly like an
         explicit null, so no migration step is needed for older saved
         projects either. Unlike the colour overrides, there's currently
         no dedicated "reset to inherit" control for `cellBold` in the
         panel (only a plain on/off switch, see index.html) — a known,
         minor scope gap, see this pass's notes.
       - null, meaning this grid position is covered by an earlier cell's
         colSpan/rowSpan and renders no <td>/<th> at all — the covering
         cell's own colspan/rowspan attribute already accounts for the
         space, exactly how a real HTML <table> naturally skips cells
         under a span. table-renderer.js's renderTable() relies on this:
         it just skips `null` positions rather than doing any span math
         itself.
     Every row array has the same length (the table's column count) —
     table-manager.js's grid helpers are what keep that invariant true
     across every add/remove/merge/unmerge.

   Colour resolution (see resolveTableStyle() below) is table-manager's
   / table-renderer's shared concern, not something table-manager stores
   pre-computed — a table only ever stores its *choices* (theme preset
   name, optional override colours, optional accent colour), the same
   "instance picks a variant, something else defines what that variant
   looks like" split Tabbed Panels uses for its badge/button/table style
   variants.
   ========================================================================== */

// A small, fixed set of built-in theme presets (not user-extensible in
// this pass) — each table picks one as its baseline look, then can layer
// per-table colour overrides (or a single accent colour, see
// resolveTableStyle) on top.
const THEME_PRESETS = {
  bordered: {
    label: 'Bordered',
    headerBg: '#0C5E82', headerText: '#ffffff',
    borderColor: '#CBC8BE', cellBg: '#ffffff', cellText: '#1C2321',
  },
  plain: {
    label: 'Plain',
    headerBg: '#FAFAF8', headerText: '#1C2321',
    borderColor: '#FAFAF8', cellBg: '#ffffff', cellText: '#1C2321',
  },
  bold: {
    label: 'Bold',
    headerBg: '#14181A', headerText: '#ffffff',
    borderColor: '#14181A', cellBg: '#FAFAF8', cellText: '#1C2321',
  },
  soft: {
    label: 'Soft',
    headerBg: '#DCEBF2', headerText: '#073048',
    borderColor: '#CBC8BE', cellBg: '#ffffff', cellText: '#1C2321',
  },
};

// Fields on a table that aren't the grid itself — drives the "Table
// styles" side panel the same way BLOCK_TYPES[type].fields drives
// Tabbed Panels' property panel, minus `rows` (see file header).
const TABLE_FIELDS = {
  name:          { type: 'text',    label: 'Name',    default: 'Table' },
  themePreset:   { type: 'select',  label: 'Theme',   default: 'bordered', options: Object.entries(THEME_PRESETS).map(([k, v]) => [k, v.label]) },
  // Explicit per-table overrides. null = "not set, fall back to the
  // theme preset's colour" — kept null rather than defaulting to a copy
  // of the preset's colour so a table can be told apart from "author
  // picked this exact colour" vs. "author never touched it".
  headerBg:      { type: 'color',   label: 'Header background', default: null },
  headerText:    { type: 'color',   label: 'Header text',       default: null },
  borderColor:   { type: 'color',   label: 'Border colour',     default: null },
  // When set, this single colour DERIVES headerBg/headerText/borderColor
  // (see resolveTableStyle) — takes priority over the three explicit
  // overrides above while set, so the property panel disables those
  // three inputs whenever accentColor is non-null rather than letting
  // both mechanisms fight over the result.
  accentColor:   { type: 'color',   label: 'Accent colour',     default: null },
  hasHeaderRow:  { type: 'boolean', label: 'First row is a header', default: true },
  // Freeze is a secondary/occasional-table feature (see CLAUDE.md) and
  // is deliberately allowed to render best-effort rather than perfectly
  // when merged cells are present in the frozen row/column — see
  // table-renderer.js's header comment for the specific limitation.
  freezeHeader:    { type: 'boolean', label: 'Freeze header row',    default: false },
  freezeFirstCol:  { type: 'boolean', label: 'Freeze first column',  default: false },

  // Table-wide (NOT per-column/row/cell — a settled scope decision, see
  // root CLAUDE.md's interview notes) body formatting. A cell's own
  // inline rich-text marks (bold/italic from its toolbar) override these
  // at the word level, the same "variant sets default, instance-level
  // mark overrides" split Tabbed Panels uses for its heading styles —
  // an inline <b>/<strong> keeps its own bold weight regardless of what
  // bodyBold is set to, since the tag's own font-weight beats the
  // ancestor table's inherited one in the cascade with no extra CSS
  // needed to make that true.
  cornerRadius:  { type: 'number',  label: 'Corner radius',    default: 8,  min: 0, max: 40 },
  cellPadding:   { type: 'number',  label: 'Cell padding',     default: 9,  min: 0, max: 32 },
  bodyTextSize:  { type: 'number',  label: 'Body text size',   default: 13, min: 8, max: 32 },
  bodyAlign:     { type: 'select',  label: 'Body text align',  default: 'left', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
  bodyBold:      { type: 'boolean', label: 'Body bold',        default: false },

  // Header gets its OWN independent full set of the same controls —
  // settled as a fully separate group, NOT inherit-with-override, so a
  // header can look nothing like its body (or vice versa) without any
  // "reset to default" step.
  headerTextSize: { type: 'number',  label: 'Header text size',  default: 13, min: 8, max: 32 },
  headerAlign:    { type: 'select',  label: 'Header text align', default: 'left', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
  headerBold:     { type: 'boolean', label: 'Header bold',       default: true },
  headerPadding:  { type: 'number',  label: 'Header padding',    default: 9,  min: 0, max: 32 },

  // When on: vertical/outer borders disappear, only horizontal lines
  // between rows remain — including the line under the header row (the
  // header keeps its separator too, settled as not a fuller box).
  rowSeparatorsOnly: { type: 'boolean', label: 'Row separators only', default: false },

  // Authoring-only visibility toggle: the table's name/heading always
  // shows on the authoring canvas and bottom-bar thumbnails regardless
  // of this flag (the author needs it to tell tables apart while
  // editing) — it only controls whether Export's rendering omits it.
  // See table-renderer.js's renderTable() `forExport` opt for how the
  // two call sites (authoring vs. Export) stay on the exact same render
  // function without either one hard-coding the decision.
  showTitleInExport: { type: 'boolean', label: 'Show title in export', default: true },
};

/** Simple relative-luminance check so an accent colour's derived header
 *  text stays legible against it — no need for anything more precise
 *  than "light background gets dark text, dark background gets white
 *  text" at this scale. */
function contrastTextColor(hex) {
  const clean = (hex || '').replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

/** Resolves a table's actual effective colours from theme + overrides +
 *  accent, in that priority order (accent wins whenever set). Pure
 *  function of the table's own fields — used by both table-renderer.js
 *  (to paint the real table) and index.html (to preview the Styles
 *  panel's disabled/enabled override inputs). */
function resolveTableStyle(table) {
  const preset = THEME_PRESETS[table.themePreset] || THEME_PRESETS.bordered;
  let headerBg = table.headerBg || preset.headerBg;
  let headerText = table.headerText || preset.headerText;
  let borderColor = table.borderColor || preset.borderColor;
  if (table.accentColor) {
    headerBg = table.accentColor;
    headerText = contrastTextColor(table.accentColor);
    borderColor = table.accentColor;
  }
  return { headerBg, headerText, borderColor, cellBg: preset.cellBg, cellText: preset.cellText };
}

/** A fresh 2x2 grid of real (unmerged) cells — the starting point for a
 *  brand-new table, same "Header 1/Header 2/Cell 1/Cell 2" shape
 *  Tabbed Panels' table block defaults to. */
function makeDefaultRows() {
  const cell = (text) => ({ text, tooltip: '', colSpan: 1, rowSpan: 1, cellBg: null, cellBold: null });
  return [
    [cell('Header 1'), cell('Header 2')],
    [cell('Cell 1'), cell('Cell 2')],
  ];
}

/** Builds a fresh table's data object from TABLE_FIELDS defaults, same
 *  role as tab-types.js's makeDefaultBlock() — keeps default-value logic
 *  in one place instead of scattered object literals. */
function makeDefaultTable(id, name) {
  const data = { id, rows: makeDefaultRows() };
  Object.entries(TABLE_FIELDS).forEach(([key, field]) => {
    data[key] = field.default;
  });
  if (name) data.name = name;
  return data;
}
