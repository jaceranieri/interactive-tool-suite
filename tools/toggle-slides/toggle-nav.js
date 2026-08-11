/* ==========================================================================
   Toggle Slides — Toggle Nav Bar
   The learner-facing button row — same "single implementation used by both
   the authoring preview and the export" rule as v2's nav-bar.js, and the
   same overflow/pagination model (buttons grouped into pages that each fit
   the visible width, left/right buttons move a page at a time).

   THE ONE REAL DIFFERENCE FROM v2's NAV BAR: v2's bar has exactly one
   active slide at a time (`activeIndexRef`, a single number) — clicking a
   button always means "switch to this one, deactivate whatever was
   active." This bar instead tracks a whole SET of currently-on buttons
   (`activeIdsRef`), and a click always means "flip THIS button's own
   on/off state" — every other button's state is left alone. That's the
   entire toggle-vs-navigate distinction this tool exists for, and it's
   confined to this one file plus ToggleManager.toggleButton(); everything
   else (pagination, styling, resize handling) is copied over unchanged
   from nav-bar.js.

   Buttons are tracked by id, not index, when checking active/inactive
   state, since (unlike v2's activeIndexRef) the set of "on" ids doesn't
   shift just because the button list was reordered.
   ========================================================================== */

function defaultNavStyle() {
  return {
    navPosition: 'bottom',   // 'top' | 'bottom'
    navGap: 12,
    buttonColor: '#0C5E82', buttonTextColor: '#ffffff', buttonBottomColor: '#094A68',
    buttonInactiveColor: '#DCEBF2', buttonInactiveTextColor: '#073048', buttonInactiveBottomColor: '#B8D4DF',
    buttonFontSize: 14, buttonFontWeight: '700', buttonPaddingX: 20, buttonPaddingY: 8, buttonRadius: 8,
  };
}

function styleNavButton(btn, isActive, navStyle) {
  btn.style.fontFamily = 'inherit';
  btn.style.fontWeight = navStyle.buttonFontWeight || '700';
  btn.style.fontSize = navStyle.buttonFontSize + 'px';
  btn.style.padding = navStyle.buttonPaddingY + 'px ' + navStyle.buttonPaddingX + 'px';
  btn.style.borderRadius = navStyle.buttonRadius + 'px';
  btn.style.border = 'none';
  btn.style.borderBottom = '4px solid ' + (isActive ? navStyle.buttonBottomColor : navStyle.buttonInactiveBottomColor);
  btn.style.background = isActive ? navStyle.buttonColor : navStyle.buttonInactiveColor;
  btn.style.color = isActive ? navStyle.buttonTextColor : navStyle.buttonInactiveTextColor;
  btn.style.cursor = 'pointer';
  btn.style.whiteSpace = 'nowrap';
  btn.style.transition = 'filter 0.15s';
}

const SIDE_BUTTON_RESERVE = 72; // px reserved for both side buttons combined, even while hidden, so layout doesn't jump when they appear

/**
 * Sets up the nav bar inside `container`. Returns a
 * `refresh(buttons, activeIds)` to call whenever the button list or which
 * buttons are on changes. `activeIds` is anything with a `.has(id)` method
 * (a Set works directly).
 */
