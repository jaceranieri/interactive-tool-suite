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

   ---- Collapsed-mode peek + slide (added this pass) ----
   Collapsed mode ('carousel' or narrow side-by-side) no longer hides
   every non-active table with `display: none`. Instead all items stay
   in one `.cn-grid` flex row inside an `overflow: hidden` `.cn-viewport`,
   each sized to `container width - PEEK*2` px, and the whole row is
   `translateX`'d so the active item's left edge sits PEEK px in from the
   viewport's left edge — which puts a PEEK-ish sliver of the previous
   item's right edge in view to the left, and (since items are laid out
   left-to-right with GAP px between them) a sliver of the next item's
   left edge in view to the right. Recomputed on every applyState() call
   (selection change, nav click, or the existing ResizeObserver firing),
   so it stays correct across resizes without a separate code path.
   Prev/next just changes `activeIndex` and re-renders — the CSS
   `transition: transform` on `.cn-grid` (see index.html / Export's
   embedded style, guarded under prefers-reduced-motion same as every
   other micro-animation in this suite) is what makes that read as a
   slide instead of a jump cut. Peeking neighbours get a lower opacity
   (`.cn-item-peek`, same transition) so the strip reads as one
   continuous physical object sliding past a window, not disconnected
   tables. At the first/last table there's simply nothing to peek on
   that side — the viewport just shows blank space, which reads the same
   as normal edge padding.
   ========================================================================== */

const CAROUSEL_BREAKPOINT = 620; // px — below this, side-by-side collapses to single-table display
const CAROUSEL_PEEK = 36;  // px — how much of a neighbouring table peeks in at each edge
const CAROUSEL_GAP = 12;   // px — gap between items in the collapsed flex strip

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

  // ---- Real bug fix (Previous not sliding smoothly) ----
  // Every call to this function throws away and rebuilds the ENTIRE
  // `.cn-grid` — a brand-new element every time a table is selected
  // (index.html's onChange re-renders the whole stage on essentially
  // every state change, including plain prev/next navigation). A CSS
  // `transition: transform` has nothing to animate FROM on a freshly
  // inserted node — there's no committed "before" style yet. Verified
  // by sampling getComputedStyle(grid).transform every 25ms across a
  // real click in a real browser: in BOTH directions the strip actually
  // animates from translateX(0) (the browser's default identity
  // transform for a node that's never had one set), never from the
  // table's real prior on-screen offset. Going from table 0 (true
  // offset ~+36px, already close to 0) to table 1, animating from 0
  // instead of 36 is imperceptible — reads as "Next works". Going back
  // from table 1 (true offset e.g. -976px) to table 0 (+36px), animating
  // from 0 instead of -976 is a completely different, far shorter
  // motion — the strip barely nudges from ~0 to +36 instead of sliding
  // the full distance back, which is exactly the reported "Previous
  // doesn't slide smoothly" (it's not asymmetric transform math — the
  // offset formula below has always been direction-agnostic; it's a
  // rebuild-loses-continuity bug that only *looks* direction-specific
  // because of where index 0's offset happens to sit relative to 0).
  //
  // Fix: since the grid element can't be preserved across this
  // rebuild (structural re-render, not just a reposition), manually
  // replay what the browser would have done for free had the node
  // persisted — paint the LAST known real offset first, force a style
  // flush so it's committed as the transition's start value, then set
  // the real target. `_cnLastOffset`/`_cnWasCollapsed` live on the
  // container itself so they survive `container.innerHTML = ''` below.
  const prevOffset = container._cnLastOffset;
  const prevWasCollapsed = !!container._cnWasCollapsed;
  let isFirstApply = true;

  container.innerHTML = '';
  container.className = 'cn-layout';

  // .cn-viewport clips the collapsed-mode flex strip so peeking
  // neighbours (which deliberately extend past the visible width) don't
  // widen the page — side-by-side mode doesn't need clipping (nothing
  // overflows), but leaving it on is harmless there too.
  const viewport = document.createElement('div');
  viewport.className = 'cn-viewport';
  const grid = document.createElement('div');
  grid.className = 'cn-grid';
  const items = tables.map((table, i) => {
    const item = document.createElement('div');
    item.className = 'cn-item';
    item.appendChild(renderItem(table, i));
    grid.appendChild(item);
    return item;
  });
  viewport.appendChild(grid);
  container.appendChild(viewport);

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
    const containerWidth = container.clientWidth;
    const narrow = containerWidth > 0 && containerWidth < CAROUSEL_BREAKPOINT;
    const collapsed = isCarouselMode || narrow;

    container.classList.toggle('cn-collapsed', collapsed);

    if (!collapsed) {
      grid.style.gridTemplateColumns = `repeat(${Math.max(1, layout.perRow || 2)}, 1fr)`;
      grid.style.transform = '';
      items.forEach((item) => {
        item.style.flexBasis = '';
        item.classList.remove('cn-item-active', 'cn-item-peek');
      });
      container._cnWasCollapsed = false;
    } else {
      grid.style.gridTemplateColumns = '';
      // Each item is sized to leave PEEK px of viewport on both sides
      // for the active item; see the file-header comment for the slide
      // math this feeds.
      const itemWidth = Math.max(0, containerWidth - CAROUSEL_PEEK * 2);
      items.forEach((item, i) => {
        item.style.flexBasis = itemWidth + 'px';
        item.classList.toggle('cn-item-active', i === activeIndex);
        item.classList.toggle('cn-item-peek', i !== activeIndex);
      });
      const offset = CAROUSEL_PEEK - activeIndex * (itemWidth + CAROUSEL_GAP);

      // Establish the transition's real start point — see the file-header
      // comment above for why this is needed at all. Only on the very
      // first applyState() call after this fresh grid was created (a
      // later call, e.g. from the ResizeObserver, is operating on a node
      // that already has a real committed transform from this same
      // render pass, so a normal CSS transition already works on it).
      if (isFirstApply && prevWasCollapsed && prevOffset != null && prevOffset !== offset) {
        grid.style.transition = 'none';
        grid.style.transform = `translateX(${prevOffset}px)`;
        grid.getBoundingClientRect(); // force a style/layout flush so the line above is committed, not coalesced away
        grid.style.transition = '';
      }
      grid.style.transform = `translateX(${offset}px)`;
      container._cnLastOffset = offset;
      container._cnWasCollapsed = true;
    }
    isFirstApply = false;

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
