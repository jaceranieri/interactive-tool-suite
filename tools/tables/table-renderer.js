/* ==========================================================================
   Tables — Table Renderer
   Same role as Tabbed Panels' block-renderer.js: the one rendering path,
   used UNMODIFIED by both the authoring canvas and the exported player.
   Never make this authoring-aware — it only reads a plain table `data`
   object (see table-types.js for its shape) plus an optional `opts` for
   interaction hooks, and returns real DOM.

   Depends on richtext-editor.js's sanitizeRichHtml() being loaded first
   (cell text is sanitized again here at render time, regardless of
   source — see table-types.js's header comment) — index.html's
   <script src> order and the Export module list (fetchModuleSources())
   both load richtext-editor.js alongside this file for that reason.

   ---- Freeze + merged cells: the documented limitation ----
   freezeHeader/freezeFirstCol use plain CSS `position: sticky` on the
   real <th>/<td> elements that happen to sit in row 0 / the first
   rendered cell of each row. That's exact when the frozen row/column has
   no merges crossing it. When a merge DOES span across the frozen
   boundary (e.g. a header cell with rowSpan reaching past row 0, or a
   first-column cell absorbed into a merge from a neighboring column so
   nothing renders at column 0 in that row), sticky positioning is
   applied on a best-effort basis — whichever real cell renders first in
   the row still gets `tbl-sticky-col`, which may not visually be "the
   first column" once merges have shifted things. This was a deliberate
   scope decision (see root CLAUDE.md's instructions for this pass): not
   worth the complexity of a real column-tracking model for what's meant
   to be a secondary feature on already-small tables. It never crashes —
   worst case, freeze looks slightly off on a heavily-merged table.

   ---- Corner radius vs. cell borders (item 3, this pass) ----
   The outer rounding (`cornerRadius`) lives on `.tbl-scroller` — a
   wrapper with its own `border` + `border-radius` + `overflow: auto`
   (see index.html's/Export's stylesheet). Before this pass, EVERY cell
   also painted its own `border` on all four sides (needed for the
   internal grid lines), including the outward-facing side of the
   outermost ring of cells — so the outer boundary had TWO independent
   borders drawn by two different boxes at nearly the same position: the
   scroller's own (rounded, clipped as part of its own border-box) and
   the table's own collapsed outer cell border (square-cornered, a plain
   sibling/descendant box with no radius of its own). At the rounded
   corners specifically, that square inner cell-border corner and the
   smooth outer scroller-border arc don't align pixel-for-pixel, which
   read as the rounded border "cutting into" the table's own border line
   right at each corner.
   Fix (matches root CLAUDE.md's stated common fix): the outer boundary
   is now owned by exactly ONE box, the scroller. The outward-facing
   border on the outermost ring of cells is suppressed via CSS
   (`tr:first-child`/`tr:last-child`/first-and-last-`.tbl-cell`-in-row
   selectors — reliable here because a covered/`null` grid position
   never renders a `<td>`/`<th>` at all, see table-types.js, so the
   first/last REAL cell in a row is always the visual first/last column)
   whenever `rowSeparatorsOnly` is off; internal grid lines (the borders
   between adjacent cells) are completely untouched, only the four
   outward-facing edges lose their own border. `rowSeparatorsOnly` mode
   is deliberately excluded from this rule (see index.html's/Export's
   stylesheet) since it already has no scroller border to begin with and
   its own last-row bottom border is the intended separator line, not a
   redundant outer edge.
   NOTE, since this was the first hypothesis tried for item 7 too, worth
   recording so a future session doesn't re-try it: this same
   double-border removal does NOT fix item 7's stray-scrollbar bug.
   Verified directly — with resize handles removed, `.tbl-scroller`'s
   `scrollWidth` exactly equals its `clientWidth` whether or not the
   outer cell borders are present at all (tested both ways). The
   `border-collapse: collapse` cross-browser "painted border can exceed
   the layout box" quirk that seemed like a plausible cause for the
   scrollbar never actually manifested in this codebase — item 7's real,
   separately-verified cause is documented at the resize-handle creation
   site below, near `.tbl-col-resize-handle-last`.
   ========================================================================== */

/** Attaches a hover/click tooltip icon to a cell. The popover itself is
 *  appended to document.body and positioned with `position: fixed` from
 *  the icon's own viewport rect — NOT appended inside the table's own
 *  scroll container, so it can't get clipped by that container's
 *  `overflow: auto` (needed for freeze/scrolling on a big table). */