function setupNavBar(container, navStyle, onToggle) {
  container.innerHTML = '';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  container.style.gap = '6px';
  container.style.width = '100%';

  const measureRow = document.createElement('div');
  measureRow.style.position = 'absolute';
  measureRow.style.visibility = 'hidden';
  measureRow.style.pointerEvents = 'none';
  measureRow.style.display = 'flex';
  measureRow.style.gap = navStyle.navGap + 'px';
  measureRow.style.whiteSpace = 'nowrap';

  const leftBtn = document.createElement('button');
  const rightBtn = document.createElement('button');
  [leftBtn, rightBtn].forEach((b) => {
    b.style.border = 'none'; b.style.background = 'none'; b.style.cursor = 'pointer';
    b.style.display = 'none'; b.style.flexShrink = '0'; b.style.fontSize = '20px';
    b.style.color = navStyle.buttonColor; b.style.padding = '4px 8px'; b.style.lineHeight = '1';
  });
  leftBtn.textContent = '‹';
  rightBtn.textContent = '›';
  leftBtn.setAttribute('aria-label', 'Previous buttons');
  rightBtn.setAttribute('aria-label', 'Next buttons');

  const pageRow = document.createElement('div');
  pageRow.style.display = 'flex';
  pageRow.style.gap = navStyle.navGap + 'px';
  pageRow.style.overflow = 'hidden'; // clips buttons mid-slide during the page-swap animation

  container.appendChild(measureRow);
  container.appendChild(leftBtn);
  container.appendChild(pageRow);
  container.appendChild(rightBtn);

  let buttonsRef = [];
  let activeIdsRef = new Set();
  let pages = [];          // array of arrays of button indices
  let currentPageIndex = 0;

  function computePages() {
    measureRow.innerHTML = '';
    const widths = buttonsRef.map((btn) => {
      const b = document.createElement('button');
      b.textContent = btn.label;
      styleNavButton(b, false, navStyle);
      measureRow.appendChild(b);
      return b.offsetWidth;
    });

    const available = (container.clientWidth || measureRow.offsetWidth) - SIDE_BUTTON_RESERVE;
    const gap = navStyle.navGap;
    const result = [];
    let page = [];
    let width = 0;
    widths.forEach((w, i) => {
      const added = page.length === 0 ? w : w + gap;
      if (width + added > available && page.length > 0) {
        result.push(page);
        page = [i];
        width = w;
      } else {
        page.push(i);
        width += added;
      }
    });
    if (page.length) result.push(page);
    pages = result.length ? result : [[]];
    if (currentPageIndex >= pages.length) currentPageIndex = pages.length - 1;
  }

  function makeButton(buttonIndex) {
    const toggleBtn = buttonsRef[buttonIndex];
    const isActive = activeIdsRef.has(toggleBtn.id);
    const btn = document.createElement('button');
    btn.className = 'nav-pill' + (isActive ? ' active' : '');
    btn.textContent = toggleBtn.label;
    styleNavButton(btn, isActive, navStyle);
    btn.setAttribute('aria-pressed', String(isActive));
    btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(0.95)'; });
    btn.addEventListener('mouseleave', () => { btn.style.filter = ''; });
    btn.addEventListener('click', () => onToggle(toggleBtn.id));
    return btn;
  }

  /** Renders whichever page is at `index`. Pass a `dir` (1 or -1) to
   *  animate the swap; omit it for an instant render (initial load,
   *  resize, refresh after a toggle — a toggle changes a button's own
   *  on/off look in place, not which page is showing, so it's always an
   *  instant re-render here, never a page transition). */
  function renderPage(index, dir) {
    const buttonIndices = pages[index] || [];

    if (dir === undefined) {
      pageRow.innerHTML = '';
      buttonIndices.forEach((i) => pageRow.appendChild(makeButton(i)));
      return;
    }

    const oldButtons = Array.from(pageRow.children);

    const showNewPage = () => {
      const newButtons = buttonIndices.map(makeButton);
      newButtons.forEach((b) => pageRow.appendChild(b));
      gsap.fromTo(newButtons,
        { opacity: 0 },
        { opacity: 1, duration: 0.22, stagger: 0.03, ease: 'power2.out' }
      );
    };

    if (oldButtons.length) {
      gsap.to(oldButtons, {
        opacity: 0, duration: 0.16, ease: 'power1.in',
        onComplete: () => { oldButtons.forEach((b) => b.remove()); showNewPage(); },
      });
    } else {
      showNewPage();
    }
  }

  function updateSideButtons() {
    leftBtn.style.display = currentPageIndex > 0 ? '' : 'none';
    rightBtn.style.display = currentPageIndex < pages.length - 1 ? '' : 'none';
  }

  function goToPage(newIndex) {
    if (newIndex < 0 || newIndex >= pages.length || newIndex === currentPageIndex) return;
    const dir = newIndex > currentPageIndex ? 1 : -1;
    currentPageIndex = newIndex;
    renderPage(currentPageIndex, dir);
    updateSideButtons();
  }

  leftBtn.addEventListener('click', () => goToPage(currentPageIndex - 1));
  rightBtn.addEventListener('click', () => goToPage(currentPageIndex + 1));

  const ro = new ResizeObserver(() => {
    if (!buttonsRef.length) return;
    computePages();
    renderPage(currentPageIndex);
    updateSideButtons();
  });
  ro.observe(container);

  function refresh(buttons, activeIds) {
    buttonsRef = buttons;
    activeIdsRef = activeIds || new Set();
    // Re-applied every refresh, not just at setup — otherwise changing the
    // gap setting later has no visible effect.
    pageRow.style.gap = navStyle.navGap + 'px';
    measureRow.style.gap = navStyle.navGap + 'px';
    computePages();
    // Unlike v2 (which follows a single active slide to whichever page
    // contains it), there's no single "current" button to chase here — an
    // arbitrary number can be on at once, so a refresh just re-renders
    // whatever page was already showing, in place.
    renderPage(currentPageIndex);
    updateSideButtons();
  }

  return { refresh };
}
