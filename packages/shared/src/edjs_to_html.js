// Convert Editor.js blocks to HTML.
// Usage:
//   import { edjsToHtml } from '@opentrain/shared';
//   const html = edjsToHtml(editorJs.blocks);
//   console.log(html);

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const wrapWithAlign = (html, align) => {
  if (!align) return html;
  return `<div style="text-align:${align}">${html}</div>`;
};

export function edjsToHtml(blocks = []) {
  const parts = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const { type, data = {} } = block;
    const align = data.alignment || data.align;

    switch (type) {
      case 'header': {
        const level = Math.min(Math.max(Number(data.level) || 2, 1), 6);
        const content = `<h${level}>${escapeHtml(data.text || '')}</h${level}>`;
        parts.push(wrapWithAlign(content, align));
        break;
      }
      case 'paragraph': {
        const content = `<p>${escapeHtml(data.text || '')}</p>`;
        parts.push(wrapWithAlign(content, align));
        break;
      }
      case 'list': {
        const tag = data.style === 'ordered' ? 'ol' : 'ul';
        const items = Array.isArray(data.items)
          ? data.items.map((item) => `<li>${escapeHtml(item || '')}</li>`).join('')
          : '';
        const content = `<${tag}>${items}</${tag}>`;
        parts.push(wrapWithAlign(content, align));
        break;
      }
      default:
        // Unsupported block type; skip.
        break;
    }
  }

  return parts.join('\n');
}

export default edjsToHtml;
