/* ==========================================================================
   Tables — Table Renderer
   Same role as Tabbed Panels' block-renderer.js: the one rendering path,
   used UNMODIFIED by both the authoring canvas and the exported player.
   Never make this authoring-aware — it only reads a plain table `data`
   object (see table-types.js for its shape) plus an optional `opts` for
   interaction hooks, and returns real DOM.

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
   ========================================================================== */

/** Attaches a hover/click tooltip icon to a cell. The popover itself is
 *  appended to document.body and positioned with `position: fixed` from
 *  the icon's own viewport rect — NOT appended inside the table's own
 *  scroll container, so it can't get clipped by that container's
 *  `overflow: auto` (needed for freeze/scrolling on a big table). */
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
 */
function renderTable(table, opts = {}) {
  const style = resolveTableStyle(table);

  const wrapper = document.createElement('div');
  wrapper.className = 'tbl-wrapper';
  wrapper.dataset.tableId = table.id;

  if (opts.showName !== false && table.name) {
    const heading = document.createElement('div');
    heading.className = 'tbl-name';
    heading.textContent = table.name;
    wrapper.appendChild(heading);
  }

  const scroller = document.createElement('div');
  scroller.className = 'tbl-scroller';
  if (table.freezeHeader) scroller.classList.add('tbl-freeze-header');
  if (table.freezeFirstCol) scroller.classList.add('tbl-freeze-col');

  const tableEl = document.createElement('table');
  tableEl.className = 'tbl-table';
  tableEl.style.setProperty('--tbl-border', style.borderColor);
  tableEl.style.setProperty('--tbl-header-bg', style.headerBg);
  tableEl.style.setProperty('--tbl-header-text', style.headerText);
  tableEl.style.setProperty('--tbl-cell-bg', style.cellBg);
  tableEl.style.setProperty('--tbl-cell-text', style.cellText);

  (table.rows || []).forEach((row, r) => {
    const tr = document.createElement('tr');
    let firstRealInRow = true;
    row.forEach((cell, c) => {
      if (cell === null) return; // covered by a previous cell's span — see table-types.js
      const isHeader = table.hasHeaderRow !== false && r === 0;
      const cellEl = document.createElement(isHeader ? 'th' : 'td');
      cellEl.className = 'tbl-cell';
      if ((cell.colSpan || 1) > 1) cellEl.colSpan = cell.colSpan;
      if ((cell.rowSpan || 1) > 1) cellEl.rowSpan = cell.rowSpan;
      if (r === 0 && table.freezeHeader) cellEl.classList.add('tbl-sticky-row');
      if (firstRealInRow && table.freezeFirstCol) cellEl.classList.add('tbl-sticky-col');
      firstRealInRow = false;
      if (opts.isSelected && opts.isSelected(r, c)) cellEl.classList.add('tbl-cell-selected');

      const textEl = document.createElement('span');
      textEl.className = 'tbl-cell-text';
      textEl.textContent = cell.text || '';
      cellEl.appendChild(textEl);

      if (cell.tooltip) attachCellTooltip(cellEl, cell.tooltip);

      if (opts.onCellClick) {
        cellEl.addEventListener('click', (e) => opts.onCellClick(r, c, e));
      }

      tr.appendChild(cellEl);
    });
    tableEl.appendChild(tr);
  });

  scroller.appendChild(tableEl);
  wrapper.appendChild(scroller);
  return wrapper;
}
