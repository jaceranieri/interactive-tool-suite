/* ==========================================================================
   Tables — Table Manager
   Owns the project state: an ordered list of tables, plus project-wide
   `layout` settings (side-by-side vs. carousel, tables-per-row). Same
   role as Tabbed Panels' TabManager, one level down — tables here are
   the top-level authored unit, the way tabs are there.

   Conventions carried over (see root CLAUDE.md):
   - Tables and rows/columns are addressed by stable `id` (tables) or by
     current index (grid rows/columns — a grid has no separate identity
     for "this row" the way a table does, so index is the only handle;
     every mutation below re-derives indices fresh rather than caching
     them across calls).
   - `tables` and `layout` are mutated in place, never reassigned — see
     setState().

   ---- Merge/unmerge and the grid-boundary rule ----
   table.rows is documented in table-types.js's header comment. Every
   row/column insertion or removal happens at a "boundary" (before row
   index N, or between columns N and N+1). If an existing merged cell's
   span currently crosses that boundary — e.g. a 2-row-tall cell sitting
   across the point where a new row is about to be inserted, or a column
   being deleted that a merged cell spans through — splicing the grid
   there would corrupt it (the cell's declared colSpan/rowSpan would no
   longer match how many real grid positions it actually covers).

   Per CLAUDE.md's instruction to pick the simpler of "reject" or
   "auto-unmerge" and document the choice: this file auto-unmerges. Any
   merged cell whose span crosses (or originates exactly on) the
   boundary being touched is reset back to plain 1x1 cells BEFORE the
   structural edit happens, via clearRowBoundary()/clearColBoundary().
   This means an add/remove-row/column can occasionally silently split
   a merge the author didn't ask to split — judged preferable to a
   modal-dialog "this would corrupt a merge, cancel?" interruption for
   what's meant to be a lightweight editing action; the author can just
   re-merge afterwards if that's what they wanted.
   ========================================================================== */

function defaultLayout() {
  return { mode: 'side-by-side', perRow: 2 };
}

function newId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function cloneTable(t) { return JSON.parse(JSON.stringify(t)); }

/* ---- Grid helpers (operate on a table's `rows` array directly) ---- */

/** Maps every grid position to the [r, c] of the real cell that "owns"
 *  it (itself, if it's already real) — the one piece of bookkeeping
 *  every other grid helper below is built on. */
function buildOwnerMap(rows) {
  const map = rows.map((row) => row.map(() => null));
  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell) return;
      const rs = cell.rowSpan || 1, cs = cell.colSpan || 1;
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (rows[r + dr] && map[r + dr]) map[r + dr][c + dc] = [r, c];
        }
      }
    });
  });
  return map;
}

/** Resets the merged cell owning (r, c) back to individual 1x1 cells —
 *  a no-op if it's already unmerged. Used both by the public
 *  unmergeCells() action and internally by the boundary-clearing
 *  helpers below. */
function unmergeCellAt(rows, ownerMap, r, c) {
  const owner = ownerMap[r] && ownerMap[r][c];
  if (!owner) return;
  const [r0, c0] = owner;
  const origin = rows[r0][c0];
  const rs = origin.rowSpan || 1, cs = origin.colSpan || 1;
  if (rs <= 1 && cs <= 1) return; // already a plain cell
  for (let dr = 0; dr < rs; dr++) {
    for (let dc = 0; dc < cs; dc++) {
      if (dr === 0 && dc === 0) continue;
      rows[r0 + dr][c0 + dc] = { text: '', tooltip: '', colSpan: 1, rowSpan: 1 };
    }
  }
  origin.rowSpan = 1;
  origin.colSpan = 1;
}

/** Unmerges any cell whose vertical span crosses the boundary just
 *  above row index `at` (i.e. between rows at-1 and at) — called before
 *  inserting or removing a row there. Rebuilds the owner map itself
 *  since callers may loop this. */
function clearRowBoundary(rows, at) {
  if (at <= 0 || at >= rows.length) return; // no interior boundary here
  const colCount = rows[0].length;
  for (let c = 0; c < colCount; c++) {
    const map = buildOwnerMap(rows);
    // A span crosses this boundary if the cell owning row `at-1`'s
    // column is the SAME origin as the one owning row `at`'s column.
    if (map[at][c] && map[at - 1][c] && map[at][c][0] === map[at - 1][c][0] && map[at][c][1] === map[at - 1][c][1]) {
      unmergeCellAt(rows, map, at, c);
    }
  }
}

/** Column equivalent of clearRowBoundary() — unmerges any cell whose
 *  horizontal span crosses the boundary just left of column index
 *  `at`. */
