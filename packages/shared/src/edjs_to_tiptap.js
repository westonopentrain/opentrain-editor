// Convert Editor.js documents to Tiptap JSON.
// Usage:
//   import { edjsToTiptap } from '@opentrain/shared';
//   const json = edjsToTiptap(editorJsDoc);
//   console.log(JSON.stringify(json, null, 2));

const stripHtml = (value = '') => String(value).replace(/<[^>]*>/g, '');

const textNode = (text = '') => ({ type: 'text', text });

const paragraphNode = ({ text = '', align, id }) => {
  const attrs = {};
  if (align) attrs.textAlign = align;
  if (id) attrs.id = id;
  const node = { type: 'paragraph', attrs: Object.keys(attrs).length ? attrs : undefined };
  const contentText = stripHtml(text);
  node.content = contentText ? [textNode(contentText)] : [];
  return node;
};

export function edjsToTiptap(doc = {}) {
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  const content = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const { type, data = {}, id } = block;
    const align = data.alignment || data.align;
    const nodeId = id || data.id;

    switch (type) {
      case 'header': {
        const level = Math.min(Math.max(Number(data.level) || 2, 1), 6);
        const attrs = { level };
        if (align) attrs.textAlign = align;
        if (nodeId) attrs.id = nodeId;
        const contentText = stripHtml(data.text || '');
        const node = {
          type: 'heading',
          attrs,
          content: contentText ? [textNode(contentText)] : [],
        };
        content.push(node);
        break;
      }
      case 'paragraph': {
        const node = paragraphNode({ text: data.text, align, id: nodeId });
        content.push(node);
        break;
      }
      case 'list': {
        const listType = data.style === 'ordered' ? 'orderedList' : 'bulletList';
        const listAttrs = {};
        if (align) listAttrs.textAlign = align;
        const items = Array.isArray(data.items)
          ? data.items.map((item) => ({
              type: 'listItem',
              content: [paragraphNode({ text: item })],
            }))
          : [];
        content.push({
          type: listType,
          attrs: Object.keys(listAttrs).length ? listAttrs : undefined,
          content: items,
        });
        break;
      }
      default:
        // Unsupported block type; skip.
        break;
    }
  }

  return { type: 'doc', content };
}

export default edjsToTiptap;
