/* ==========================================================================
   Tabbed Panels — Tab Manager
   Owns the project state: an ordered list of tabs, each holding an ordered
   list of blocks. No canvas/SVG/animation layer to keep in sync here (that
   complexity in Animated Slides v2's SlideManager is specific to the
   cross-slide animated-transition mechanic, which this tool doesn't have),
   so this is considerably simpler: tabs/blocks are plain data, and the
   editor just re-renders the active tab's block list on any change.

   Conventions carried over from v2 (see CLAUDE.md):
   - Tabs and blocks are tracked by stable `id`, never by array index —
     indices shift the moment an array is spliced.
   - `tabs` is mutated in place (push/splice), never reassigned, since
     history.js's setState() and anything else holding a reference to it
     needs to keep seeing the same object.
   ========================================================================== */

function defaultTab(title) {
  return { id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), title, blocks: [] };
}

class TabManager {
  /** @param tabs [{ id, title, blocks: [{id, type, ...fields}, ...] }, ...] */
  constructor({ tabs }) {
    this.tabs = tabs && tabs.length ? tabs : [defaultTab('Tab 1')];
    this.activeTabId = this.tabs[0].id;
    this.onChange = () => {}; // hook for UI (tab strip, block list, property panel) to refresh
  }

  getActiveTab() {
    return this.tabs.find((t) => t.id === this.activeTabId) || this.tabs[0];
  }

  setActiveTab(id) {
    if (!this.tabs.some((t) => t.id === id) || id === this.activeTabId) return;
    this.activeTabId = id;
    this.onChange();
  }

  /* ---- Tabs ---- */

  addTab(afterId = this.activeTabId) {
    const tab = defaultTab('Tab ' + (this.tabs.length + 1));
    const i = this.tabs.findIndex((t) => t.id === afterId);
    this.tabs.splice(i + 1, 0, tab);
    this.activeTabId = tab.id;
    this.onChange();
    return tab.id;
  }

  duplicateTab(id) {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    const original = this.tabs[i];
    const copy = {
      id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: original.title + ' copy',
      blocks: original.blocks.map((b) => ({ ...b })),
    };
    this.tabs.splice(i + 1, 0, copy);
    this.activeTabId = copy.id;
    this.onChange();
  }

  renameTab(id, title) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab || !title) return;
    tab.title = title;
    this.onChange();
  }

  deleteTab(id) {
    if (this.tabs.length <= 1) return; // never delete the last tab
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i === -1) return;
    const deletingActive = id === this.activeTabId;
    this.tabs.splice(i, 1);
    if (deletingActive) {
      this.activeTabId = this.tabs[Math.min(i, this.tabs.length - 1)].id;
    }
    this.onChange();
  }

  /** Moves a tab to sit immediately after `targetId` (drag-and-drop reorder
   *  in the tab strip). No-op-safe against a vanished target. */
  moveTabAfter(draggedId, targetId) {
    const from = this.tabs.findIndex((t) => t.id === draggedId);
    if (from === -1 || draggedId === targetId) return;
    const [moved] = this.tabs.splice(from, 1);
    const targetIndex = this.tabs.findIndex((t) => t.id === targetId);
    if (targetIndex === -1) { this.tabs.splice(from, 0, moved); return; }
    this.tabs.splice(targetIndex + 1, 0, moved);
    this.onChange();
  }

  /* ---- Blocks (within the active tab) ---- */

  addBlock(type, afterBlockId = null) {
    const tab = this.getActiveTab();
    const id = 'block-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const block = makeDefaultBlock(type, id);
    const i = afterBlockId ? tab.blocks.findIndex((b) => b.id === afterBlockId) : tab.blocks.length - 1;
    tab.blocks.splice(i + 1, 0, block);
    this.onChange();
    return id;
  }

  updateBlock(blockId, patch) {
    const tab = this.getActiveTab();
    const block = tab.blocks.find((b) => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
    this.onChange();
  }

  deleteBlock(blockId) {
    const tab = this.getActiveTab();
    const i = tab.blocks.findIndex((b) => b.id === blockId);
    if (i === -1) return;
    tab.blocks.splice(i, 1);
    this.onChange();
  }

  /** Moves `draggedId` to sit immediately after `targetId` within the
   *  active tab's blocks — same drag-and-drop reorder pattern as
   *  moveTabAfter(), one level down. `targetId === null` moves it to the
   *  very front. */
  moveBlockAfter(draggedId, targetId) {
    const tab = this.getActiveTab();
    const from = tab.blocks.findIndex((b) => b.id === draggedId);
    if (from === -1 || draggedId === targetId) return;
    const [moved] = tab.blocks.splice(from, 1);
    if (targetId === null) { tab.blocks.unshift(moved); this.onChange(); return; }
    const targetIndex = tab.blocks.findIndex((b) => b.id === targetId);
    if (targetIndex === -1) { tab.blocks.splice(from, 0, moved); return; }
    tab.blocks.splice(targetIndex + 1, 0, moved);
    this.onChange();
  }

  /* ---- History integration: state spans every tab + which is active ---- */

  getState() {
    return {
      activeTabId: this.activeTabId,
      tabs: this.tabs.map((t) => ({ id: t.id, title: t.title, blocks: t.blocks.map((b) => ({ ...b })) })),
    };
  }

  setState(snap) {
    // Mutate `tabs` in place rather than reassign — same reference-identity
    // reasoning as slide-manager.js's setState(): anything holding a direct
    // reference to this array needs to see it update in place.
    this.tabs.length = 0;
    snap.tabs.forEach((t) => this.tabs.push({ id: t.id, title: t.title, blocks: t.blocks.map((b) => ({ ...b })) }));
    this.activeTabId = this.tabs.some((t) => t.id === snap.activeTabId) ? snap.activeTabId : this.tabs[0].id;
    this.onChange();
  }
}
