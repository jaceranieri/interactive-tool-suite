/* ==========================================================================
   Tables — Carousel / Side-by-side Layout Switcher
   Same role as Tabbed Panels' tab-nav.js: the learner-facing layout
   mechanism, used UNMODIFIED by both the authoring canvas and the
   exported player, so what an author sees while editing is what a
   learner actually gets.

   Two author-chosen base modes (project.layout.mode):
   - 'side-by-side' — every table renders at once in a CSS grid,
     `layout.perRow` columns wide.
   - 'carousel' — one table visible at a time, with prev/next controls.

   Below CAROUSEL_BREAKPOINT, 'side-by-side' automatically collapses to
   the same single-table-plus-arrows presentation carousel mode always
   uses — a responsive CSS/JS fallback, NOT a third authored mode (see
   root CLAUDE.md's brief for this tool). A ResizeObserver on the
   container re-evaluates this on every resize, so an Articulate embed
   that's narrow at publish time (or gets resized later) collapses
   automatically without the author doing anything.
   ========================================================================== */

const CAROUSEL_BREAKPOINT = 620; // px — below this, side-by-side collapses to single-table display

/**
 * @param container   element to render into (children replaced each call).
 * @param tables      [{ id, ... }, ...] — the full table list, in order.
 * @param layout      { mode: 'side-by-side'|'carousel', perRow }.
 * @param renderItem  (table, index) => DOM node — how to render one
 *                     table's content (index.html/Export both pass a
 *                     small wrapper around table-renderer.js's
 *                     renderTable()).
 * @param activeIndex which table is "current" while collapsed to a
 *                     single visible table (ignored, but still tracked,
 *                     in the uncollapsed side-by-side grid).
 * @param onNavigate   (newIndex) => void — called when prev/next is
 *                     clicked; the caller re-invokes this render function
 *                     with the updated activeIndex (same stateless-
 *                     render-function pattern as tab-nav.js's onSelect).
 */
function renderTablesLayout(container, { tables, layout, renderItem, activeIndex, onNavigate }) {
  // A stray leftover ResizeObserver from a previous render would keep
  // firing against a container whose children just got wiped — always
  // disconnect before rebuilding.
  if (container._cnResizeObserver) { container._cnResizeObserver.disconnect(); container._cnResizeObserver = null; }
  if (container._cnResizeListener) { window.removeEventListener('resize', container._cnResizeListener); container._cnResizeListener = null; }

  container.innerHTML = '';
  container.className = 'cn-layout';

  const grid = document.createElement('div');
  grid.className = 'cn-grid';
  const items = tables.map((table, i) => {
    const item = document.createElement('div');
    item.className = 'cn-item';
    item.appendChild(renderItem(table, i));
    grid.appendChild(item);
    return item;
  });
  container.appendChild(grid);

  const nav = document.createElement('div');
  nav.className = 'cn-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'cn-nav-btn';
  prevBtn.setAttribute('aria-label', 'Previous table');
  prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
  const counter = document.createElement('span');
  counter.className = 'cn-nav-counter';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'cn-nav-btn';
  nextBtn.setAttribute('aria-label', 'Next table');
  nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
  prevBtn.addEventListener('click', () => onNavigate(Math.max(0, activeIndex - 1)));
  nextBtn.addEventListener('click', () => onNavigate(Math.min(tables.length - 1, activeIndex + 1)));
  nav.appendChild(prevBtn);
  nav.appendChild(counter);
  nav.appendChild(nextBtn);
  container.appendChild(nav);

  function applyState() {
    const isCarouselMode = layout.mode === 'carousel';
    const narrow = container.clientWidth > 0 && container.clientWidth < CAROUSEL_BREAKPOINT;
    const collapsed = isCarouselMode || narrow;

    container.classList.toggle('cn-collapsed', collapsed);
    grid.style.gridTemplateColumns = collapsed ? '1fr' : `repeat(${Math.max(1, layout.perRow || 2)}, 1fr)`;
    items.forEach((item, i) => { item.style.display = collapsed && i !== activeIndex ? 'none' : ''; });

    const showNav = collapsed && tables.length > 1;
    nav.style.display = showNav ? 'flex' : 'none';
    if (showNav) {
      prevBtn.disabled = activeIndex <= 0;
      nextBtn.disabled = activeIndex >= tables.length - 1;
      counter.textContent = `${activeIndex + 1} / ${tables.length}`;
    }
  }

  applyState();

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(applyState);
    ro.observe(container);
    container._cnResizeObserver = ro;
  } else {
    // Fallback for an environment without ResizeObserver — still
    // responds to viewport resizes, just not to the container itself
    // being resized by something other than the window (e.g. a
    // dynamically-resized embed iframe), which is a smaller gap.
    window.addEventListener('resize', applyState);
    container._cnResizeListener = applyState;
  }
}
