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

  /* ---- Confirm/prompt dialogs ----
     Promise-based replacements for the browser's native confirm()/
     prompt() — those can't be styled at all (they're browser chrome, not
     part of the page), so they were the one place the UI broke from
     looking like a single, considered product. The modal is created
     lazily on first use and reused after that. */
  let _dialogResolve = null;

  function _ensureDialogModal() {
    if (document.getElementById('shell-dialog-modal')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'shell-dialog-modal';
    overlay.innerHTML = `
      <div class="modal-dialog" style="max-width:400px;">
        <div class="modal-header">
          <div><div class="title-block" id="shell-dialog-title-block">Confirm</div><h2 id="shell-dialog-heading"></h2></div>
        </div>
        <div class="modal-body">
          <p id="shell-dialog-message" style="color:var(--ink-soft); margin: 0 0 var(--space-4);"></p>
          <div class="field-group" id="shell-dialog-input-wrap" style="display:none;">
            <input type="text" id="shell-dialog-input" class="field-input-text">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="shell-dialog-cancel">Cancel</button>
          <button class="btn btn-primary" id="shell-dialog-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const resolveAndClose = (value) => {
      closeModal('shell-dialog-modal');
      if (_dialogResolve) { _dialogResolve(value); _dialogResolve = null; }
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) resolveAndClose(false); });
    document.getElementById('shell-dialog-cancel').addEventListener('click', () => resolveAndClose(false));
    document.getElementById('shell-dialog-ok').addEventListener('click', () => {
      const isPrompt = document.getElementById('shell-dialog-input-wrap').style.display !== 'none';
      resolveAndClose(isPrompt ? document.getElementById('shell-dialog-input').value : true);
    });
    document.getElementById('shell-dialog-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('shell-dialog-ok').click();
    });
  }

  function _showDialog({ heading, message, isPrompt, defaultValue, okLabel, danger }) {
    _ensureDialogModal();
    document.getElementById('shell-dialog-heading').textContent = heading;
    const msgEl = document.getElementById('shell-dialog-message');
    msgEl.textContent = message || '';
    msgEl.style.display = message ? '' : 'none';
    const inputWrap = document.getElementById('shell-dialog-input-wrap');
    const input = document.getElementById('shell-dialog-input');
    inputWrap.style.display = isPrompt ? '' : 'none';
    input.value = defaultValue || '';
    const okBtn = document.getElementById('shell-dialog-ok');
    okBtn.textContent = okLabel || 'OK';
    okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

    openModal('shell-dialog-modal');
    if (isPrompt) { input.focus(); input.select(); }

    return new Promise((resolve) => { _dialogResolve = resolve; });
  }

  /** Returns a Promise<boolean> — resolves true only if OK was clicked. */
  function confirmDialog(message, { heading = 'Are you sure?', okLabel = 'Confirm', danger = false } = {}) {
    return _showDialog({ heading, message, isPrompt: false, okLabel, danger });
  }

  /** Returns a Promise<string|false> — the entered text, or false if
   *  cancelled (never an empty string on OK — a blank submit resolves as
   *  cancelled too, since an empty name is never useful here). */
  function promptDialog(message, defaultValue = '', { heading = 'Enter a name', okLabel = 'OK' } = {}) {
    return _showDialog({ heading, message, isPrompt: true, defaultValue, okLabel })
      .then((val) => (val && String(val).trim()) ? String(val).trim() : false);
  }

  /* ---- Project browser ----
     projects: [{ name, updatedAt }], onSelect(name) fires on row click. */
  /** actions (optional): { onRename(oldName, newName), onDelete(name) } —
   *  omit entirely and this behaves exactly as before (row click = open,
   *  no action icons shown). Existing 3-arg call sites need no changes. */
  function renderProjectList(containerEl, projects, onSelect, actions) {
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

      const nameSpan = document.createElement('span');
      nameSpan.className = 'project-name';
      nameSpan.textContent = p.name;
      row.appendChild(nameSpan);

      const metaSpan = document.createElement('span');
      metaSpan.className = 'project-meta';
      metaSpan.textContent = p.updatedAt || '';
      row.appendChild(metaSpan);

      if (actions && (actions.onRename || actions.onDelete)) {
        const actionsWrap = document.createElement('span');
        actionsWrap.className = 'project-row-actions';

        if (actions.onRename) {
          const renameBtn = document.createElement('button');
          renameBtn.className = 'project-action-btn';
          renameBtn.title = 'Rename';
          renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
          renameBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newName = await promptDialog('', p.name, { heading: 'Rename project', okLabel: 'Rename' });
            if (newName && newName !== p.name) {
              actions.onRename(p.name, newName);
            }
          });
          actionsWrap.appendChild(renameBtn);
        }

        if (actions.onDelete) {
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'project-action-btn danger';
          deleteBtn.title = 'Delete';
          deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
          deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await confirmDialog(`Delete "${p.name}"? This can't be undone.`, { heading: 'Delete project', okLabel: 'Delete', danger: true });
            if (ok) actions.onDelete(p.name);
          });
          actionsWrap.appendChild(deleteBtn);
        }

        row.appendChild(actionsWrap);
      }

      row.addEventListener('click', (e) => {
        if (e.target.closest('.project-action-btn')) return; // action icons shouldn't also trigger "open"
        onSelect(p.name);
      });

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

  return { init, toast, openModal, closeModal, bindOverlayDismiss, renderProjectList, setStatus, confirm: confirmDialog, prompt: promptDialog };
})();
