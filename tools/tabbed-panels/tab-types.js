/* ==========================================================================
   Tabbed Panels — Block Type Schema
   Same idea as Animated Slides v2's ELEMENT_TYPES: one declaration per
   block type, field lists drive the property panel and "add block" menu
   instead of hand-written per-type UI. block-renderer.js reads these same
   field names when drawing/updating a block's DOM node.

   Every block also has `id` and `type`, handled by the engine directly.
   Only what's specific to a type goes in its `fields`.

   Field type `richtext` is NOT a native input — see richtext-editor.js for
   the hand-rolled contenteditable + mark-toggling implementation. Its
   value is always a sanitized HTML string restricted to the tags implied
   by `inline` (b/i/u/a).

   Deliberate scope boundaries (see HANDOFF.md if reconsidering these):
   - No nested blocks — `list.items` is a flat array of richtext strings,
     not sub-blocks.
   - `heading` has no inline marks (plain text only) — a bold-in-the-middle
     heading was judged not worth the complexity.
   - Inline links (via richtext's `link` mark) and the standalone `button`
     block are deliberately two different things, not one collapsed onto
     the other — a link embedded mid-sentence and a standalone CTA read
     differently to a learner.
   ========================================================================== */

const BLOCK_TYPES = {

  heading: {
    label: 'Heading',
    icon: 'fa-heading',
    fields: {
      level: { type: 'select', label: 'Size', default: 'h2', options: [['h2', 'Large'], ['h3', 'Small']] },
      text:  { type: 'text',   label: 'Text',  default: 'Heading' },
    },
  },

  paragraph: {
    label: 'Text',
    icon: 'fa-align-left',
    fields: {
      content: { type: 'richtext', label: 'Text', default: '', inline: ['bold', 'italic', 'underline', 'link'] },
    },
  },

  list: {
    label: 'List',
    icon: 'fa-list-ul',
    fields: {
      style: { type: 'select', label: 'Style', default: 'bullet', options: [['bullet', 'Bulleted'], ['numbered', 'Numbered']] },
      items: { type: 'array',  label: 'Items',  default: [''], of: { type: 'richtext', inline: ['bold', 'italic', 'link'] } },
    },
  },

  button: {
    label: 'Button',
    icon: 'fa-link',
    fields: {
      label:  { type: 'text',    label: 'Label',        default: 'Learn more' },
      url:    { type: 'url',     label: 'Link URL',      default: '' },
      newTab: { type: 'boolean', label: 'Open in new tab', default: true },
      style:  { type: 'select',  label: 'Style',         default: 'primary', options: [['primary', 'Primary'], ['secondary', 'Secondary']] },
    },
  },

  separator: {
    label: 'Separator',
    icon: 'fa-minus',
    fields: {},
  },

};

/**
 * Builds a fresh block's data object from its schema defaults — this is
 * what "add block" calls. Keeps default-value logic in one place instead
 * of repeated inline object literals scattered through the editor.
 */
function makeDefaultBlock(type, id) {
  const schema = BLOCK_TYPES[type];
  if (!schema) throw new Error(`Unknown block type: ${type}`);

  const data = { id, type };
  Object.entries(schema.fields).forEach(([key, field]) => {
    // Arrays/objects need a fresh copy per block, not a shared reference
    // to the schema's own default value.
    data[key] = Array.isArray(field.default) ? [...field.default] : field.default;
  });
  return data;
}