function clearColBoundary(rows, at) {
  const colCount = rows[0].length;
  if (at <= 0 || at >= colCount) return;
  for (let r = 0; r < rows.length; r++) {
    const map = buildOwnerMap(rows);
    if (map[r][at] && map[r][at - 1] && map[r][at][0] === map[r][at - 1][0] && map[r][at][1] === map[r][at - 1][1]) {
      unmergeCellAt(rows, map, r, at);
    }
  }
}

/** Unmerges every cell owning any position in row `index` — called
 *  right before that row is spliced out, so no dangling span references
 *  a row that no longer exists. */
function clearRow(rows, index) {
  const colCount = rows[0].length;
  for (let c = 0; c < colCount; c++) {
    const map = buildOwnerMap(rows);
    unmergeCellAt(rows, map, index, c);
  }
}

/** Column equivalent of clearRow(). */
function clearCol(rows, index) {
  for (let r = 0; r < rows.length; r++) {
    const map = buildOwnerMap(rows);
    unmergeCellAt(rows, map, r, index);
  }
}

function freshCell(text) { return { text: text || '', tooltip: '', colSpan: 1, rowSpan: 1 }; }

class TableManager {
  /**
   * @param tables [{ id, name, rows, themePreset, headerBg, headerText,
   *                   borderColor, accentColor, hasHeaderRow,
   *                   freezeHeader, freezeFirstCol }, ...]
   * @param layout optional — defaults via defaultLayout()
   */
  constructor({ tables, layout }) {
    this.tables = tables && tables.length ? tables : [makeDefaultTable(newId('table'), 'Table 1')];
    this.activeTableId = this.tables[0].id;
    this.layout = layout || defaultLayout(); // mutated in place — see setState
    this.onChange = () => {};
    // One-shot "just added" marker, same entrance-animation timing
    // pattern as Tabbed Panels' lastAddedTabId — set BEFORE onChange()
    // fires inside addTable/duplicateTable, not by the caller afterwards.
    this.lastAddedTableId = null;
  }

  getActiveTable() {
    return this.tables.find((t) => t.id === this.activeTableId) || this.tables[0];
  }

  setActiveTable(id) {
    if (!this.tables.some((t) => t.id === id) || id === this.activeTableId) return;
    this.activeTableId = id;
    this.onChange();
  }

  /* ---- Tables ---- */

  addTable(afterId = this.activeTableId) {
    const table = makeDefaultTable(newId('table'), 'Table ' + (this.tables.length + 1));
    const i = this.tables.findIndex((t) => t.id === afterId);
    this.tables.splice(i + 1, 0, table);
    this.activeTableId = table.id;
    this.lastAddedTableId = table.id;
    this.onChange();
    return table.id;
  }

  duplicateTable(id) {
    const i = this.tables.findIndex((t) => t.id === id);
    if (i === -1) return;
    const copy = cloneTable(this.tables[i]);
    copy.id = newId('table');
    copy.name = this.tables[i].name + ' copy';
    this.tables.splice(i + 1, 0, copy);
    this.activeTableId = copy.id;
    this.lastAddedTableId = copy.id;
    this.onChange();
    return copy.id;
  }

  renameTable(id, name) {
    const table = this.tables.find((t) => t.id === id);
    if (!table || !name) return;
    table.name = name;
    this.onChange();
  }

  deleteTable(id) {
    if (this.tables.length <= 1) return; // never delete the last table
    const i = this.tables.findIndex((t) => t.id === id);
    if (i === -1) return;
    const deletingActive = id === this.activeTableId;
    this.tables.splice(i, 1);
    if (deletingActive) this.activeTableId = this.tables[Math.min(i, this.tables.length - 1)].id;
    this.onChange();
  }

  /** Drag-to-reorder in the bottom bar — same shape as Tabbed Panels'
   *  moveTabAfter(). `targetId === null` moves it to the very front. */
  moveTableAfter(draggedId, targetId) {
    const from = this.tables.findIndex((t) => t.id === draggedId);
    if (from === -1 || draggedId === targetId) return;
    const [moved] = this.tables.splice(from, 1);
    if (targetId === null) { this.tables.unshift(moved); this.onChange(); return; }
    const targetIndex = this.tables.findIndex((t) => t.id === targetId);
    if (targetIndex === -1) { this.tables.splice(from, 0, moved); return; }
    this.tables.splice(targetIndex + 1, 0, moved);
    this.onChange();
  }

  /** Patches any of TABLE_FIELDS' non-grid keys (theme, colours, freeze
   *  flags, hasHeaderRow, name) on one table in one step. */
  updateTable(id, patch) {
    const table = this.tables.find((t) => t.id === id);
    if (!table) return;
    Object.assign(table, patch);
    this.onChange();
  }

