/* ==========================================================================
   Tabbed Panels — Block Renderer
   Same role as Animated Slides v2's element-renderer.js: the one rendering
   path, used unmodified by both the authoring content area and the
   exported player. Never make this authoring-aware — it only reads plain
   block `data` objects and returns real DOM, no concept of selection or
   editing.

   Rich text fields (`content`, list `items`) are stored as sanitized HTML
   strings (see richtext-editor.js for how they're produced) and rendered
   via innerHTML — trusted the same way an author-supplied value already is
   everywhere else in this suite.
   ========================================================================== */

function renderBlock(data) {
  const schema = BLOCK_TYPES[data.type];
  if (!schema) throw new Error(`Unknown block type: ${data.type}`);

  const el = document.createElement('div');
  el.className = 'tp-block tp-block-' + data.type;
  el.dataset.blockId = data.id;

  switch (data.type) {
    case 'heading': {
      const tag = data.level === 'h3' ? 'h3' : 'h2';
      const h = document.createElement(tag);
      h.className = 'tp-heading';
      h.textContent = data.text || '';
      el.appendChild(h);
      break;
    }
    case 'paragraph': {
      const p = document.createElement('div');
      p.className = 'tp-paragraph';
      p.innerHTML = data.content || '';
      el.appendChild(p);
      break;
    }
    case 'list': {
      const listEl = document.createElement(data.style === 'numbered' ? 'ol' : 'ul');
      listEl.className = 'tp-list';
      (data.items || []).forEach((item) => {
        const li = document.createElement('li');
        li.innerHTML = item || '';
        listEl.appendChild(li);
      });
      el.appendChild(listEl);
      break;
    }
    case 'button': {
      const a = document.createElement('a');
      a.className = 'tp-button tp-button-' + (data.style || 'primary');
      a.textContent = data.label || '';
      a.href = data.url || '#';
      if (data.newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      el.appendChild(a);
      break;
    }
    case 'separator': {
      el.appendChild(document.createElement('hr'));
      break;
    }
  }

  return el;
}

/** Renders a tab's full block list into a container, replacing whatever
 *  was there. Simple full-rebuild rather than incremental diffing —
 *  there's no animation or drag state riding on individual block DOM
 *  nodes surviving a re-render (unlike v2's element nodes), so this stays
 *  cheap and correct rather than needing SlideManager-style careful
 *  in-place patching. */
function renderTabContent(tab, container) {
  container.innerHTML = '';
  tab.blocks.forEach((data) => container.appendChild(renderBlock(data)));
}
