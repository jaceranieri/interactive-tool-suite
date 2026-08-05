/* ==========================================================================
   Authoring Tools — Shared App Shell (behavior)
   Requires app-shell.css to be loaded. Each tool calls Shell.init() once,
   then uses Shell.toast / Shell.openModal / Shell.renderProjectList as
   needed. Keeps every tool's save/export/import chrome behaving identically.
   ========================================================================== */

const Shell = (() => {

  function init({ toolName, hubUrl } = {}) {
    // Build the toast stack container once per page.
    if (!document.getElementById('toast-stack')) {
      const stack = document.createElement('div');
      stack.id = 'toast-stack';
      document.body.appendChild(stack);
    }
    if (toolName) {
      const titleEl = document.querySelector('#top-bar .tool-identity h1');
      if (titleEl) titleEl.textContent = toolName;
    }
    if (hubUrl) {
      const hubLink = document.querySelector('#top-bar .hub-link');
      if (hubLink) hubLink.setAttribute('href', hubUrl);
    }
  }

  /* ---- Toasts ---- */
  // type: 'success' | 'danger' | 'pending' (default: neutral/ink)
  function toast(message, type = '', duration = 3200) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast${type ? ' ' + type : ''}`;
    el.textContent = message;
    stack.appendChild(el);
    if (type !== 'pending') {
      setTimeout(() => {
        el.style.transition = `opacity ${getVar('--duration-base', '250ms')}`;
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 250);
      }, duration);
    }
    return el; // caller can manually .remove() a 'pending' toast when done
  }

  function getVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v ? v.trim() : fallback;
  }

  /* ---- Modals ----
     Expects markup: <div class="modal-overlay" id="X-modal"><div class="modal-dialog">...</div></div>
     Clicking the overlay background (not the dialog) closes it. */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }
  function bindOverlayDismiss() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
      });
    });
  }

  /* ---- Project browser ----
     projects: [{ name, updatedAt }], onSelect(name) fires on row click. */
  function renderProjectList(containerEl, projects, onSelect) {
    containerEl.innerHTML = '';
    if (!projects || projects.length === 0) {
      containerEl.innerHTML = '<div class="project-empty">No projects yet — save one to see it here.</div>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'project-list';
    projects.forEach(p => {
      const row = document.createElement('div');
      row.className = 'project-row';
      row.innerHTML = `
        <span class="project-name">${escapeHtml(p.name)}</span>
        <span class="project-meta">${escapeHtml(p.updatedAt || '')}</span>
      `;
      row.addEventListener('click', () => onSelect(p.name));
      list.appendChild(row);
    });
    containerEl.appendChild(list);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---- Status pill (top bar connection indicator) ---- */
  function setStatus(text, state = '') {
    const pill = document.getElementById('shell-status');
    if (!pill) return;
    pill.className = `status-pill${state ? ' ' + state : ''}`;
    pill.innerHTML = `<span class="dot"></span>${escapeHtml(text)}`;
  }

  return { init, toast, openModal, closeModal, bindOverlayDismiss, renderProjectList, setStatus };
})();