  /* ---- Project-wide layout ---- */

  setLayout(patch) {
    Object.assign(this.layout, patch);
    this.onChange();
  }

  /* ---- Grid editing (rows/columns/cells) — all scoped to one table by id ---- */

  addRow(tableId, afterIndex) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) return;
    const at = afterIndex + 1;
    clearRowBoundary(table.rows, at);
    const colCount = table.rows[0].length;
    const row = Array.from({ length: colCount }, () => freshCell(''));
    table.rows.splice(at, 0, row);
    this.onChange();
  }

  removeRow(tableId, index) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table || table.rows.length <= 1) return; // keep at least one row
    clearRow(table.rows, index);
    table.rows.splice(index, 1);
    this.onChange();
  }

  addColumn(tableId, afterIndex) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) return;
    const at = afterIndex + 1;
    clearColBoundary(table.rows, at);
    table.rows.forEach((row) => row.splice(at, 0, freshCell('')));
    this.onChange();
  }

  removeColumn(tableId, index) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table || table.rows[0].length <= 1) return; // keep at least one column
    clearCol(table.rows, index);
    table.rows.forEach((row) => row.splice(index, 1));
    this.onChange();
  }

  setCellText(tableId, r, c, text) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table || !table.rows[r] || !table.rows[r][c]) return;
    table.rows[r][c].text = text;
    this.onChange();
  }

  setCellTooltip(tableId, r, c, tooltip) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table || !table.rows[r] || !table.rows[r][c]) return;
    table.rows[r][c].tooltip = tooltip;
    this.onChange();
  }

  /** Merges the rectangle [r1,c1]..[r2,c2] (inclusive, axis-aligned —
   *  the only shape merge/unmerge ever deals with) into one cell at its
   *  top-left corner. Any pre-existing merge that overlaps the new
   *  rectangle is unmerged first, so overlapping merges never compound
   *  into an inconsistent grid. The surviving cell keeps its own
   *  top-left text/tooltip; other cells' text in the rectangle is
   *  discarded — simplest predictable behavior, and the property panel
   *  warns before merging so this isn't a silent surprise. */
  mergeCells(tableId, r1, c1, r2, c2) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) return;
    const rows = table.rows;
    const rTop = Math.min(r1, r2), rBot = Math.max(r1, r2);
    const cLeft = Math.min(c1, c2), cRight = Math.max(c1, c2);
    if (rTop === rBot && cLeft === cRight) return; // single cell — nothing to merge

    for (let r = rTop; r <= rBot; r++) {
      for (let c = cLeft; c <= cRight; c++) {
        if (r === rTop && c === cLeft) continue;
        const map = buildOwnerMap(rows);
        unmergeCellAt(rows, map, r, c);
      }
    }
    const origin = rows[rTop][cLeft];
    origin.rowSpan = rBot - rTop + 1;
    origin.colSpan = cRight - cLeft + 1;
    for (let r = rTop; r <= rBot; r++) {
      for (let c = cLeft; c <= cRight; c++) {
        if (r === rTop && c === cLeft) continue;
        rows[r][c] = null;
      }
    }
    this.onChange();
  }

  /** Splits the merged cell owning (r, c) back into plain 1x1 cells. */
  unmergeCells(tableId, r, c) {
    const table = this.tables.find((t) => t.id === tableId);
    if (!table) return;
    const map = buildOwnerMap(table.rows);
    unmergeCellAt(table.rows, map, r, c);
    this.onChange();
  }

  /* ---- History integration ---- */

  getState() {
    return {
      activeTableId: this.activeTableId,
      tables: this.tables.map(cloneTable),
      layout: { ...this.layout },
    };
  }

  setState(snap) {
    this.tables.length = 0;
    snap.tables.forEach((t) => this.tables.push(cloneTable(t)));
    this.activeTableId = this.tables.some((t) => t.id === snap.activeTableId) ? snap.activeTableId : this.tables[0].id;
    this.lastAddedTableId = null; // a fresh load/undo/redo is never itself an "add"

    // In-place mutation, same reasoning as TabManager.setState() — and a
    // backfill for any layout key missing from an older saved project.
    const incomingLayout = snap.layout || defaultLayout();
    const defaults = defaultLayout();
    Object.keys(this.layout).forEach((k) => delete this.layout[k]);
    Object.keys(defaults).forEach((k) => {
      this.layout[k] = incomingLayout[k] !== undefined ? incomingLayout[k] : defaults[k];
    });

    this.onChange();
  }
}
