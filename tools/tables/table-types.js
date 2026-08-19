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
       - a real cell object: { text, tooltip, colSpan, rowSpan }
         (colSpan/rowSpan default to 1; tooltip is '' when unset)
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
  const cell = (text) => ({ text, tooltip: '', colSpan: 1, rowSpan: 1 });
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