// Inline links (richtext's `link` mark, created via execCommand in
// richtext-editor.js) are stored as plain `<a href>` with no target —
// applied at render time instead of storage time, same reasoning and
// same function shape as Tabbed Panels' block-renderer.js's
// forceLinksToNewTab() (no shared module for it — see richtext-editor.js's
// header comment on why this file is a copy-adapt rather than a
// promotion).
function forceLinksToNewTab(container) {
  container.querySelectorAll('a').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
}

function attachCellTooltip(cellEl, text) {
  const icon = document.createElement('span');
  icon.className = 'tbl-tooltip-icon';
  icon.innerHTML = '<i class="fa-solid fa-circle-info"></i>';
  icon.tabIndex = 0;
  icon.setAttribute('role', 'button');
  icon.setAttribute('aria-label', 'More info');

  let popover = null;
  function show() {
    hide();
    popover = document.createElement('div');
    popover.className = 'tbl-tooltip-popover';
    popover.textContent = text;
    document.body.appendChild(popover);
    const rect = icon.getBoundingClientRect();
    popover.style.left = Math.round(rect.left) + 'px';
    popover.style.top = Math.round(rect.bottom + 6) + 'px';
  }
  function hide() {
    if (popover) { popover.remove(); popover = null; }
  }
  icon.addEventListener('mouseenter', show);
  icon.addEventListener('mouseleave', hide);
  icon.addEventListener('focus', show);
  icon.addEventListener('blur', hide);
  icon.addEventListener('click', (e) => { e.stopPropagation(); popover ? hide() : show(); });

  cellEl.appendChild(icon);
}

/**
 * @param table  a table data object (see table-types.js).
 * @param opts   optional:
 *   - onCellClick(r, c, event) — called when a cell (not its tooltip
 *     icon) is clicked. Authoring-only concern (cell selection lives
 *     entirely in index.html); Export never passes this.
 *   - isSelected(r, c) — returns true if (r, c) should render with the
 *     `.tbl-cell-selected` class. Authoring-only, same as onCellClick.
 *   - showName — false to omit the table's own name heading (Export's
 *     multi-table layout renders names itself via carousel-nav.js
 *     controls in some contexts); defaults to true.
 *   - forExport — true when this render is for the exported/embedded
 *     player rather than the authoring canvas. Currently unused by this
 *     function itself (kept for callers/future flags) — table.showTitle
 *     (see table-types.js) now applies unconditionally to every render
 *     call, authoring and Export alike, per this pass's item 5 (it used
 *     to be forExport-gated; see table-types.js's header comment on the
 *     rename from showTitleInExport). Never branch authoring-vs-export
 *     behavior into this file without a real reason — see file header on
 *     staying authoring-unaware.
 *   - onColResizeStart(event, colIndex, colSpan, cellEl) — called on
 *     `pointerdown` on a header-row (r === 0) cell's resize handle.
 *     Authoring-only, same as onCellClick: index.html is the only
 *     caller that passes this, so a plain presence check is what keeps
 *     the drag-resize LISTENERS out of Export/thumbnail renders (which
 *     never pass it) without this file needing its own forExport
 *     branch — same pattern onCellClick/isSelected already establish.
 *   - contentFontWeight — project-wide base font-weight for table
 *     content (item 8, this pass — see table-types.js's header comment
 *     for the full story). Defaults to 400 when omitted (thumbnail
 *     renders/older callers). Only sets the BASE/non-bold weight; the
 *     existing bodyBold/headerBold/per-cell cellBold overrides still
 *     always force 700 regardless of this value.
 */
