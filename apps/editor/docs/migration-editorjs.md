# Migrating from Editor.js

Use the shared conversion helpers from `@opentrain/shared` to convert existing Editor.js content into Tiptap-compatible formats.

## 1. Convert to HTML

`edjsToHtml(blocks)` accepts the `blocks` array from an Editor.js document and returns sanitized HTML strings for supported block types (header, paragraph, list). Alignment metadata is translated into inline styles so the HTML renders as expected when loaded via the editor's `load` message.

### Example

```js
import { edjsToHtml } from '@opentrain/shared';

const html = edjsToHtml(editorJsData.blocks);
// Send to the editor: postMessage({ type: 'load', html })
```

## 2. Convert to Tiptap JSON

`edjsToTiptap(doc)` accepts the full Editor.js document (with `time`, `version`, `blocks`). It outputs a Tiptap-compatible JSON object with a `type: 'doc'` root, `content`, and alignment attributes preserved via `attrs.textAlign`.

- Heading and paragraph blocks copy the Editor.js `id` into `attrs.id` when present.
- List blocks convert into Tiptap bullet or ordered lists with list items.

### Example

```js
import { edjsToTiptap } from '@opentrain/shared';

const tiptapJson = edjsToTiptap(editorJsData);
// Send to the editor: postMessage({ type: 'load', json: tiptapJson })
```

## 3. Loading Converted Content

1. Run the conversion script server-side or in a build step.
2. Store the resulting JSON or HTML in Bubble.
3. Use the Bubble plugin actions `load_json` or `load_html` to inject the converted content into the editor.

## 4. Unsupported Blocks

Blocks not covered by the helpers (e.g., embeds, code, raw HTML) require manual mapping. Extend the helper functions to map additional `block.type` values to the corresponding Tiptap nodes.