function renderTable(table, opts = {}) {
  const style = resolveTableStyle(table);
  const baseWeight = String(opts.contentFontWeight != null ? opts.contentFontWeight : 400);

  const wrapper = document.createElement('div');
  wrapper.className = 'tbl-wrapper';
  wrapper.dataset.tableId = table.id;

  // Explicit per-table fixed width (item 1, this pass) — see
  // table-types.js's header comment for why `max-width: 100%` always
  // accompanies it (stops a width wider than the table's slot from
  // forcing the whole side-by-side/carousel stage wider).
  if (table.tableWidth != null) {
    wrapper.style.width = table.tableWidth + 'px';
    wrapper.style.maxWidth = '100%';
  }

  const showName = opts.showName !== false && table.name && table.showTitle !== false;
  if (showName) {
    const heading = document.createElement('div');
    heading.className = 'tbl-name';
    heading.textContent = table.name;
    wrapper.appendChild(heading);
  }

  const scroller = document.createElement('div');
  scroller.className = 'tbl-scroller';
  if (table.freezeHeader) scroller.classList.add('tbl-freeze-header');
  if (table.freezeFirstCol) scroller.classList.add('tbl-freeze-col');
  if (table.rowSeparatorsOnly) scroller.classList.add('tbl-row-sep-only');
  // Corner radius lives on this wrapper (overflow: auto already clips,
  // same as overflow: hidden would), not the <table> — border-radius on
  // a <table> with border-collapse: collapse doesn't clip reliably. Same
  // technique Tabbed Panels documents for its own .tp-table-wrapper.
  scroller.style.borderRadius = (table.cornerRadius != null ? table.cornerRadius : 8) + 'px';

  const tableEl = document.createElement('table');
  tableEl.className = 'tbl-table' + (table.rowSeparatorsOnly ? ' tbl-row-sep-only' : '');
  tableEl.style.setProperty('--tbl-border', style.borderColor);
  tableEl.style.setProperty('--tbl-header-bg', style.headerBg);
  tableEl.style.setProperty('--tbl-header-text', style.headerText);
  tableEl.style.setProperty('--tbl-cell-bg', style.cellBg);
  tableEl.style.setProperty('--tbl-cell-text', style.cellText);
  tableEl.style.setProperty('--tbl-body-padding', (table.cellPadding != null ? table.cellPadding : 9) + 'px');
  tableEl.style.setProperty('--tbl-header-padding', (table.headerPadding != null ? table.headerPadding : 9) + 'px');
  tableEl.style.setProperty('--tbl-body-size', (table.bodyTextSize != null ? table.bodyTextSize : 13) + 'px');
  tableEl.style.setProperty('--tbl-header-size', (table.headerTextSize != null ? table.headerTextSize : 13) + 'px');
  tableEl.style.setProperty('--tbl-body-align', table.bodyAlign || 'left');
  tableEl.style.setProperty('--tbl-header-align', table.headerAlign || 'left');
  tableEl.style.setProperty('--tbl-body-weight', table.bodyBold ? '700' : baseWeight);
  tableEl.style.setProperty('--tbl-header-weight', table.headerBold === false ? baseWeight : '700');

  // Column widths (see table-types.js's header comment for the shape) —
  // a <colgroup> applies per-column regardless of which row's cells
  // actually render at that index, which setting `width` on individual
  // <td>/<th> elements can't do cleanly once merges are involved. Only
  // built when at least one column has an explicit width; when none do,
  // the table keeps its normal width:100% / content-driven sizing (the
  // .tbl-table stylesheet rule), unchanged from before this feature.
  const colCount = (table.rows[0] || []).length;
  const colWidths = Array.isArray(table.colWidths) ? table.colWidths : [];
  const hasExplicitColWidths = colWidths.some((w) => w != null);
  if (hasExplicitColWidths) {
    // Real bug caught in this pass's own Playwright verification: the
    // first instinct was `tableEl.style.width = 'auto'` (shrink-to-fit,
    // like removing width:100% entirely) so a resize could grow the
    // table past its wrapper. That backfires the moment a table is
    // ALREADY stretched to fill a wide wrapper (the common case — most
    // tables have few enough columns that 100% width is wider than
    // their natural content) — switching to shrink-to-fit then SHRINKS
    // the whole table back down to content size, so a drag meant to
    // widen one column visually shrinks the table instead unless the
    // drag happens to exceed the wrapper's width. `min-width` avoids
    // this entirely: the table keeps its normal width:100% behaviour
    // (so it never gets SMALLER than before), but can never be squeezed
    // narrower than the sum of the columns an author has explicitly
    // pinned — so a resize either widens a column within the existing
    // 100% (reallocating space from other columns, same as leaving
    // width:100% alone always does) or, once the pinned sum exceeds the
    // wrapper's width, grows the whole table past 100% (the scroller's
    // existing `overflow: auto` already handles that case, same as any
    // naturally-too-wide table). Either way the table's rendered width
    // only ever grows-or-stays, never unexpectedly shrinks. table-layout
    // stays the default 'auto' — 'fixed' would force unset columns to
    // share leftover space evenly instead of sizing to their own
    // content, which isn't what "auto" should mean here.
    const explicitSum = colWidths.reduce((sum, w) => sum + (w != null ? w : 0), 0);
    tableEl.style.minWidth = explicitSum + 'px';
    const colgroup = document.createElement('colgroup');
    for (let c = 0; c < colCount; c++) {
      const col = document.createElement('col');
      if (colWidths[c] != null) col.style.width = colWidths[c] + 'px';
      colgroup.appendChild(col);
    }
    tableEl.appendChild(colgroup);
  }

  (table.rows || []).forEach((row, r) => {
    const tr = document.createElement('tr');
    let firstRealInRow = true;
    row.forEach((cell, c) => {
      if (cell === null) return; // covered by a previous cell's span — see table-types.js
      const isHeader = table.hasHeaderRow !== false && r === 0;
      const cellEl = document.createElement(isHeader ? 'th' : 'td');
      cellEl.className = 'tbl-cell';
      cellEl.dataset.row = r;
      cellEl.dataset.col = c;
      if ((cell.colSpan || 1) > 1) cellEl.colSpan = cell.colSpan;
      if ((cell.rowSpan || 1) > 1) cellEl.rowSpan = cell.rowSpan;
      if (r === 0 && table.freezeHeader) cellEl.classList.add('tbl-sticky-row');
      if (firstRealInRow && table.freezeFirstCol) cellEl.classList.add('tbl-sticky-col');
      firstRealInRow = false;
      if (opts.isSelected && opts.isSelected(r, c)) cellEl.classList.add('tbl-cell-selected');

      // Per-cell overrides (see table-types.js) — applied as inline
      // style so they win over the table-wide/theme CSS-custom-property
      // values regardless of whether this is a <td> or a themed <th>,
      // with no extra specificity gymnastics needed. Left unset (null/
      // undefined) means "inherit the table-wide value" — nothing to do.
      if (cell.cellBg) cellEl.style.background = cell.cellBg;
      if (cell.cellBold != null) cellEl.style.fontWeight = cell.cellBold ? '700' : baseWeight;
      if (cell.cellAlign) cellEl.style.textAlign = cell.cellAlign;

      const textEl = document.createElement('span');
      textEl.className = 'tbl-cell-text';
      // sanitizeRichHtml() also safely handles old-shape plain-string
      // cell.text (pre-richtext saved projects) — see table-types.js's
      // header comment.
      textEl.innerHTML = sanitizeRichHtml(cell.text || '');
      cellEl.appendChild(textEl);

      if (cell.tooltip) attachCellTooltip(cellEl, cell.tooltip);

      if (opts.onCellClick) {
        cellEl.addEventListener('click', (e) => opts.onCellClick(r, c, e));
      }

      // Column-width drag handle — header row only (one handle per real
      // rendered cell in row 0 is enough to cover every column boundary,
      // and a spanned header cell's handle resizing "the whole merged
      // block" is exactly the settled behaviour — see table-types.js).
      // Only attached when the caller wants authoring interactivity
      // (see this function's JSDoc on onColResizeStart).
      if (r === 0 && opts.onColResizeStart) {
        const handle = document.createElement('div');
        handle.className = 'tbl-col-resize-handle';
        // Item 7's actual root cause, fixed here — see this file's header
        // comment. The handle's CSS deliberately straddles its cell's
        // right edge (half in, half out) so its grab zone sits ON the
        // shared boundary between two columns. The LAST column has no
        // neighbour to its right to share a boundary with, so that same
        // straddle instead overshoots the table's own outer edge —
        // `.tbl-scroller`'s `overflow: auto` then reports that overshoot
        // as a permanent few-px horizontal scrollbar, even with zero
        // columns ever explicitly resized. `.tbl-col-resize-handle-last`
        // flushes just this one handle fully inside its cell instead
        // (no straddle needed — there's no neighbour to share with).
        if (c + (cell.colSpan || 1) - 1 >= colCount - 1) handle.classList.add('tbl-col-resize-handle-last');
        handle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          opts.onColResizeStart(e, c, cell.colSpan || 1, cellEl);
        });
        // Stop the handle's own click from also bubbling into
        // onCellClick above (a drag ends with a real 'click' event on
        // whatever's under the pointer, which is this handle).
        handle.addEventListener('click', (e) => e.stopPropagation());
        cellEl.appendChild(handle);
      }

      tr.appendChild(cellEl);
    });
    tableEl.appendChild(tr);
  });

  forceLinksToNewTab(tableEl);

  scroller.appendChild(tableEl);
  wrapper.appendChild(scroller);
  return wrapper;
}
